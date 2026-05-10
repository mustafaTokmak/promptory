import {
  addPrompt,
  getPromptCount,
  markReviewPromptShown,
  getSettings,
  getOrCreateClientId,
  saveGclid,
  markGclidReported,
  getPendingUploadPrompts,
  markPromptUploaded,
} from '../lib/storage';
import { track, type AnalyticsEvent, type AnalyticsParams } from '../lib/analytics';
import { scrubPii } from '../lib/pii';
import type { CaptureMessage, Prompt } from '../lib/types';

const API_BASE = 'https://api.promptory.chat';

// Per-install fallback timer state. If the bridge tab's content script
// never reports back (offline, promptory.chat blocked, slow load) we
// force-swap the tab to the welcome page after BRIDGE_FALLBACK_MS so
// the user isn't stranded on a spinner.
const BRIDGE_FALLBACK_MS = 6000;
const bridgeFallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();

const FLUSH_BATCH_SIZE = 10;
const FLUSH_ALARM_NAME = 'promptory-flush-uploads';
const FLUSH_PERIOD_MINUTES = 30;

let flushInFlight = false;

/**
 * Returns true if browser-reported network conditions look healthy enough
 * to attempt a flush. Skipping early on bad networks saves wasted bytes,
 * battery, and false-failure log noise — the chrome.alarms tick + 'online'
 * event will pick up the flush later when conditions improve.
 *
 * The Network Information API (navigator.connection) isn't universally
 * supported (Firefox lags); we treat undefined as "go ahead" so absence
 * never blocks an upload.
 */
function networkLooksUsable(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') {
    return false;
  }
  return true;
}

/**
 * Drains the pending upload queue in batches of FLUSH_BATCH_SIZE.
 * Idempotent and safe to call from many triggers (capture, startup, alarm,
 * online event) — flushInFlight guard prevents concurrent runs from
 * stacking. On HTTP failure the batch stays 'pending' (each row
 * untouched), so the next flush retries automatically.
 */
async function flushPendingUploads(): Promise<void> {
  if (flushInFlight) return;
  if (!networkLooksUsable()) return;

  const settings = await getSettings();
  if (!settings.consentGiven) return;

  const batch: Prompt[] = await getPendingUploadPrompts(FLUSH_BATCH_SIZE);
  if (batch.length === 0) return;

  flushInFlight = true;
  try {
    const clientId = await getOrCreateClientId();
    const items = batch.map((p) => {
      const promptScrub = scrubPii(p.promptText);
      const responseScrub = scrubPii(p.responseText);
      return {
        captured_at: p.timestamp,
        platform: p.platform,
        prompt_text: promptScrub.clean,
        response_text: responseScrub.clean,
        thread_id: p.threadId || undefined,
        is_regenerated: p.isRegenerated,
        pii_detected: promptScrub.count + responseScrub.count > 0,
      };
    });

    const res = await fetch(`${API_BASE}/v1/prompts/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, prompts: items }),
    });

    if (!res.ok) {
      console.warn(
        '[Promptory] /v1/prompts/batch returned',
        res.status,
        await res.text().catch(() => ''),
      );
      return; // rows stay 'pending'; next flush will retry
    }

    // All rows accepted — mark them sent. Sequential to keep IndexedDB
    // writes ordered; batch is small (≤10) so no perf concern.
    for (const p of batch) {
      await markPromptUploaded(p.id);
    }

    // If more pending exists, schedule another flush immediately. Avoids
    // sitting on a backlog for 30min when the user has 50+ queued (e.g.
    // returning from a week of offline use).
    const more = await getPendingUploadPrompts(1);
    if (more.length > 0) {
      // Microtask gap before next call so flushInFlight resets cleanly.
      setTimeout(() => {
        void flushPendingUploads();
      }, 0);
    }
  } catch (err) {
    console.warn('[Promptory] flushPendingUploads error', err);
  } finally {
    flushInFlight = false;
  }
}

export default defineBackground(() => {
  console.log('[Promptory] Background service worker started');

  // Chrome / Edge expose chrome.sidePanel; Firefox uses sidebar_action and
  // has no equivalent JS API. Feature-detect so the background worker
  // doesn't throw on Firefox boot.
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) =>
        console.error('[Promptory] Failed to set side panel behavior', err),
      );
  }

  // ── Community upload flush triggers ─────────────────────────────────────
  //
  // Three paths into flushPendingUploads() in addition to per-capture:
  //   1. Service-worker startup — drains anything left from a prior session
  //      that died mid-flush (MV3 SWs are aggressively reaped). Fires every
  //      time the SW wakes back up.
  //   2. chrome.alarms periodic — every 30min, catches transient outages
  //      where the per-capture flush ran while offline.
  //   3. 'online' event — when the OS reports network restoration, drain
  //      immediately rather than waiting up to 30min for the next alarm.
  void flushPendingUploads();

  chrome.alarms.create(FLUSH_ALARM_NAME, {
    periodInMinutes: FLUSH_PERIOD_MINUTES,
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM_NAME) void flushPendingUploads();
  });

  // The 'online' event fires in the SW global scope when the OS-level
  // connectivity state flips. Safe to attach unconditionally — if the
  // host doesn't fire it, the alarms tick still recovers the queue.
  if (typeof self !== 'undefined' && 'addEventListener' in self) {
    self.addEventListener('online', () => {
      void flushPendingUploads();
    });
  }

  // First install: open the promptory.chat bridge so the content script
  // can forward any stored gclid to the conversion API. The bridge then
  // asks us to swap the tab to welcome.html (the local React onboarding).
  // A 6s fallback timer rescues users whose bridge never reports back
  // (offline / promptory.chat blocked) so they still land on welcome.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;

    chrome.tabs
      .create({ url: 'https://promptory.chat/setting-up/' })
      .then((tab) => {
        if (tab.id === undefined) return;
        const tabId = tab.id;
        // Why 6s setTimeout is safe under MV3 idle-eviction (~30s):
        // the track('extension_installed') call below issues an IDB
        // read (and a GA fetch if analytics consent is on), which
        // keeps the worker alive past the timer firing point. Don't
        // remove that track() call without revisiting this — pure
        // setTimeout doesn't itself prevent eviction.
        bridgeFallbackTimers.set(
          tabId,
          setTimeout(() => {
            chrome.tabs
              .update(tabId, { url: chrome.runtime.getURL('/welcome.html') })
              .catch(() => {/* tab may have been closed — fine */});
            bridgeFallbackTimers.delete(tabId);
          }, BRIDGE_FALLBACK_MS),
        );
      })
      .catch((err) =>
        console.warn('[Promptory] Failed to open setting-up bridge', err),
      );

    void track('extension_installed', {
      version: chrome.runtime.getManifest().version,
    });
  });

  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    // gclid forwarded from the content script running on promptory.chat.
    // Two responsibilities:
    //   1. Persist to db.gclids so future retention conversions (day-7,
    //      day-30 via chrome.alarms) can find the original gclid weeks
    //      from now.
    //   2. Fire the install conversion POST. Chained off the persist
    //      promise so markGclidReported can never race a not-yet-
    //      committed row (fetch can finish before IDB on fast networks).
    if (message?.type === 'GCLID_CAPTURED') {
      const { gclid, capturedAt } = message.payload ?? {};
      if (!gclid || typeof gclid !== 'string') {
        sendResponse({ ok: false, error: 'invalid gclid' });
        return true;
      }

      // Resolve the fallback once so the persisted row and the POST body
      // agree on capturedAt in the (defensive-only) path where the message
      // didn't include it. Two independent Date.now() calls would otherwise
      // diverge by milliseconds.
      const effectiveCapturedAt = capturedAt ?? Date.now();

      saveGclid(gclid, effectiveCapturedAt)
        .then(() => {
          // Extension owns the data now — page-side localStorage will
          // be cleared by the content script regardless of POST outcome.
          sendResponse({ ok: true });

          fetch(`${API_BASE}/v1/conversion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gclid,
              conversionTime: new Date().toISOString(),
              capturedAt: effectiveCapturedAt,
            }),
          })
            .then(async (res) => {
              const body = await res.text();
              if (!res.ok) {
                console.warn('[Promptory] conversion API returned', res.status, body);
                return;
              }
              console.log('[Promptory] conversion reported');
              await markGclidReported(gclid, 'install');
            })
            .catch((err) => console.warn('[Promptory] conversion POST failed', err));
        })
        .catch((err) => {
          console.warn('[Promptory] gclid persist failed', err);
          sendResponse({ ok: false, error: String(err) });
        });

      return true; // keep channel open for async sendResponse
    }

    // Telemetry message from any UI surface — UI never calls track()
    // directly, so the consent gate (inside track()) has one enforcement
    // point. Fire-and-forget; sender doesn't need the result.
    if (message?.type === 'TRACK') {
      const event = message.event as AnalyticsEvent;
      const params = (message.params ?? {}) as AnalyticsParams;
      void track(event, params);
      sendResponse({ ok: true });
      return true;
    }

    // The /setting-up bridge asks us to swap it for the welcome onboarding
    // once the gclid handshake is done. Doing it from the background lets
    // the user see a single-tab transition (vs. a tab close + new tab).
    // Cancels the install fallback timer so we don't double-swap.
    if (message?.type === 'BRIDGE_HANDSHAKE_COMPLETE') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        const t = bridgeFallbackTimers.get(tabId);
        if (t) {
          clearTimeout(t);
          bridgeFallbackTimers.delete(tabId);
        }
        chrome.tabs
          .update(tabId, { url: chrome.runtime.getURL('/welcome.html') })
          .catch((err) => console.warn('[Promptory] tab swap failed', err));
      }
      sendResponse({ ok: true });
      return true;
    }

    const captureMessage = message as CaptureMessage;
    if (captureMessage.type === 'PROMPT_CAPTURED') {
      const { platform, promptText, responseText, sourceUrl, threadId, isRegenerated } =
        message.payload;

      addPrompt({ platform, promptText, responseText, sourceUrl, threadId, isRegenerated })
        .then(async (id) => {
          if (!id) return;
          console.log('[Promptory] Saved with id', id);

          // Broadcast so any open dashboard/sidepanel pages refresh immediately
          chrome.runtime
            .sendMessage({ type: 'PROMPT_SAVED', payload: { id } })
            .catch(() => {/* no listeners — fine */});

          // Telemetry — track() no-ops if the user hasn't opted in.
          // Only lengths are sent; the helper's sanitizer would strip
          // anything else even if we tried.
          void track('prompt_captured', {
            platform,
            had_response: responseText.length > 0,
            prompt_chars: promptText.length,
            response_chars: responseText.length,
          });

          const [count, settings] = await Promise.all([
            getPromptCount(),
            getSettings(),
          ]);

          // Community-share upload — addPrompt() already marked this row
          // 'pending' or 'skipped' based on consent at capture time. The
          // flush helper drains the pending queue (this new row + any
          // backlog from prior failed attempts) in batches.
          void flushPendingUploads();

          if (count >= 10 && !settings.reviewPromptShown) {
            chrome.runtime.sendMessage({ type: 'SHOW_REVIEW_PROMPT' }).catch(() => {
              // Side panel may not be open — fine, sidepanel checks on load too
            });
          }
        })
        .catch((err) => console.error('[Promptory] Save failed', err));
    }
  });
});

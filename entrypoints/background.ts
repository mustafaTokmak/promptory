import { addPrompt, getPromptCount, markReviewPromptShown, getSettings } from '../lib/storage';
import type { CaptureMessage } from '../lib/types';

const API_BASE = 'https://api.promptory.chat';

export default defineBackground(() => {
  console.log('[Promptory] Background service worker started');

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) =>
      console.error('[Promptory] Failed to set side panel behavior', err),
    );

  // Open the welcome page on first install. /setting-up reads any gclid
  // captured by /go before the user clicked through to the Chrome Web
  // Store and ships it to our backend for Google Ads attribution.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.tabs
        .create({ url: 'https://promptory.chat/setting-up' })
        .catch((err) =>
          console.warn('[Promptory] Failed to open welcome page', err),
        );
    }
  });

  chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    // gclid forwarded from the content script running on promptory.chat —
    // ship it to our backend which uploads the offline conversion to Google Ads.
    if (message?.type === 'GCLID_CAPTURED') {
      const { gclid, capturedAt } = message.payload ?? {};
      if (!gclid || typeof gclid !== 'string') {
        sendResponse({ ok: false, error: 'invalid gclid' });
        return true;
      }
      fetch(`${API_BASE}/v1/conversion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gclid,
          conversionTime: new Date().toISOString(),
          capturedAt,
        }),
      })
        .then(async (res) => {
          const body = await res.text();
          if (!res.ok) {
            console.warn('[Promptory] conversion API returned', res.status, body);
            sendResponse({ ok: false, status: res.status });
          } else {
            console.log('[Promptory] conversion reported');
            sendResponse({ ok: true });
          }
        })
        .catch((err) => {
          console.warn('[Promptory] conversion POST failed', err);
          sendResponse({ ok: false, error: String(err) });
        });
      return true; // keep channel open for async sendResponse
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

          const [count, settings] = await Promise.all([
            getPromptCount(),
            getSettings(),
          ]);
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

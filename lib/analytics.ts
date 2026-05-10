import { getOrCreateClientId, getSettings } from './storage';

/**
 * GA4 Measurement Protocol wrapper.
 *
 * All calls to track() funnel through the background service worker so the
 * consent gate has exactly one enforcement point. UI surfaces (welcome,
 * sidepanel, dashboard) and content scripts never call track() directly —
 * they send `chrome.runtime.sendMessage({ type: 'TRACK', event, params })`
 * instead.
 *
 * The Measurement Protocol API secret is bundled into the extension and is
 * therefore not a real cryptographic secret. Rotate via the GA admin if
 * abuse is detected. This is a documented limitation of GA4 + MV3 — the
 * SDK gtag.js can't run in a service worker and Manifest V3 forbids loading
 * remote scripts, so the Measurement Protocol is the only supported path.
 */

// GA4 Measurement Protocol credentials. The Measurement ID corresponds to
// the Firebase project promptory-61725 (Firebase Analytics is just a
// wrapper around GA4 — same backend, same reports). The API secret is
// generated separately in GA admin and is bundled into the extension —
// not a real cryptographic secret. Rotate via GA admin if abused.
const MEASUREMENT_ID = 'G-B9R8M4RJP6';
const API_SECRET = '8hJb4JBKS7y1pbvTpD0AMA';
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

export type AnalyticsEvent =
  | 'extension_installed'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'prompt_captured'
  | 'platform_visited'
  | 'dashboard_opened'
  | 'sidepanel_opened'
  | 'consent_changed'
  | 'prompt_exported'
  | 'review_rated'
  | 'error';

export type AnalyticsParams = Record<string, string | number | boolean>;

const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /text$/i,
  /url$/i,
  /^prompt(?!_chars$)/i,
  /^response(?!_chars$)/i,
  /email/i,
];

const MAX_STRING_LEN = 100;
const MAX_NUMBER = 1_000_000;

function sanitizeParams(params: AnalyticsParams): AnalyticsParams {
  const out: AnalyticsParams = {};
  for (const [key, raw] of Object.entries(params)) {
    if (FORBIDDEN_KEY_PATTERNS.some((re) => re.test(key))) continue;
    if (typeof raw === 'string') {
      out[key] = raw.length > MAX_STRING_LEN ? raw.slice(0, MAX_STRING_LEN) : raw;
    } else if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) continue;
      out[key] = Math.max(0, Math.min(MAX_NUMBER, Math.trunc(raw)));
    } else if (typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  return out;
}

/**
 * Send an event to GA4 if and only if analytics consent is currently true.
 * Catches and logs all failures — telemetry never throws into the app.
 */
export async function track(
  event: AnalyticsEvent,
  params: AnalyticsParams = {},
): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.analyticsConsent) return;

    const clientId = await getOrCreateClientId();
    const cleanParams = sanitizeParams(params);

    const url = `${GA_ENDPOINT}?measurement_id=${encodeURIComponent(
      MEASUREMENT_ID,
    )}&api_secret=${encodeURIComponent(API_SECRET)}`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: [{ name: event, params: cleanParams }],
      }),
    });
  } catch (err) {
    console.warn('[Promptory] analytics.track failed', event, err);
  }
}

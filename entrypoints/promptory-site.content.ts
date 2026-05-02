/**
 * Content script that runs on promptory.chat. Reads the gclid stored by
 * /go before the user clicked through to the Chrome Web Store, then
 * forwards it to the background worker which fires the offline conversion.
 *
 * Why a content script (vs. having /setting-up POST to our API directly):
 *   - The extension is the source of truth that "I just got installed".
 *     A page-side fetch could fire from anyone who visits /setting-up,
 *     even without the extension installed (CORS allows it).
 *   - Keeps the website fully static / no JS runtime dependencies.
 *   - Lets the background worker enrich the report with extension version,
 *     manifest data, etc. before forwarding upstream.
 */

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Google Ads attribution

export default defineContentScript({
  matches: ['https://promptory.chat/*'],
  runAt: 'document_idle',
  main: () => {
    try {
      const raw = window.localStorage.getItem('promptory_gclid');
      if (!raw) return;

      let parsed: { value?: string; capturedAt?: number } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        window.localStorage.removeItem('promptory_gclid');
        return;
      }
      if (!parsed?.value) return;

      const age = Date.now() - (parsed.capturedAt ?? 0);
      if (age > MAX_AGE_MS) {
        window.localStorage.removeItem('promptory_gclid');
        return;
      }

      console.log('[Promptory] forwarding gclid to background for conversion report');
      chrome.runtime
        .sendMessage({
          type: 'GCLID_CAPTURED',
          payload: { gclid: parsed.value, capturedAt: parsed.capturedAt },
        })
        .then((res) => {
          if (res?.ok) {
            window.localStorage.removeItem('promptory_gclid');
          }
        })
        .catch((err) => {
          console.warn('[Promptory] gclid forward failed', err);
        });
    } catch (err) {
      console.warn('[Promptory] gclid capture script error', err);
    }
  },
});

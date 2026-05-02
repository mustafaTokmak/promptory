/**
 * Content script that runs on promptory.chat. Two responsibilities:
 *
 *   1. Read the gclid stored on /go before the user clicked through to the
 *      Chrome Web Store, and forward it to the background worker which
 *      reports the offline conversion to our backend.
 *
 *   2. If we're on /setting-up (the post-install bridge), tell the
 *      background to close this tab and open the dashboard.
 *
 * Why a content script (vs. having /setting-up POST to our API directly):
 *   - The extension is the trust source ("I just got installed"). A
 *     page-side fetch would also fire for any random visitor, polluting
 *     conversion data.
 *   - Lets us close the bridge tab + open the dashboard cleanly, which
 *     a static page can't do on its own.
 */

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Google Ads attribution

export default defineContentScript({
  matches: ['https://promptory.chat/*'],
  runAt: 'document_idle',
  main: () => {
    const isSettingUp = window.location.pathname === '/setting-up';

    // Always try to forward a gclid if one is stashed
    const gclid = readStoredGclid();
    if (gclid) {
      console.log('[Promptory] forwarding gclid to background');
      chrome.runtime
        .sendMessage({ type: 'GCLID_CAPTURED', payload: gclid })
        .then((res) => {
          if (res?.ok) window.localStorage.removeItem('promptory_gclid');
        })
        .catch((err) => console.warn('[Promptory] gclid forward failed', err));
    }

    // On the post-install bridge, ask the background to swap this tab for
    // the dashboard. Small delay so the gclid sendMessage gets a head start.
    if (isSettingUp) {
      setTimeout(() => {
        chrome.runtime
          .sendMessage({ type: 'OPEN_DASHBOARD_AND_CLOSE_THIS_TAB' })
          .catch((err) => console.warn('[Promptory] dashboard open failed', err));
      }, 250);
    }
  },
});

function readStoredGclid(): { gclid: string; capturedAt: number } | null {
  try {
    const raw = window.localStorage.getItem('promptory_gclid');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: string; capturedAt?: number };
    if (!parsed?.value) return null;
    const age = Date.now() - (parsed.capturedAt ?? 0);
    if (age > MAX_AGE_MS) {
      window.localStorage.removeItem('promptory_gclid');
      return null;
    }
    return { gclid: parsed.value, capturedAt: parsed.capturedAt ?? Date.now() };
  } catch {
    window.localStorage.removeItem('promptory_gclid');
    return null;
  }
}

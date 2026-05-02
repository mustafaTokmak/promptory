import { addPrompt, getPromptCount, markReviewPromptShown, getSettings } from '../lib/storage';
import type { CaptureMessage } from '../lib/types';

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

  chrome.runtime.onMessage.addListener((message: CaptureMessage) => {
    if (message.type === 'PROMPT_CAPTURED') {
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

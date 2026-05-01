import { addPrompt, getPromptCount, markReviewPromptShown, getSettings } from '../lib/storage';
import type { CaptureMessage } from '../lib/types';

export default defineBackground(() => {
  console.log('[Promptory] Background service worker started');

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) =>
      console.error('[Promptory] Failed to set side panel behavior', err),
    );

  chrome.runtime.onMessage.addListener((message: CaptureMessage) => {
    if (message.type === 'PROMPT_CAPTURED') {
      const { platform, promptText, responseText, sourceUrl, threadId, isRegenerated } =
        message.payload;

      addPrompt({ platform, promptText, responseText, sourceUrl, threadId, isRegenerated })
        .then(async (id) => {
          if (!id) return;
          console.log('[Promptory] Saved with id', id);

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

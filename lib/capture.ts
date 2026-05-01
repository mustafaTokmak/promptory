import type { AIPlatform, CaptureMessage } from './types';

export interface PlatformSelectors {
  /** CSS selector for the container that holds all messages */
  chatContainer: string;
  /** CSS selector for individual user message elements */
  userMessage: string;
  /** CSS selector for individual assistant message elements */
  assistantMessage: string;
  /** CSS selector for the submit button (used to detect new submissions) */
  submitButton?: string;
  /** CSS selector for the input textarea */
  inputArea?: string;
}

/**
 * Waits for an AI response to finish streaming by observing text changes.
 * Returns the final text when content is stable for `debounceMs`.
 */
export function waitForStableContent(
  element: Element,
  debounceMs = 800,
): Promise<string> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    let lastText = element.textContent ?? '';

    const observer = new MutationObserver(() => {
      const current = element.textContent ?? '';
      if (current !== lastText) {
        lastText = current;
        clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          resolve(lastText.trim());
        }, debounceMs);
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Initial timer in case content is already complete
    timer = setTimeout(() => {
      observer.disconnect();
      resolve(lastText.trim());
    }, debounceMs);
  });
}

/**
 * Sends a captured prompt/response pair to the background service worker.
 */
export function sendCapture(
  platform: AIPlatform,
  promptText: string,
  responseText: string,
  threadId: string,
  isRegenerated = false,
): void {
  if (!promptText.trim() || !responseText.trim()) return;

  const message: CaptureMessage = {
    type: 'PROMPT_CAPTURED',
    payload: {
      platform,
      promptText: promptText.trim(),
      responseText: responseText.trim(),
      sourceUrl: window.location.href,
      threadId,
      isRegenerated,
    },
  };

  chrome.runtime.sendMessage(message);
}

/**
 * Generates a stable thread ID from the current URL path.
 * Falls back to a random UUID for new conversations.
 */
export function getThreadId(): string {
  const path = window.location.pathname;
  // Most AI tools use /c/<id> or /chat/<id> patterns
  const match = path.match(/\/(?:c|chat|thread)\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? `thread-${crypto.randomUUID()}`;
}

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
 * Strip screen-reader-only helper text (e.g. "You said", "Copilot said")
 * that platforms inject for a11y. Without this, prompts come through as
 * "You said test internet speed".
 *
 * Covers the common a11y patterns:
 *   - Tailwind/Bootstrap: `.sr-only`
 *   - Angular Material: `.cdk-visually-hidden`
 *   - Generic: any class containing "visually-hidden" or "screen-reader"
 *
 * Note: we deliberately don't strip [aria-hidden="true"] — some platforms
 * mark their streaming response containers as aria-hidden until the response
 * stabilizes, which would cause us to capture an empty string.
 */
export function getVisibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      '.sr-only, [class*="sr-only"], [class*="visually-hidden"], [class*="screen-reader"]',
    )
    .forEach((e) => e.remove());
  return clone.textContent?.trim().replace(/\s+/g, ' ') ?? '';
}

/**
 * Waits for an AI response to finish streaming by observing text changes.
 * Returns the final text when content is stable for `debounceMs`.
 *
 * Has a hard ceiling (`maxWaitMs`) so the capture engine never gets stuck
 * if the page has continuous mutations (cursor blinks, hover reveals,
 * code-execution badge updates) that keep resetting the debounce timer.
 * Without this, ChatGPT capture would freeze: `processing` stays true,
 * subsequent turns silently get skipped.
 */
export function waitForStableContent(
  element: Element,
  debounceMs = 800,
  maxWaitMs = 30_000,
): Promise<string> {
  return new Promise((resolve) => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    let resolved = false;
    let lastText = getVisibleText(element);

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(debounceTimer);
      clearTimeout(maxTimer);
      observer.disconnect();
      resolve(lastText);
    };

    const observer = new MutationObserver(() => {
      const current = getVisibleText(element);
      if (current !== lastText) {
        lastText = current;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(finish, debounceMs);
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Resolve once content has been stable for `debounceMs`...
    debounceTimer = setTimeout(finish, debounceMs);
    // ...but never wait longer than `maxWaitMs` total.
    const maxTimer = setTimeout(finish, maxWaitMs);
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

import { waitForStableContent, sendCapture, getThreadId, getVisibleText } from './capture';
import type { AIPlatform } from './types';

/**
 * Config describing how to extract prompts/responses from a specific AI platform.
 *
 * Each platform has its own DOM structure — this config isolates those
 * differences so the engine itself never needs to change.
 */
export interface PlatformConfig {
  /** Platform identifier used in storage */
  id: AIPlatform;

  /** Human-readable name for logs */
  name: string;

  /** URL patterns the content script runs on */
  matches: string[];

  /** Optional path filter — returns true if script should run on this path.
   * Useful for apps embedded in larger sites (e.g., Grok inside x.com). */
  pathFilter?: (pathname: string) => boolean;

  /** CSS selectors to find user message elements. Tried in order — first non-empty wins. */
  userSelectors: string[];

  /** CSS selectors to find assistant message elements. Tried in order — first non-empty wins. */
  assistantSelectors: string[];

  /** How long to wait for streaming content to stabilize (ms). Default 800. */
  debounceMs?: number;
}

/**
 * Generic capture engine. Given a platform config, watches the DOM for new
 * prompt/response pairs and ships them to the background service worker.
 *
 * All content scripts call this with their config — there is NO platform
 * logic here beyond "find user + assistant messages, capture pair".
 */
export function startCaptureEngine(config: PlatformConfig): void {
  console.log(`[Promptory] ${config.name} content script loaded on`, window.location.href);

  // Respect path filter (e.g., only run on /grok routes of x.com)
  if (config.pathFilter && !config.pathFilter(window.location.pathname)) {
    console.log(`[Promptory] ${config.name}: path filter did not match, skipping`);
    return;
  }

  let lastProcessedSignature: string | null = null;
  let lastProcessedTurn = 0; // Count-based dedup: prevents reprocessing same turn
  let processing = false;
  let debounceTimer: ReturnType<typeof setTimeout>;

  const querySelectorsAll = (selectors: string[]): Element[] => {
    for (const selector of selectors) {
      try {
        const results = document.querySelectorAll(selector);
        if (results.length > 0) return Array.from(results);
      } catch {
        // Invalid selector — skip
      }
    }
    return [];
  };

  const signatureFor = (el: Element): string => {
    // Prefer stable identifiers — never use textContent which changes
    // during streaming and would defeat dedup
    return (
      el.getAttribute('data-message-id') ??
      el.getAttribute('data-testid') ??
      el.id ??
      // Last resort: position-based signature (stable per render)
      Array.from(el.parentElement?.children ?? []).indexOf(el).toString()
    );
  };

  const check = () => {
    if (processing) return;

    const userMessages = querySelectorsAll(config.userSelectors);
    const assistantMessages = querySelectorsAll(config.assistantSelectors);

    if (userMessages.length === 0 || assistantMessages.length === 0) return;

    // Pair up: only process if we have matching counts (assistant just responded)
    // and this is a NEW turn we haven't seen before.
    const turnNumber = Math.min(userMessages.length, assistantMessages.length);
    if (turnNumber <= lastProcessedTurn) return;

    const latestUser = userMessages[userMessages.length - 1];
    const latestAssistant = assistantMessages[assistantMessages.length - 1];
    if (!latestUser || !latestAssistant) return;

    // Secondary dedup: skip if signature matches last processed
    const signature = signatureFor(latestAssistant);
    if (signature && signature === lastProcessedSignature) return;

    const promptText = getVisibleText(latestUser);
    if (!promptText) return;

    processing = true;
    console.log(`[Promptory] ${config.name}: new turn detected`);

    waitForStableContent(latestAssistant, config.debounceMs ?? 800)
      .then((responseText) => {
        if (!responseText) {
          // This is normal — happens when the assistant element is still
          // showing a loading placeholder. We'll re-detect on the next
          // mutation. Use debug so it doesn't pollute extension errors.
          console.debug(`[Promptory] ${config.name}: empty response, will retry`);
          return;
        }
        lastProcessedSignature = signature;
        lastProcessedTurn = turnNumber;
        console.log(`[Promptory] ${config.name}: captured turn ${turnNumber}`, {
          promptLen: promptText.length,
          responseLen: responseText.length,
        });
        sendCapture(config.id, promptText, responseText, getThreadId());
      })
      .catch((err) => {
        console.error(`[Promptory] ${config.name}: capture error`, err);
      })
      .finally(() => {
        // Always release the lock — otherwise a single stuck capture
        // would silently freeze every subsequent turn on the page.
        processing = false;
      });
  };

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(check, 200);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check in case messages already exist on page load
  setTimeout(check, 1000);
}

import type { PlatformConfig } from './capture-engine';

/**
 * Platform configurations for the capture engine.
 *
 * To add a new AI platform:
 *   1. Add its ID to AIPlatform in types.ts
 *   2. Add a config entry here
 *   3. Add platform info (label/color) in platform.ts
 *   4. Create entrypoints/<name>.content.ts importing this config
 *   5. Add host_permissions in wxt.config.ts
 */

export const chatgptConfig: PlatformConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',
  matches: ['https://chat.openai.com/*', 'https://chatgpt.com/*'],
  userSelectors: [
    '[data-message-author-role="user"]',
  ],
  assistantSelectors: [
    '[data-message-author-role="assistant"]',
  ],
};

export const geminiConfig: PlatformConfig = {
  id: 'gemini',
  name: 'Gemini',
  matches: ['https://gemini.google.com/*'],
  userSelectors: [
    'user-query',
    '[data-turn-role="user"]',
    '.query-text',
    '.user-query-container',
  ],
  assistantSelectors: [
    'model-response',
    '[data-turn-role="model"]',
    '.response-text',
    '.response-container',
    'message-content',
  ],
};

export const claudeConfig: PlatformConfig = {
  id: 'claude',
  name: 'Claude',
  matches: ['https://claude.ai/*'],
  userSelectors: [
    '[data-testid="user-message"]',
    // ~= matches the WHOLE class name as a token, not a substring.
    // [class*=...] would also match font-user-message-body etc.
    '[class~="!font-user-message"]',
    '[class~="font-user-message"]',
  ],
  assistantSelectors: [
    '[data-testid="assistant-message"]',
    // Outer container only — `[class*=...]` wrongly also matched the
    // inner `.font-claude-response-body` paragraph elements, causing
    // capture to grab only the last paragraph.
    '[class~="font-claude-response"]',
    '[class~="font-claude-message"]', // legacy fallback
  ],
};

export const perplexityConfig: PlatformConfig = {
  id: 'perplexity',
  name: 'Perplexity',
  matches: ['https://www.perplexity.ai/*'],
  // Perplexity has many markdown containers (citations, related questions,
  // sources, follow-up suggestions). Match ONLY the top-level query/answer.
  userSelectors: [
    '[data-testid="query-text"]',
  ],
  assistantSelectors: [
    '[data-testid="answer-text"]',
  ],
  debounceMs: 2000, // Perplexity streams sources/citations after the main answer
};

export const grokConfig: PlatformConfig = {
  id: 'grok',
  name: 'Grok',
  matches: ['https://grok.com/*', 'https://x.com/i/grok*'],
  // On x.com, only run inside the Grok UI
  pathFilter: (pathname) =>
    !pathname.startsWith('/') || pathname.startsWith('/i/grok') || pathname === '/' || !pathname.match(/\/\w+\/status/),
  userSelectors: [
    '[data-testid="user-message"]',
    '.user-message',
    '[class*="user-message"]',
    '.message-bubble.user',
  ],
  assistantSelectors: [
    // Most specific — only the rendered markdown response, excludes the
    // "View code executions" button and other UI chrome at the bottom of
    // [data-testid="assistant-message"] which would otherwise leak text
    // like "Executing code1 line" into the captured response.
    '.response-content-markdown',
    '[class*="response-content"]',
    '[data-testid="assistant-message"]',
    '.assistant-message',
    '[class*="assistant-message"]',
    '.message-bubble.assistant',
  ],
  debounceMs: 1000, // Grok streams more slowly on x.com
};

export const copilotConfig: PlatformConfig = {
  id: 'copilot',
  name: 'Copilot',
  matches: ['https://copilot.microsoft.com/*'],
  userSelectors: [
    // Current Copilot (2026): user message container has role="article" with id ending in "-user-message"
    '[role="article"][id$="-user-message"]',
    // Legacy fallbacks
    '[data-testid="user-message"]',
    '[data-author="user"]',
    'cib-user-message',
  ],
  assistantSelectors: [
    '[data-testid="ai-message"]',
    '[data-content="ai-message"]',
    // Legacy fallbacks
    '[data-author="bot"]',
    '[data-author="assistant"]',
    'cib-message[source="bot"]',
  ],
};

export const allConfigs = [
  chatgptConfig,
  geminiConfig,
  claudeConfig,
  perplexityConfig,
  grokConfig,
  copilotConfig,
];

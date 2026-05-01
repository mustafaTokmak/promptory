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
    '.font-user-message',
  ],
  assistantSelectors: [
    '[data-testid="assistant-message"]',
    '.font-claude-message',
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
    '[data-testid="assistant-message"]',
    '.assistant-message',
    '[class*="assistant-message"]',
    '[class*="response-content"]',
    '.message-bubble.assistant',
  ],
  debounceMs: 1000, // Grok streams more slowly on x.com
};

export const copilotConfig: PlatformConfig = {
  id: 'copilot',
  name: 'Copilot',
  matches: ['https://copilot.microsoft.com/*'],
  userSelectors: [
    '[data-testid="user-message"]',
    '[data-author="user"]',
    '.user-message',
    'cib-user-message',
  ],
  assistantSelectors: [
    '[data-testid="ai-message"]',
    '[data-author="bot"]',
    '[data-author="assistant"]',
    '.ai-message',
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

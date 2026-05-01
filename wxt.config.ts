import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Promptory - AI Prompt Directory for ChatGPT',
    description:
      'Auto-save and organize your AI conversations. Search, reuse, and never lose a great prompt again.',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel', 'scripting'],
    host_permissions: [
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://gemini.google.com/*',
      'https://claude.ai/*',
      'https://www.perplexity.ai/*',
      'https://grok.com/*',
      'https://x.com/*',
      'https://copilot.microsoft.com/*',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});

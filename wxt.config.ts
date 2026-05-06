import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

/**
 * Per-browser manifest factory.
 *
 * Chrome / Edge use Manifest V3's `side_panel` API. Firefox doesn't
 * implement `sidePanel` yet (as of FF 134) and instead uses the legacy
 * `sidebar_action` API. WXT's `browser` flag lets us emit the right
 * fields for each target.
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => {
    const baseManifest = {
      name: 'Promptory - AI Prompt Directory for ChatGPT',
      description:
        'Auto-save and organize your AI conversations. Search, reuse, and never lose a great prompt again.',
      version: '0.1.1',
      // CWS Purple Potassium policy: declare only permissions actually used.
      //   - 'storage' was removed in 0.1.1: we use Dexie/IndexedDB for all
      //     persistence, never chrome.storage.* — so the permission was
      //     dead weight. Re-add only if we genuinely need chrome.storage.
      //   - 'tabs' is intentionally absent: chrome.tabs.create() and
      //     chrome.tabs.query({active:true}).id work without it.
      permissions: [
        'scripting',
        ...(browser === 'firefox' ? [] : ['sidePanel']),
      ],
      host_permissions: [
        'https://chat.openai.com/*',
        'https://chatgpt.com/*',
        'https://gemini.google.com/*',
        'https://claude.ai/*',
        'https://www.perplexity.ai/*',
        'https://grok.com/*',
        'https://x.com/*',
        'https://copilot.microsoft.com/*',
        'https://promptory.chat/*',
      ],
    };

    if (browser === 'firefox') {
      return {
        ...baseManifest,
        sidebar_action: {
          default_title: 'Promptory',
          default_panel: 'sidepanel.html',
          default_icon: {
            '16': 'icon/16.png',
            '48': 'icon/48.png',
            '128': 'icon/128.png',
          },
        },
        // Firefox 137+ requires explicit data-collection disclosure on AMO,
        // and AMO expects the property nested INSIDE gecko (not at the
        // manifest root).
        //   websiteContent          — we capture prompt + response text from
        //                             ChatGPT/Claude/etc, stored locally only.
        //   technicalAndInteraction — opt-in feedback POST to api.promptory.chat
        //                             when the user explicitly clicks Send Feedback.
        browser_specific_settings: {
          gecko: {
            id: 'promptory@promptory.chat',
            strict_min_version: '128.0',
            data_collection_permissions: {
              required: ['websiteContent'],
              optional: ['technicalAndInteraction'],
            },
          },
        },
      } as Record<string, unknown>;
    }

    // Chrome / Edge / other Chromium browsers
    return {
      ...baseManifest,
      side_panel: { default_path: 'sidepanel.html' },
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});

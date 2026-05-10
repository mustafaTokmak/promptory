export type AIPlatform =
  | 'chatgpt'
  | 'gemini'
  | 'claude'
  | 'perplexity'
  | 'grok'
  | 'copilot';

/**
 * Per-prompt community-upload state.
 *   - 'pending'  — captured while consentGiven=true; queued for /v1/prompts.
 *                  Stays pending across retries until POST succeeds.
 *   - 'sent'     — successfully uploaded; uploadedAt is set.
 *   - 'skipped'  — captured while consentGiven=false, OR cancelled by an
 *                  opt-out after capture, OR a pre-feature historical row.
 *                  Never retried. Forward-only consent — declining or
 *                  flipping off does NOT erase historical rows from the
 *                  remote dataset, but it does prevent re-attempting.
 */
export type UploadStatus = 'pending' | 'sent' | 'skipped';

export interface Prompt {
  id: string;
  threadId: string;
  platform: AIPlatform;
  promptText: string;
  responseText: string;
  sourceUrl: string;
  timestamp: number;
  tags: string[];
  folderId: string | null;
  isFavorite: boolean;
  isRegenerated: boolean;
  uploadStatus?: UploadStatus;
  uploadedAt?: number | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  order: number;
}

/** Message sent from content script to background service worker */
export interface CaptureMessage {
  type: 'PROMPT_CAPTURED';
  payload: {
    platform: AIPlatform;
    promptText: string;
    responseText: string;
    sourceUrl: string;
    threadId: string;
    isRegenerated: boolean;
  };
}

export interface ExportData {
  version: 1;
  exportedAt: string;
  prompts: Prompt[];
  folders: Folder[];
}

export interface Settings {
  id: 1; // Always 1 — single row
  consentGiven: boolean;
  consentTimestamp: number | null;
  reviewPromptShown: boolean;
  /**
   * Has the first-run onboarding been completed (Save preferences) or
   * explicitly dismissed (Skip both / banner Dismiss)? When false, the
   * sidepanel and dashboard show a soft re-prompt banner.
   */
  onboardingShown?: boolean;
  onboardingShownAt?: number | null;
  /** Anonymous usage analytics (GA4) opt-in — independent of community sharing. */
  analyticsConsent: boolean;
  analyticsConsentAt: number | null;
  /** Stable GA4 client_id, generated lazily on first analytics use. */
  clientId: string;
}

/**
 * One row per ad-click → install. Persisted in IndexedDB so future
 * day-7 / day-30 retention conversions (via chrome.alarms) can find
 * the original gclid weeks after install — the website's localStorage
 * isn't reliable for that timescale.
 */
export interface Gclid {
  id: string;
  capturedAt: number;    // timestamp from page-side localStorage
  persistedAt: number;   // when the extension first saw it
  reportedAt: {
    install?: number;
    day7?: number;       // populated by future retention work
    day30?: number;      // populated by future retention work
  };
}

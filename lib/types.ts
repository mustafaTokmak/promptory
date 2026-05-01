export type AIPlatform =
  | 'chatgpt'
  | 'gemini'
  | 'claude'
  | 'perplexity'
  | 'grok'
  | 'copilot';

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
}

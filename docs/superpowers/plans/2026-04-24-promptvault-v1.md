# PromptVault V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining V1 gaps so the extension is ready for Chrome Web Store submission.

**Architecture:** WXT + React 19 + Dexie.js (IndexedDB). Most of the heavy lifting is already done — capture engine, content scripts, storage layer, sidepanel UI, dashboard UI, and all components exist. This plan covers only what's missing.

**Tech Stack:** WXT 0.20, React 19, Tailwind CSS 4, Dexie.js 4, TypeScript 6, Vitest (adding)

---

## What Already Exists — Do Not Rebuild

Before starting, read these files to understand what's there:

| File | What it does |
|---|---|
| `lib/types.ts` | Prompt, Folder, CaptureMessage, ExportData types |
| `lib/db.ts` | Dexie instance with prompts + folders tables |
| `lib/storage.ts` | Full CRUD, JSON export/import, search, favorites |
| `lib/capture-engine.ts` | Generic MutationObserver engine — all content scripts use this |
| `lib/platforms-config.ts` | Platform selectors for all 6 AI tools |
| `lib/platform.ts` | getPlatformInfo, formatTimestamp |
| `lib/capture.ts` | waitForStableContent, sendCapture, getThreadId |
| `entrypoints/background.ts` | Message listener → addPrompt |
| `entrypoints/sidepanel/App.tsx` | Side panel UI (this IS the "popup" — implemented as a side panel) |
| `entrypoints/dashboard/App.tsx` | Full dashboard with search, filters, bulk actions, JSON export |
| `components/` | PromptCard, SearchBar, FolderSidebar, Button, Dialog, Logo, Skeleton, Toast |

---

## File Map — What This Plan Creates/Modifies

| Action | File | Purpose |
|---|---|---|
| Create | `entrypoints/perplexity.content.ts` | Perplexity capture script |
| Modify | `wxt.config.ts` | Add perplexity permission, fix description |
| Modify | `lib/types.ts` | Add Settings interface |
| Modify | `lib/db.ts` | Add settings table |
| Modify | `lib/storage.ts` | Add getSettings, setConsent, exportAsCsv |
| Create | `lib/pii.ts` | PII detection for community prompt sharing |
| Create | `lib/pii.test.ts` | Tests for PII detection |
| Modify | `entrypoints/sidepanel/App.tsx` | Add perplexity chip, review trigger banner |
| Modify | `entrypoints/dashboard/App.tsx` | Add Community tab, CSV export button |
| Modify | `entrypoints/background.ts` | Set review prompt flag after 10th save |

---

## Task 1: Fix wxt.config.ts

**Files:**
- Modify: `wxt.config.ts`

Fix two issues: missing Perplexity host permission, and the manifest description still has the old privacy-first messaging we removed from the strategy.

- [ ] **Step 1: Open wxt.config.ts and replace its contents**

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Promptory — AI Prompt History',
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
```

- [ ] **Step 2: Verify the build still works**

```bash
cd promptvault && npm run build
```

Expected: build completes with no errors. If it fails, check that wxt and @wxt-dev/module-react are installed.

- [ ] **Step 3: Commit**

```bash
git add promptvault/wxt.config.ts
git commit -m "fix: add perplexity host permission, update manifest description"
```

---

## Task 2: Add Perplexity Content Script

**Files:**
- Create: `entrypoints/perplexity.content.ts`
- Modify: `entrypoints/sidepanel/App.tsx` (add perplexity to filter chips)

Perplexity is the only supported platform without a content script. The config already exists in `lib/platforms-config.ts` — this task just wires it up.

- [ ] **Step 1: Create the content script**

```typescript
// entrypoints/perplexity.content.ts
import { startCaptureEngine } from '../lib/capture-engine';
import { perplexityConfig } from '../lib/platforms-config';

export default defineContentScript({
  matches: perplexityConfig.matches,
  runAt: 'document_idle',
  main: () => startCaptureEngine(perplexityConfig),
});
```

- [ ] **Step 2: Add perplexity to sidepanel filter chips**

In `entrypoints/sidepanel/App.tsx`, find this line:

```typescript
const platformChips: AIPlatform[] = [
  'chatgpt',
  'gemini',
  'claude',
  'grok',
  'copilot',
];
```

Replace with:

```typescript
const platformChips: AIPlatform[] = [
  'chatgpt',
  'gemini',
  'claude',
  'perplexity',
  'grok',
  'copilot',
];
```

- [ ] **Step 3: Build and smoke-test**

```bash
cd promptvault && npm run build
```

Open `https://www.perplexity.ai`, ask a question, open the side panel — prompt should appear.

- [ ] **Step 4: Commit**

```bash
git add promptvault/entrypoints/perplexity.content.ts promptvault/entrypoints/sidepanel/App.tsx
git commit -m "feat: add Perplexity capture and sidepanel filter chip"
```

---

## Task 3: Add Settings to IndexedDB

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db.ts`
- Modify: `lib/storage.ts`

The `consentGiven` flag (Community Prompts data policy) needs to be persisted in IndexedDB. We use a single-row settings table — much simpler than a key-value store and fully typed.

- [ ] **Step 1: Add Settings type to lib/types.ts**

Open `lib/types.ts` and append at the bottom:

```typescript
export interface Settings {
  id: 1; // Always 1 — single row
  consentGiven: boolean;
  consentTimestamp: number | null;
  reviewPromptShown: boolean; // Set true after review banner is shown
}
```

- [ ] **Step 2: Add settings table to lib/db.ts**

Replace the entire contents of `lib/db.ts`:

```typescript
import Dexie, { type EntityTable } from 'dexie';
import type { Prompt, Folder, Settings } from './types';

const db = new Dexie('PromptoryDB') as Dexie & {
  prompts: EntityTable<Prompt, 'id'>;
  folders: EntityTable<Folder, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
});

// Version 2: add settings table
db.version(2).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
  settings: 'id',
});

export { db };
```

- [ ] **Step 3: Add settings functions to lib/storage.ts**

Open `lib/storage.ts` and append these functions at the bottom:

```typescript
// ── Settings ─────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  consentGiven: false,
  consentTimestamp: null,
  reviewPromptShown: false,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get(1);
  return s ?? DEFAULT_SETTINGS;
}

export async function setConsent(given: boolean): Promise<void> {
  const current = await getSettings();
  await db.settings.put({
    ...current,
    consentGiven: given,
    consentTimestamp: given ? Date.now() : null,
  });
}

export async function markReviewPromptShown(): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, reviewPromptShown: true });
}
```

Add `Settings` to the import at the top of `lib/storage.ts`:

```typescript
import type { Prompt, Folder, ExportData, Settings } from './types';
```

- [ ] **Step 4: Build to verify types compile**

```bash
cd promptvault && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add promptvault/lib/types.ts promptvault/lib/db.ts promptvault/lib/storage.ts
git commit -m "feat: add settings table to IndexedDB with consent and review flags"
```

---

## Task 4: Add CSV Export

**Files:**
- Modify: `lib/storage.ts`
- Modify: `entrypoints/dashboard/App.tsx`

JSON export already works. CSV is simpler for users who want to open their prompts in a spreadsheet.

- [ ] **Step 1: Add exportAsCsv to lib/storage.ts**

Append to `lib/storage.ts`:

```typescript
/**
 * Exports all prompts as a CSV string.
 * Columns: id, platform, timestamp, promptText, responseText, tags, isFavorite
 */
export async function exportAsCsv(): Promise<string> {
  const prompts = await db.prompts.orderBy('timestamp').reverse().toArray();

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const header = ['id', 'platform', 'timestamp', 'promptText', 'responseText', 'tags', 'isFavorite'].join(',');

  const rows = prompts.map((p) =>
    [
      escape(p.id),
      escape(p.platform),
      escape(new Date(p.timestamp).toISOString()),
      escape(p.promptText),
      escape(p.responseText),
      escape(p.tags.join('; ')),
      String(p.isFavorite),
    ].join(','),
  );

  return [header, ...rows].join('\n');
}
```

- [ ] **Step 2: Wire up CSV export in dashboard**

In `entrypoints/dashboard/App.tsx`, add `exportAsCsv` to imports:

```typescript
import {
  getAllPrompts,
  searchPrompts,
  getPromptsByFolder,
  getPromptsByPlatform,
  getFavorites,
  getAllFolders,
  deletePrompts,
  deleteAllPrompts,
  moveToFolder,
  exportAll,
  exportAsCsv,
  importData,
  getPromptCount,
} from '../../lib/storage';
```

Add a `handleExportCsv` handler after `handleExport`:

```typescript
const handleExportCsv = async () => {
  const csv = await exportAsCsv();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `promptory-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${totalCount} prompts as CSV`, 'success');
};
```

Replace the existing Export button in the header with a dropdown:

```tsx
<div className="relative">
  <div className="flex">
    <Button
      variant="primary"
      size="md"
      onClick={handleExport}
      leadingIcon={<Download className="h-4 w-4" />}
    >
      Export JSON
    </Button>
    <Button
      variant="secondary"
      size="md"
      onClick={handleExportCsv}
      className="ml-1"
    >
      CSV
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Build and verify**

```bash
cd promptvault && npm run build
```

Open dashboard, click Export JSON → file downloads. Click CSV → CSV file downloads with correct columns.

- [ ] **Step 4: Commit**

```bash
git add promptvault/lib/storage.ts promptvault/entrypoints/dashboard/App.tsx
git commit -m "feat: add CSV export to dashboard"
```

---

## Task 5: Add Review Trigger (10th Prompt Banner)

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `entrypoints/sidepanel/App.tsx`

After the user saves their 10th prompt, show a review banner in the side panel. The background service worker sets the flag after saving. The sidepanel reads it on load and on every new prompt.

- [ ] **Step 1: Update background.ts to set review flag after 10th prompt**

Replace the entire contents of `entrypoints/background.ts`:

```typescript
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

          // Check if user just hit 10 prompts and hasn't seen the review ask yet
          const [count, settings] = await Promise.all([
            getPromptCount(),
            getSettings(),
          ]);
          if (count >= 10 && !settings.reviewPromptShown) {
            // Signal the side panel to show the review banner
            chrome.runtime.sendMessage({ type: 'SHOW_REVIEW_PROMPT' }).catch(() => {
              // Side panel may not be open — that's fine, it will check on next open
            });
          }
        })
        .catch((err) => console.error('[Promptory] Save failed', err));
    }
  });
});
```

- [ ] **Step 2: Add review banner to sidepanel App**

In `entrypoints/sidepanel/App.tsx`, add these imports:

```typescript
import { Star } from 'lucide-react';
import { getSettings, markReviewPromptShown } from '../../lib/storage';
```

Update the storage import at the top of `entrypoints/sidepanel/App.tsx` — `getPromptCount` is already there, add the two new ones:

```typescript
import {
  getRecentPrompts,
  searchPrompts,
  getFavorites,
  getPromptsByPlatform,
  getPromptCount,
  deleteAllPrompts,
  getSettings,
  markReviewPromptShown,
} from '../../lib/storage';
```

Add state inside the `App` component (after existing state declarations):

```typescript
const [showReviewBanner, setShowReviewBanner] = useState(false);
```

Add a `checkReviewPrompt` function and call it on load:

```typescript
const checkReviewPrompt = useCallback(async () => {
  const [count, settings] = await Promise.all([
    getPromptCount(),
    getSettings(),
  ]);
  if (count >= 10 && !settings.reviewPromptShown) {
    setShowReviewBanner(true);
  }
}, []);

useEffect(() => {
  checkReviewPrompt();
}, [checkReviewPrompt]);
```

Add a message listener to catch the background's signal:

```typescript
useEffect(() => {
  const handleMessage = (message: { type: string }) => {
    if (message.type === 'SHOW_REVIEW_PROMPT') {
      checkReviewPrompt();
    }
  };
  chrome.runtime.onMessage.addListener(handleMessage);
  return () => chrome.runtime.onMessage.removeListener(handleMessage);
}, [checkReviewPrompt]);
```

Add a dismiss handler:

```typescript
const handleDismissReview = async () => {
  await markReviewPromptShown();
  setShowReviewBanner(false);
};
```

Add the banner JSX just before the prompt list `<div className="flex-1 ...">`:

```tsx
{showReviewBanner && (
  <div className="mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
    <p className="text-xs font-medium text-amber-800">
      ⚡ You've saved 10 prompts!
    </p>
    <p className="mt-0.5 text-xs text-amber-700">
      Enjoying Promptory? A quick review helps a lot.
    </p>
    <div className="mt-2 flex gap-2">
      <a
        href="https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID/reviews"
        target="_blank"
        rel="noreferrer"
        onClick={handleDismissReview}
        className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
      >
        <Star className="h-3 w-3" />
        Leave a review
      </a>
      <button
        onClick={handleDismissReview}
        className="text-xs text-amber-600 hover:text-amber-800"
      >
        Maybe later
      </button>
    </div>
  </div>
)}
```

**Note:** Replace `YOUR_EXTENSION_ID` with the real extension ID once published to Chrome Web Store.

- [ ] **Step 3: Build and verify**

```bash
cd promptvault && npm run build
```

Load the unpacked extension, save 10+ prompts across any AI tool, open the side panel — the amber banner should appear. Click "Maybe later" — banner dismisses and never shows again.

- [ ] **Step 4: Commit**

```bash
git add promptvault/entrypoints/background.ts promptvault/entrypoints/sidepanel/App.tsx
git commit -m "feat: show review banner after 10th prompt saved"
```

---

## Task 6: Add Community Tab to Dashboard

**Files:**
- Modify: `entrypoints/dashboard/App.tsx`
- Modify: `lib/storage.ts` (import getSettings, setConsent)

This is the V1 consent gate. The Community tab is visible from day one. Clicking it shows a modal asking the user to accept the data policy. After accepting, they see an empty "coming soon" state. Consent is stored in IndexedDB (`consentGiven: true`) — no backend needed in V1.

- [ ] **Step 1: Add tab state to dashboard App.tsx**

In `entrypoints/dashboard/App.tsx`, add `getSettings` and `setConsent` to storage imports:

```typescript
import {
  getAllPrompts,
  searchPrompts,
  getPromptsByFolder,
  getPromptsByPlatform,
  getFavorites,
  getAllFolders,
  deletePrompts,
  deleteAllPrompts,
  moveToFolder,
  exportAll,
  exportAsCsv,
  importData,
  getPromptCount,
  getSettings,
  setConsent,
} from '../../lib/storage';
```

Add tab and consent state inside `App()`:

```typescript
type DashboardTab = 'library' | 'community';
const [activeTab, setActiveTab] = useState<DashboardTab>('library');
const [consentGiven, setConsentGiven] = useState(false);
const [consentModalOpen, setConsentModalOpen] = useState(false);
```

Load consent state on mount — add inside the existing `useEffect` that loads folders:

```typescript
useEffect(() => {
  loadFolders();
  getSettings().then((s) => setConsentGiven(s.consentGiven));
}, [loadFolders]);
```

Add a consent handler:

```typescript
const handleAcceptConsent = async () => {
  await setConsent(true);
  setConsentGiven(true);
  setConsentModalOpen(false);
};
```

Add a tab click handler (opens modal if community tab clicked and consent not given):

```typescript
const handleTabClick = (tab: DashboardTab) => {
  if (tab === 'community' && !consentGiven) {
    setConsentModalOpen(true);
    return;
  }
  setActiveTab(tab);
};
```

- [ ] **Step 2: Add tab bar to the header**

Inside the `<header>` element in `App.tsx`, add a tab bar after the logo/title row:

```tsx
{/* Tab bar */}
<div className="mt-2 flex gap-1 border-b border-gray-200">
  <button
    onClick={() => handleTabClick('library')}
    className={`px-4 pb-2 text-sm font-medium transition-colors ${
      activeTab === 'library'
        ? 'border-b-2 border-brand-600 text-brand-600'
        : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    My Library
  </button>
  <button
    onClick={() => handleTabClick('community')}
    className={`flex items-center gap-1.5 px-4 pb-2 text-sm font-medium transition-colors ${
      activeTab === 'community'
        ? 'border-b-2 border-brand-600 text-brand-600'
        : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    Community
    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-700">
      NEW
    </span>
  </button>
</div>
```

- [ ] **Step 3: Add community content below the main flex container**

In `entrypoints/dashboard/App.tsx`, find this exact block (it starts right after the closing `</header>` tag):

```tsx
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <FolderSidebar
```

Wrap it so it only renders in library mode, and add the community tab branch:

```tsx
      {activeTab === 'library' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <FolderSidebar
            folders={folders}
            activeFilter={filter}
            onFilterChange={(f) => {
              setFilter(f);
              setSearch('');
              setSelected(new Set());
            }}
            onFoldersChanged={loadFolders}
          />
          {/* Main content — unchanged, paste the existing <main> block here */}
          <main className="flex flex-1 flex-col overflow-hidden">
            {/* ... all existing main content unchanged ... */}
          </main>
        </div>
      ) : (
        <CommunityTab consentGiven={consentGiven} />
      )}
```

- [ ] **Step 4: Add CommunityTab component at the bottom of App.tsx**

```tsx
function CommunityTab({ consentGiven }: { consentGiven: boolean }) {
  if (!consentGiven) {
    // Should not render — consent gate is shown as a modal before tab switches
    return null;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-4xl">🌐</div>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">
        You're in!
      </h2>
      <p className="max-w-sm text-sm text-gray-500">
        Community prompts are coming soon. You'll be among the first to see them
        when they launch.
      </p>
      <p className="mt-3 text-xs text-gray-400">
        Your anonymized prompts help build this library for everyone.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Add consent modal**

Add the consent Dialog at the bottom of the return statement (alongside the existing Clear/BulkDelete dialogs):

```tsx
<Dialog
  open={consentModalOpen}
  onClose={() => setConsentModalOpen(false)}
  title="Join the Community"
  description={
    <div className="space-y-3 text-sm text-gray-600">
      <p>
        Community Prompts lets you browse and reuse prompts shared by other
        Promptory users.
      </p>
      <p>
        To access this, we anonymize your saved prompts and include them in our
        shared dataset. Your personal information is never shared.
      </p>
      {/* Replace the href with your real privacy policy URL before CWS submission */}
      <a
        href="https://promptory.app/privacy"
        target="_blank"
        rel="noreferrer"
        className="text-brand-600 underline hover:text-brand-700"
      >
        Read full policy
      </a>
    </div>
  }
  confirmLabel="Accept & Browse Community"
  onConfirm={handleAcceptConsent}
  variant="default"
/>
```

- [ ] **Step 6: Build and verify**

```bash
cd promptvault && npm run build
```

Open the dashboard. "Community" tab is visible with a "NEW" badge. Click it → consent modal appears. Click "Accept & Browse Community" → tab switches to the community empty state ("You're in!"). Reload the dashboard → community tab shows the empty state without modal (consent persisted).

- [ ] **Step 7: Commit**

```bash
git add promptvault/entrypoints/dashboard/App.tsx
git commit -m "feat: add Community tab with consent gate to dashboard"
```

---

## Task 7: Add PII Detection Utility

**Files:**
- Create: `lib/pii.ts`
- Create: `lib/pii.test.ts`

The PII detector runs client-side before a user shares a prompt to the community (V2). Building it in V1 keeps V2 scope smaller and gives us a tested utility ready to wire up.

- [ ] **Step 1: Set up vitest**

```bash
cd promptvault && npm install --save-dev vitest
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write the failing tests first**

Create `lib/pii.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectPii, type PiiMatch } from './pii';

describe('detectPii', () => {
  it('detects email addresses', () => {
    const matches = detectPii('Send a reply to john@example.com please');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('email');
    expect(matches[0].value).toBe('john@example.com');
  });

  it('detects phone numbers', () => {
    const matches = detectPii('Call me at +1 555-123-4567 tomorrow');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('phone');
  });

  it('detects credit card numbers', () => {
    const matches = detectPii('My card is 4111 1111 1111 1111');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('credit_card');
  });

  it('detects SSNs', () => {
    const matches = detectPii('SSN: 123-45-6789');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('ssn');
  });

  it('detects auth tokens in URLs', () => {
    const matches = detectPii('Check https://app.example.com?token=abc123secret');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('auth_token');
  });

  it('returns empty array for clean prompts', () => {
    const matches = detectPii('What is the best CRM for a 10-person startup?');
    expect(matches).toHaveLength(0);
  });

  it('detects multiple PII types in one prompt', () => {
    const matches = detectPii('Email sarah@corp.com or call 555-987-6543');
    expect(matches).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd promptvault && npm test
```

Expected: 7 failures — `detectPii` and `PiiMatch` not defined yet.

- [ ] **Step 4: Implement pii.ts**

Create `lib/pii.ts`:

```typescript
export type PiiType = 'email' | 'phone' | 'credit_card' | 'ssn' | 'auth_token';

export interface PiiMatch {
  type: PiiType;
  value: string;
  index: number;
}

const PATTERNS: { type: PiiType; regex: RegExp }[] = [
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: 'phone',
    // Matches +1 555-123-4567 / (555) 123 4567 / 555.123.4567 etc.
    regex: /(\+?\d[\d\s\-().]{7,}\d)/g,
  },
  {
    type: 'credit_card',
    // 16 digits optionally separated by spaces or dashes
    regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
  },
  {
    type: 'ssn',
    // US SSN: 123-45-6789 or 123 45 6789
    regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
  },
  {
    type: 'auth_token',
    // URL query params that look like credentials
    regex: /https?:\/\/\S+[?&](token|key|auth|secret|api_key)=[^\s&"']+/gi,
  },
];

/**
 * Scans text for PII patterns. Returns all matches found.
 * Empty array means the text is clean.
 */
export function detectPii(text: string): PiiMatch[] {
  const matches: PiiMatch[] = [];

  for (const { type, regex } of PATTERNS) {
    // Reset lastIndex — reusing regex across calls requires this
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ type, value: match[0], index: match.index });
    }
  }

  return matches;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd promptvault && npm test
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add promptvault/lib/pii.ts promptvault/lib/pii.test.ts promptvault/package.json
git commit -m "feat: add PII detection utility with tests"
```

---

## Task 8: Final Build & CWS Prep Check

**Files:**
- No code changes — verification only

- [ ] **Step 1: Full build**

```bash
cd promptvault && npm run build
```

Expected: clean build, no TypeScript errors, no warnings about missing permissions.

- [ ] **Step 2: Run all tests**

```bash
cd promptvault && npm test
```

Expected: all 7 PII tests pass.

- [ ] **Step 3: Load unpacked and do a smoke test**

In Chrome: `chrome://extensions` → "Load unpacked" → select `promptvault/.output/chrome-mv3`

Manual checks:
- [ ] ChatGPT: send a prompt → appears in side panel within 2 seconds
- [ ] Claude: send a prompt → appears in side panel
- [ ] Gemini: send a prompt → appears in side panel
- [ ] Perplexity: ask a question → appears in side panel
- [ ] Dashboard: open via "Library" button → prompts list, search, folders all work
- [ ] Dashboard: Community tab → consent modal on first click → accepted → empty state
- [ ] Dashboard: reload after consent → Community tab shows empty state without modal
- [ ] Dashboard: Export JSON → file downloads
- [ ] Dashboard: Export CSV → file downloads with correct columns
- [ ] Side panel: save 10+ prompts → amber review banner appears
- [ ] Side panel: click "Maybe later" → banner dismissed, never shows again

- [ ] **Step 4: Check Chrome Web Store requirements**

Verify these are ready:
- [ ] Extension icons exist at 16, 32, 48, 128px
- [ ] Privacy policy URL ready
- [ ] At least 3 screenshots (1280x800 or 640x400)
- [ ] Extension description under 132 characters for the short description
- [ ] No remote code execution (no eval, no externally loaded scripts)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: V1 complete — all CWS submission checks passed"
```

---

## Appendix: Replacing YOUR_EXTENSION_ID

After submitting to Chrome Web Store and getting the extension ID:

1. Open `entrypoints/sidepanel/App.tsx`
2. Find: `https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID/reviews`
3. Replace `YOUR_EXTENSION_ID` with the real ID (e.g. `abcdefghijklmnopqrstuvwxyz123456`)
4. Rebuild and publish an update

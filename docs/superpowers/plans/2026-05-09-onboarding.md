# Promptory Onboarding & Analytics Consent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-run onboarding page that collects two independent opt-ins (Google Analytics + Community sharing), wire a privacy-safe analytics module, and add a soft re-prompt banner for users who skip without deciding.

**Architecture:** New `entrypoints/welcome/` WXT entrypoint (auto-opened on install via re-enabled `chrome.runtime.onInstalled`). New `lib/analytics.ts` GA4 Measurement Protocol wrapper, gated by `Settings.analyticsConsent`. All `track()` calls funnel through the background service worker so the consent gate has one structural enforcement point. Existing `Settings` row is extended (Dexie v3 migration); existing UI primitives (`Button`, `Logo`, `Dialog`) are reused.

**Tech Stack:** WXT 0.20, React 19, TypeScript, Tailwind 4, Dexie 4, GA4 Measurement Protocol (no SDK).

**Spec:** `docs/superpowers/specs/2026-05-09-onboarding-design.md`

**Codebase note:** No test runner is configured (vitest was previously installed but removed; package.json has no `test` script). Tasks rely on TypeScript typecheck (`npx tsc --noEmit`) and manual verification rather than unit tests. Do not introduce a test framework as part of this work — that is YAGNI for the current scope.

**Commit policy:** Each task ends with a commit boundary. The user has instructed that commits should not be created without explicit authorization, so the implementing agent should *stage* the commit message and confirm before running `git commit`. The boundary still defines the unit of review.

---

## Task 1: Extend Settings type with analytics fields

**Files:**
- Modify: `promptvault/lib/types.ts`

- [ ] **Step 1: Add new fields to `Settings` interface**

Edit `promptvault/lib/types.ts`. Replace the `Settings` interface (currently at lines 51–62) with:

```typescript
export interface Settings {
  id: 1; // Always 1 — single row
  consentGiven: boolean;
  consentTimestamp: number | null;
  reviewPromptShown: boolean;
  /**
   * Has the first-run onboarding (which presents both consent choices) been
   * completed (Save preferences) or explicitly dismissed (Skip both /
   * banner Dismiss)? When false, sidepanel and dashboard show a soft
   * re-prompt banner.
   */
  onboardingShown?: boolean;
  onboardingShownAt?: number | null;
  /** Anonymous usage analytics (GA4) opt-in — independent of community sharing. */
  analyticsConsent: boolean;
  analyticsConsentAt: number | null;
  /** Stable GA4 client_id, generated lazily on first analytics use. */
  clientId: string;
}
```

- [ ] **Step 2: Verify the type compiles**

Run from `promptvault/`:
```bash
cd promptvault && npx tsc --noEmit
```

Expected: errors in `lib/storage.ts` (it builds a Settings without the new fields) — that's normal, fixed in Task 3. No errors in `lib/types.ts` itself.

- [ ] **Step 3: Stage commit**

```bash
git add promptvault/lib/types.ts
git commit -m "types: extend Settings with analyticsConsent + clientId"
```

---

## Task 2: Bump Dexie schema version

**Files:**
- Modify: `promptvault/lib/db.ts`

The settings table schema in Dexie only declares the primary key (`id`); secondary indexes aren't needed for the new fields, so the `.stores()` call for the settings table doesn't actually change. But Dexie still needs a new version bump so its upgrade hook runs on existing user databases.

- [ ] **Step 1: Add a v3 schema definition with an upgrade hook**

Edit `promptvault/lib/db.ts`. After the existing `db.version(2)` block (line 16–20), append:

```typescript
// Version 3: extend settings rows with analytics opt-in fields. Schema
// indexes don't change — but the upgrade hook backfills defaults on
// existing rows so storage helpers can rely on the fields being present.
db.version(3)
  .stores({
    prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
    folders: 'id, parentId, order',
    settings: 'id',
  })
  .upgrade(async (tx) => {
    await tx.table('settings').toCollection().modify((s: any) => {
      if (s.analyticsConsent === undefined) s.analyticsConsent = false;
      if (s.analyticsConsentAt === undefined) s.analyticsConsentAt = null;
      if (s.clientId === undefined) s.clientId = crypto.randomUUID();
      // Backward-compat: users who already accepted the community modal
      // shouldn't see the soft re-prompt banner. They've made one decision;
      // the analytics question can ride along with the banner only for those
      // who haven't engaged at all.
      if (s.consentGiven === true && s.onboardingShown === undefined) {
        s.onboardingShown = true;
        s.onboardingShownAt = Date.now();
      }
    });
  });
```

- [ ] **Step 2: Verify**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: same Settings-related error in `storage.ts` as Task 1 (still fixed in Task 3). No new errors in `db.ts`.

- [ ] **Step 3: Stage commit**

```bash
git add promptvault/lib/db.ts
git commit -m "db: dexie v3 with backfill for analyticsConsent + clientId"
```

---

## Task 3: Update storage helpers and DEFAULT_SETTINGS

**Files:**
- Modify: `promptvault/lib/storage.ts`

- [ ] **Step 1: Update `DEFAULT_SETTINGS` constant (line ~198)**

Replace the existing `DEFAULT_SETTINGS` (currently lines 198–203) with:

```typescript
const DEFAULT_SETTINGS: Settings = {
  id: 1,
  consentGiven: false,
  consentTimestamp: null,
  reviewPromptShown: false,
  onboardingShown: false,
  onboardingShownAt: null,
  analyticsConsent: false,
  analyticsConsentAt: null,
  clientId: '', // populated lazily by getOrCreateClientId()
};
```

- [ ] **Step 2: Add `setAnalyticsConsent` helper after `setConsent` (around line 217)**

Append this function right after the existing `setConsent` function:

```typescript
export async function setAnalyticsConsent(given: boolean): Promise<void> {
  const current = await getSettings();
  await db.settings.put({
    ...current,
    analyticsConsent: given,
    analyticsConsentAt: given ? Date.now() : null,
  });
}
```

- [ ] **Step 3: Add `getOrCreateClientId` helper**

Append after `setAnalyticsConsent`:

```typescript
/**
 * Returns the GA4 client_id for this install, generating + persisting one
 * the first time it's needed. Called only by the analytics module — never
 * generates an id unless analytics is actually being used.
 */
export async function getOrCreateClientId(): Promise<string> {
  const current = await getSettings();
  if (current.clientId) return current.clientId;
  const clientId = crypto.randomUUID();
  await db.settings.put({ ...current, clientId });
  return clientId;
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Stage commit**

```bash
git add promptvault/lib/storage.ts
git commit -m "storage: add setAnalyticsConsent + getOrCreateClientId"
```

---

## Task 4: Create the analytics module

**Files:**
- Create: `promptvault/lib/analytics.ts`

- [ ] **Step 1: Write the analytics module**

Create `promptvault/lib/analytics.ts`:

```typescript
import { getOrCreateClientId, getSettings } from './storage';

/**
 * GA4 Measurement Protocol wrapper.
 *
 * All calls to track() funnel through the background service worker so the
 * consent gate has exactly one enforcement point. UI surfaces (welcome,
 * sidepanel, dashboard) and content scripts never call track() directly —
 * they send `chrome.runtime.sendMessage({ type: 'TRACK', event, params })`
 * instead.
 *
 * The Measurement Protocol API secret is bundled into the extension and is
 * therefore not a real cryptographic secret. Rotate via the GA admin if
 * abuse is detected. This is a documented limitation of GA4 + MV3.
 */

// Replace these placeholders before shipping. They can be checked into
// source — the API secret is visible to anyone who unzips the .crx anyway.
const MEASUREMENT_ID = 'G-PLACEHOLDER';
const API_SECRET = 'PLACEHOLDER_API_SECRET';
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

export type AnalyticsEvent =
  | 'extension_installed'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'prompt_captured'
  | 'platform_visited'
  | 'dashboard_opened'
  | 'sidepanel_opened'
  | 'consent_changed'
  | 'prompt_exported'
  | 'review_rated'
  | 'error';

export type AnalyticsParams = Record<string, string | number | boolean>;

/**
 * Forbidden parameter keys — even if a caller sends one, the helper strips
 * it before posting. Defense in depth: makes accidental data leakage
 * structurally impossible, not just code-review-prevented.
 */
const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /text$/i,
  /url$/i,
  /^prompt(?!_chars$)/i,
  /^response(?!_chars$)/i,
  /email/i,
];

const MAX_STRING_LEN = 100;
const MAX_NUMBER = 1_000_000;

function sanitizeParams(params: AnalyticsParams): AnalyticsParams {
  const out: AnalyticsParams = {};
  for (const [key, raw] of Object.entries(params)) {
    if (FORBIDDEN_KEY_PATTERNS.some((re) => re.test(key))) continue;
    if (typeof raw === 'string') {
      out[key] = raw.length > MAX_STRING_LEN ? raw.slice(0, MAX_STRING_LEN) : raw;
    } else if (typeof raw === 'number') {
      // Clamp to a sane positive range; reject NaN/Infinity.
      if (!Number.isFinite(raw)) continue;
      out[key] = Math.max(0, Math.min(MAX_NUMBER, Math.trunc(raw)));
    } else if (typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  return out;
}

/**
 * Send an event to GA4 if and only if analytics consent is currently true.
 * Catches and logs all failures — telemetry never throws into the app.
 */
export async function track(
  event: AnalyticsEvent,
  params: AnalyticsParams = {},
): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.analyticsConsent) return;

    const clientId = await getOrCreateClientId();
    const cleanParams = sanitizeParams(params);

    const url = `${GA_ENDPOINT}?measurement_id=${encodeURIComponent(
      MEASUREMENT_ID,
    )}&api_secret=${encodeURIComponent(API_SECRET)}`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: [{ name: event, params: cleanParams }],
      }),
    });
  } catch (err) {
    console.warn('[Promptory] analytics.track failed', event, err);
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Stage commit**

```bash
git add promptvault/lib/analytics.ts
git commit -m "analytics: add GA4 Measurement Protocol wrapper with sanitizer"
```

---

## Task 5: Wire TRACK message handler in background

**Files:**
- Modify: `promptvault/entrypoints/background.ts`

- [ ] **Step 1: Import the analytics module**

At the top of `promptvault/entrypoints/background.ts` (around line 1–2), add:

```typescript
import { track, type AnalyticsEvent, type AnalyticsParams } from '../lib/analytics';
```

- [ ] **Step 2: Add a TRACK message handler inside the existing `chrome.runtime.onMessage.addListener` callback**

The listener starts at line 40. Inside that callback, after the existing `GCLID_CAPTURED` block (right before the `BRIDGE_HANDSHAKE_COMPLETE` block at line 176), insert:

```typescript
    if (message?.type === 'TRACK') {
      const event = message.event as AnalyticsEvent;
      const params = (message.params ?? {}) as AnalyticsParams;
      // Fire and forget — sender doesn't need the result.
      void track(event, params);
      sendResponse({ ok: true });
      return true;
    }
```

- [ ] **Step 3: Verify typecheck**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Stage commit**

```bash
git add promptvault/entrypoints/background.ts
git commit -m "background: handle TRACK message via analytics module"
```

---

## Task 6: Create welcome page entrypoint scaffold

**Files:**
- Create: `promptvault/entrypoints/welcome/index.html`
- Create: `promptvault/entrypoints/welcome/main.tsx`

- [ ] **Step 1: Create `promptvault/entrypoints/welcome/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Promptory</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `promptvault/entrypoints/welcome/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from '../../components/ui';
import '../../styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 3: Verify the styles import path**

```bash
ls promptvault/styles/globals.css
```

Expected: file exists. If it does not (path differs), find the correct path with `find promptvault -name globals.css` and update the import in `main.tsx`. Do NOT proceed to Task 7 until this resolves.

- [ ] **Step 4: Stage commit (App.tsx is added in Task 7, so this commit will fail to build until Task 7 is also done — defer the commit until after Task 7)**

Skip the commit here. Move to Task 7.

---

## Task 7: Implement the welcome page UI

**Files:**
- Create: `promptvault/entrypoints/welcome/App.tsx`

- [ ] **Step 1: Create `promptvault/entrypoints/welcome/App.tsx`**

```typescript
import { useState } from 'react';
import { Button, Logo } from '../../components/ui';
import {
  setAnalyticsConsent,
  setConsent,
  markOnboardingShown,
} from '../../lib/storage';

type ExitMode = 'save' | 'skip' | 'later';

export default function App() {
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [communityOn, setCommunityOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const trackBg = (
    event: string,
    params: Record<string, string | number | boolean> = {},
  ) => {
    chrome.runtime
      .sendMessage({ type: 'TRACK', event, params })
      .catch(() => {/* fire-and-forget */});
  };

  const persistAndClose = async (mode: ExitMode) => {
    setBusy(true);
    try {
      if (mode === 'save') {
        await setAnalyticsConsent(analyticsOn);
        await setConsent(communityOn);
        await markOnboardingShown();
        // Important: trackBg() runs AFTER setAnalyticsConsent so the
        // background's track() helper sees the new flag.
        trackBg('onboarding_completed', {
          analytics_opt_in: analyticsOn,
          community_opt_in: communityOn,
        });
      } else if (mode === 'skip') {
        await setAnalyticsConsent(false);
        await setConsent(false);
        await markOnboardingShown();
        // No track here — analytics is off.
      } else {
        // 'later' — leave everything as-is, don't mark onboardingShown.
        // No track here either; we don't know consent yet.
      }
    } finally {
      // Always redirect to the dashboard so the welcome tab doesn't
      // hang around. Use chrome.tabs.update on this tab id rather than
      // window.location so the URL bar reflects the dashboard cleanly.
      const dashboardUrl = chrome.runtime.getURL('/dashboard.html');
      window.location.replace(dashboardUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <Logo size={48} />
            <h1 className="mt-4 text-2xl font-semibold text-gray-900">
              Welcome to Promptory
            </h1>
            <p className="mt-3 max-w-md text-sm text-gray-600">
              Promptory auto-saves every prompt you send to ChatGPT, Claude,
              Gemini, and 3 more — locally, on your device. No account
              needed. Already working.
            </p>
          </div>

          <hr className="my-8 border-gray-100" />

          <p className="mb-4 text-sm font-medium text-gray-700">
            Two optional extras — you can change these anytime:
          </p>

          <ConsentToggle
            checked={analyticsOn}
            onChange={setAnalyticsOn}
            title="Anonymous usage analytics"
            body={
              <>
                Helps us see which AI tools people use most and fix bugs
                faster. Sent to Google Analytics.{' '}
                <strong className="text-gray-900">
                  No prompt content is ever shared.
                </strong>
              </>
            }
          />

          <ConsentToggle
            checked={communityOn}
            onChange={setCommunityOn}
            title="Contribute to the community library"
            body={
              <>
                Anonymized prompts help build a shared library of great
                prompts for everyone. Coming with V2.{' '}
                <a
                  href="https://promptory.chat/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline hover:text-brand-700"
                >
                  Read what's anonymized
                </a>
              </>
            }
          />

          <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => persistAndClose('later')}
              disabled={busy}
            >
              Decide later
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => persistAndClose('skip')}
              disabled={busy}
            >
              Skip both
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => persistAndClose('save')}
              disabled={busy}
            >
              Save preferences
            </Button>
          </div>
        </div>

        <Faq />
      </main>
    </div>
  );
}

function ConsentToggle({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <label
      className={`mb-3 flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
        checked
          ? 'border-brand-300 bg-brand-50/40'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      <div>
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-1 text-xs text-gray-600">{body}</div>
      </div>
    </label>
  );
}

function Faq() {
  return (
    <div className="mt-8 space-y-2 text-sm">
      <FaqItem question="What's anonymized in the community library?">
        <>
          Before any prompt leaves your device, it's scanned for emails,
          phone numbers, credit card numbers, and other identifiers. Anything
          detected is replaced with a placeholder like{' '}
          <code className="rounded bg-gray-100 px-1 text-xs">[email]</code>.
          A second sanitizer runs on our server, and every shared prompt is
          manually reviewed before it appears publicly. You can opt out at
          any time.
        </>
      </FaqItem>
      <FaqItem question="What does the analytics actually track?">
        <>
          Which AI tools you capture from (platform name only), how many
          prompts per day, when you open the dashboard or sidepanel, and
          basic version info. Never the prompt text, response text, or URLs.
        </>
      </FaqItem>
      <FaqItem question="How do I opt out later?">
        <>
          Open the dashboard → header settings menu → toggle either consent
          off. Local capture continues to work either way.
        </>
      </FaqItem>
    </div>
  );
}

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-800">
        {question}
      </summary>
      <div className="mt-2 text-sm text-gray-600">{children}</div>
    </details>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Build to verify WXT picks up the new entrypoint**

```bash
cd promptvault && npm run build
```

Expected: build succeeds, `.output/chrome-mv3/welcome.html` exists.

- [ ] **Step 4: Stage commit (covers Task 6 + 7)**

```bash
git add promptvault/entrypoints/welcome/
git commit -m "welcome: add onboarding entrypoint with two consent toggles"
```

---

## Task 8: Re-enable onInstalled to open welcome on fresh install

**Files:**
- Modify: `promptvault/entrypoints/background.ts`

- [ ] **Step 1: Replace the commented-out onInstalled block**

In `promptvault/entrypoints/background.ts`, the comment block at lines 20–38 documents an intentionally-disabled welcome opener. Replace lines 20–38 with:

```typescript
  // First-install welcome: open the in-extension onboarding tab.
  //
  // Only fires on `reason === 'install'` so updates don't re-pester users
  // who've already onboarded. The page lives at `welcome.html` (built by
  // WXT from `entrypoints/welcome/`) and persists consent locally — no
  // network hit on first run.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;
    chrome.tabs
      .create({ url: chrome.runtime.getURL('/welcome.html') })
      .catch((err) =>
        console.warn('[Promptory] Failed to open welcome page', err),
      );
    // Fire the install event — track() will no-op until the user opts in,
    // but firing it here means we record the install moment for users who
    // *do* opt in, instead of losing the very first event in their session.
    void track('extension_installed', {
      version: chrome.runtime.getManifest().version,
    });
  });
```

- [ ] **Step 2: Verify typecheck**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Stage commit**

```bash
git add promptvault/entrypoints/background.ts
git commit -m "background: open welcome tab on first install"
```

---

## Task 9: Track prompt_captured events from background

**Files:**
- Modify: `promptvault/entrypoints/background.ts`

- [ ] **Step 1: Fire `prompt_captured` after each successful save**

Inside the existing `PROMPT_CAPTURED` handler (around lines 89–115), add a `track()` call inside the `.then()` callback. Locate the line:

```typescript
          chrome.runtime
            .sendMessage({ type: 'PROMPT_SAVED', payload: { id } })
            .catch(() => {/* no listeners — fine */});
```

Immediately after that broadcast, add:

```typescript
          // Fire telemetry — track() no-ops if the user hasn't opted in.
          // Only lengths are sent; the helper's sanitizer would strip
          // anything else even if we tried.
          void track('prompt_captured', {
            platform,
            had_response: responseText.length > 0,
            prompt_chars: promptText.length,
            response_chars: responseText.length,
          });
```

- [ ] **Step 2: Verify typecheck**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Stage commit**

```bash
git add promptvault/entrypoints/background.ts
git commit -m "analytics: emit prompt_captured event after save"
```

---

## Task 10: Add soft re-prompt banner to sidepanel

**Files:**
- Modify: `promptvault/entrypoints/sidepanel/App.tsx`

- [ ] **Step 1: Read `onboardingShown` and add `dashboard_opened`-equivalent ping**

In `promptvault/entrypoints/sidepanel/App.tsx`, near the existing `useState` declarations (around line 40), add:

```typescript
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);
```

In the existing `useEffect` that calls `checkReviewPrompt`, extend it (or add a new effect) to read settings once on mount:

```typescript
  useEffect(() => {
    getSettings().then((s) => {
      if (!s.onboardingShown) setShowOnboardingBanner(true);
    });
    // Fire-and-forget telemetry — track() no-ops if not consented.
    chrome.runtime
      .sendMessage({ type: 'TRACK', event: 'sidepanel_opened' })
      .catch(() => {/* fire-and-forget */});
  }, []);
```

- [ ] **Step 2: Add dismiss handler**

After the existing `handleDismissReview` (around line 124), add:

```typescript
  const handleOpenSetup = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
  };

  const handleDismissOnboardingBanner = async () => {
    await markOnboardingShown();
    setShowOnboardingBanner(false);
    chrome.runtime
      .sendMessage({
        type: 'TRACK',
        event: 'onboarding_skipped',
        params: { via: 'banner_dismiss' },
      })
      .catch(() => {/* fire-and-forget */});
  };
```

You'll need to import `markOnboardingShown` — extend the existing import at the top:

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
  markOnboardingShown,
} from '../../lib/storage';
```

- [ ] **Step 3: Render the banner**

In the JSX, just before the existing review banner block (around line 305 — `{showReviewBanner && reviewStep === 'rate' && (`), add:

```tsx
      {showOnboardingBanner && (
        <div className="mx-3 mt-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
          <p className="text-xs font-medium text-brand-800">
            Finish setup
          </p>
          <p className="mt-0.5 text-xs text-brand-700">
            Choose your privacy preferences — analytics &amp; community.
          </p>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={handleOpenSetup}
              className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Open setup →
            </button>
            <button
              onClick={handleDismissOnboardingBanner}
              className="text-xs text-brand-600 hover:text-brand-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify typecheck**

```bash
cd promptvault && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Stage commit**

```bash
git add promptvault/entrypoints/sidepanel/App.tsx
git commit -m "sidepanel: soft re-prompt onboarding banner + telemetry"
```

---

## Task 11: Add soft re-prompt banner + opt-out affordance to dashboard

**Files:**
- Modify: `promptvault/entrypoints/dashboard/App.tsx`

- [ ] **Step 1: Add `onboardingShown` state and load it**

Near the existing `useState` declarations (around line 48), add:

```typescript
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(false);
```

In the existing `useEffect` at line 82 (`loadFolders(); getSettings().then(...)`), extend the settings handler:

```typescript
  useEffect(() => {
    loadFolders();
    getSettings().then((s) => {
      setConsentGiven(s.consentGiven);
      setAnalyticsOn(s.analyticsConsent);
      if (!s.onboardingShown) setShowOnboardingBanner(true);
    });
    chrome.runtime
      .sendMessage({ type: 'TRACK', event: 'dashboard_opened' })
      .catch(() => {/* fire-and-forget */});
  }, [loadFolders]);
```

- [ ] **Step 2: Import `markOnboardingShown` and `setAnalyticsConsent`**

Extend the existing storage import block (currently lines 4–20) to include the new helpers:

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
  setAnalyticsConsent,
  markOnboardingShown,
} from '../../lib/storage';
```

- [ ] **Step 3: Add handlers for the banner and the analytics toggle**

After the existing `handleAcceptConsent` (around line 202), add:

```typescript
  const handleOpenSetup = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
  };

  const handleDismissOnboardingBanner = async () => {
    await markOnboardingShown();
    setShowOnboardingBanner(false);
    chrome.runtime
      .sendMessage({
        type: 'TRACK',
        event: 'onboarding_skipped',
        params: { via: 'banner_dismiss' },
      })
      .catch(() => {/* fire-and-forget */});
  };

  const handleAnalyticsToggle = async (next: boolean) => {
    await setAnalyticsConsent(next);
    setAnalyticsOn(next);
    // The track() helper reads consent fresh, so this fires only when
    // the user is opting IN; opting out never fires anything.
    chrome.runtime
      .sendMessage({
        type: 'TRACK',
        event: 'consent_changed',
        params: { setting: 'analytics', new_value: next },
      })
      .catch(() => {/* fire-and-forget */});
  };
```

- [ ] **Step 4: Render the banner just below the header**

Locate the closing `</header>` tag (around line 314). Immediately after it, before the `{activeTab === 'library' ? (` line (around 316), add:

```tsx
      {showOnboardingBanner && (
        <div className="border-b border-brand-200 bg-brand-50 px-6 py-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-brand-800">
                Finish setup
              </span>
              <span className="ml-2 text-sm text-brand-700">
                Choose your privacy preferences — analytics &amp; community.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenSetup}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Open setup →
              </button>
              <button
                onClick={handleDismissOnboardingBanner}
                className="text-sm text-brand-600 hover:text-brand-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add a minimal analytics opt-out toggle**

Add a small Settings section in the header right side. Locate the existing `<Button variant="secondary" ...>Export CSV</Button>` (around line 281–285). Right before it (or right after, before the closing `</div>` at line 286), add:

```tsx
            <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-2 select-none cursor-pointer" title="Toggle anonymous usage analytics">
              <input
                type="checkbox"
                checked={analyticsOn}
                onChange={(e) => handleAnalyticsToggle(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Analytics
            </label>
```

- [ ] **Step 6: Verify typecheck and build**

```bash
cd promptvault && npx tsc --noEmit && npm run build
```

Expected: 0 errors, build succeeds.

- [ ] **Step 7: Stage commit**

```bash
git add promptvault/entrypoints/dashboard/App.tsx
git commit -m "dashboard: onboarding banner + analytics opt-out toggle"
```

---

## Task 12: Manual verification checklist

This task is verification only — no code changes. Execute each path and document the result.

**Files:** none

- [ ] **Step 1: Build and load the extension**

```bash
cd promptvault && npm run build
```

In Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → select `promptvault/.output/chrome-mv3`.

- [ ] **Step 2: Verify auto-open on fresh install**

Remove any prior install of Promptory (so this counts as a fresh install). Reload the unpacked extension. A new tab at `chrome-extension://<id>/welcome.html` should open automatically.

Expected:
- Welcome card centered, brand-colored Logo + heading + body copy
- Two unchecked toggles
- Three buttons: "Decide later", "Skip both", "Save preferences"
- FAQ section below the card

- [ ] **Step 3: Verify "Save preferences" path**

Toggle both consents on → click "Save preferences".

Expected:
- Tab redirects to `dashboard.html`
- Open Chrome DevTools → Application → IndexedDB → `PromptoryDB` → `settings` → row id=1 should show `analyticsConsent: true`, `consentGiven: true`, `onboardingShown: true`, `clientId: <uuid>`

- [ ] **Step 4: Verify "Decide later" path**

Re-uninstall + re-install. On the welcome tab, click "Decide later" without toggling anything.

Expected:
- Redirects to dashboard
- Settings: `onboardingShown: false`
- Dashboard shows the brand-colored "Finish setup" banner under the header
- Sidepanel (click toolbar icon) shows the same banner above the prompt list

- [ ] **Step 5: Verify banner dismiss**

In the dashboard, click "Dismiss" on the banner.

Expected:
- Banner disappears
- Settings: `onboardingShown: true`, both consents still `false`
- Sidepanel banner also gone (refresh sidepanel to confirm)

- [ ] **Step 6: Verify "Skip both" path**

Re-install. Click "Skip both".

Expected:
- Redirects to dashboard, no banner appears
- Settings: `onboardingShown: true`, both consents `false`

- [ ] **Step 7: Verify analytics gating**

With analytics opted-out, capture a prompt on chatgpt.com.

Open Chrome DevTools → Network panel (filter `google-analytics.com`).
Expected: 0 requests to GA.

Toggle analytics on via the dashboard header checkbox. Capture another prompt.
Expected: 1 POST to `https://www.google-analytics.com/mp/collect` with body containing `prompt_captured`, `platform: chatgpt`.

- [ ] **Step 8: Verify GA4 DebugView**

Add `&debug_mode=true` to the GA4 endpoint temporarily (or use the GA4 DebugView with the Measurement Protocol Debug API). Confirm events appear in the GA admin within ~1 minute.

- [ ] **Step 9: Verify backward-compat for existing users**

In DevTools, manually edit an existing settings row to mimic a pre-onboarding user: `consentGiven: true`, `onboardingShown: undefined`. Reload the extension.

Expected: the Dexie v3 upgrade hook backfills `onboardingShown: true` so the banner does NOT appear.

- [ ] **Step 10: Tag remaining work**

If any verification step failed, file an issue (or add a follow-up commit) before declaring the feature complete. If all steps pass, this task is done.

---

## Self-Review

Spec coverage check (each spec section → task that covers it):

- §3 Data Model → Tasks 1, 2, 3 ✓
- §4 Consent Matrix → Tasks 7, 9 (capture works regardless of consent; track() is the only consent-gated path) ✓
- §5.1 UI Layout → Task 7 ✓
- §5.2 Button Behavior → Task 7 ✓
- §5.3 FAQ → Task 7 ✓
- §5.4 Soft re-prompt banner → Tasks 10, 11 ✓
- §6 Analytics Module → Task 4 ✓
- §6.3 background as the only track() caller → Tasks 5, 8, 9; UI surfaces send TRACK messages → Tasks 7, 10, 11 ✓
- §7.1 Event Catalog → all events except `error` and `prompt_exported` and `review_rated` and `platform_visited` are wired. `error` will be added ad-hoc inside background catch blocks; `prompt_exported`/`review_rated`/`platform_visited` are deferred — call them out below.
- §8 Data flow → Tasks 7, 8 ✓
- §9 Files Affected → all touched ✓
- §10 Privacy disclosures → out-of-repo (privacy policy + CWS form), not implementable here ✓
- §11 Edge cases → install vs update handled in Task 8 ✓; clear-data → fresh install handled by Dexie auto-create; network-down handled by `try/catch` in `track()` Task 4
- §12 Testing → Task 12 (manual; no test runner per project convention) ✓
- §13 Out of Scope → respected ✓
- §14 Backward compat → Task 2 upgrade hook ✓

**Gaps deferred (outside this plan, document for follow-up):**
- `prompt_exported` event in dashboard's `handleExport` / `handleExportCsv`
- `review_rated` event in sidepanel's `handleRateStar`
- `platform_visited` event from content scripts (requires a per-platform-per-day deduplication store; adds scope; defer)
- `error` event in background catch blocks (cosmetic; defer)

These are all single-line `chrome.runtime.sendMessage({ type: 'TRACK', ... })` calls that can be added in a follow-up PR without architectural change.

**Placeholder scan:** searched for "TBD", "TODO", "fill in" in the plan — none found. The two `PLACEHOLDER` strings in `lib/analytics.ts` are intentional (real values come from GA admin and are user-provided pre-deploy).

**Type consistency:** `setAnalyticsConsent`, `markOnboardingShown`, `getOrCreateClientId`, `track`, `AnalyticsEvent`, `AnalyticsParams` — all referenced consistently across tasks.

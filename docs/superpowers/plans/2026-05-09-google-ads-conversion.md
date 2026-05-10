# Google Ads Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the install → bridge → conversion → welcome flow so Google Ads receives an offline conversion when an ad-clicking user installs the extension. Persist gclid in extension-side IndexedDB so future day-7/day-30 retention reporting can use it.

**Architecture:** On install, background opens `https://promptory.chat/setting-up/`. The existing content script reads the gclid from `localStorage` (set earlier by `/go`), sends it to background, which persists to a new Dexie `gclids` table and POSTs to the conversion API. Background then swaps the bridge tab to the existing local `welcome.html` onboarding. A 6-second fallback timer rescues users whose bridge tab never reports back (offline / blocked domain).

**Tech Stack:** TypeScript, WXT (extension framework), Dexie 4 (IndexedDB), Astro (landing site), Chrome MV3 (`chrome.runtime`, `chrome.tabs`).

**Spec:** `docs/superpowers/specs/2026-05-09-google-ads-conversion-design.md`

**No test framework available** — vitest isn't installed and the spec marked tests optional. Verification per task is `cd promptvault && npm run build` (catches type/syntax errors via the WXT pipeline) + a manual smoke test at the end.

---

## File map

| File | Change |
|---|---|
| `promptvault/lib/types.ts` | Add `Gclid` interface |
| `promptvault/lib/db.ts` | Bump Dexie schema to v4, add `gclids` table |
| `promptvault/lib/storage.ts` | Add `saveGclid` and `markGclidReported` helpers |
| `promptvault/entrypoints/background.ts` | Refactor `GCLID_CAPTURED` handler; rewire `onInstalled` to open bridge + start fallback timer; rename + retarget swap handler |
| `promptvault/entrypoints/promptory-site.content.ts` | Fix trailing-slash path check; rename outgoing message |

---

### Task 1: Add `Gclid` type

**Files:**
- Modify: `promptvault/lib/types.ts`

- [ ] **Step 1: Append the `Gclid` interface to `types.ts`**

Add this block at the end of `promptvault/lib/types.ts` (after the existing `Settings` interface):

```ts
/**
 * One row per ad-click → install. Persisted in IndexedDB so future
 * day-7 / day-30 retention conversions (via chrome.alarms) can find
 * the original gclid weeks after install — the website's localStorage
 * isn't reliable for that timescale.
 */
export interface Gclid {
  id: string;            // the gclid value itself; primary key
  capturedAt: number;    // timestamp from page-side localStorage
  persistedAt: number;   // when the extension first saw it
  reportedAt: {
    install?: number;
    day7?: number;       // populated by future retention work
    day30?: number;      // populated by future retention work
  };
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd promptvault && npm run build`
Expected: build completes without TypeScript errors. (No file uses `Gclid` yet, so nothing else can break.)

- [ ] **Step 3: Commit**

```bash
git add promptvault/lib/types.ts
git commit -m "feat: add Gclid type for ad-conversion persistence"
```

---

### Task 2: Bump Dexie schema to v4 with `gclids` table

**Files:**
- Modify: `promptvault/lib/db.ts`

- [ ] **Step 1: Update the typed handle and add the v4 schema block**

Replace the entire contents of `promptvault/lib/db.ts` with:

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Prompt, Folder, Settings, Gclid } from './types';

const db = new Dexie('PromptoryDB') as Dexie & {
  prompts: EntityTable<Prompt, 'id'>;
  folders: EntityTable<Folder, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  gclids: EntityTable<Gclid, 'id'>;
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

// Version 3: extend settings rows with analytics opt-in fields. Schema
// indexes don't change — but the upgrade hook backfills defaults on
// existing rows so storage helpers can rely on the fields being present.
// Existing users who already accepted the community modal are marked
// onboardingShown=true so they don't see the soft re-prompt banner.
db.version(3)
  .stores({
    prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
    folders: 'id, parentId, order',
    settings: 'id',
  })
  .upgrade(async (tx) => {
    await tx
      .table('settings')
      .toCollection()
      .modify((s: Record<string, unknown>) => {
        if (s.analyticsConsent === undefined) s.analyticsConsent = false;
        if (s.analyticsConsentAt === undefined) s.analyticsConsentAt = null;
        if (s.clientId === undefined) s.clientId = crypto.randomUUID();
        if (s.consentGiven === true && s.onboardingShown === undefined) {
          s.onboardingShown = true;
          s.onboardingShownAt = Date.now();
        }
      });
  });

// Version 4: new gclids table for Google Ads offline conversions.
// Primary key is the gclid string itself so re-captures of the same
// gclid upsert cleanly. capturedAt is indexed for future scheduled
// queries (e.g. "all gclids older than 7 days that haven't reported
// the day7 conversion yet").
db.version(4).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
  settings: 'id',
  gclids: 'id, capturedAt',
});

export { db };
```

- [ ] **Step 2: Verify build**

Run: `cd promptvault && npm run build`
Expected: build succeeds. WXT regenerates types and ensures the EntityTable typing compiles.

- [ ] **Step 3: Commit**

```bash
git add promptvault/lib/db.ts
git commit -m "feat: Dexie v4 schema with gclids table"
```

---

### Task 3: Add gclid storage helpers

**Files:**
- Modify: `promptvault/lib/storage.ts`

- [ ] **Step 1: Update the import line at the top**

Find this line at the top of `promptvault/lib/storage.ts`:

```ts
import type { Prompt, Folder, ExportData, Settings } from './types';
```

Replace with:

```ts
import type { Prompt, Folder, ExportData, Settings, Gclid } from './types';
```

- [ ] **Step 2: Append the gclid helpers to the end of the file**

Add this block to the end of `promptvault/lib/storage.ts`:

```ts
// ── Gclids ───────────────────────────────────────────────

/**
 * Persists a gclid captured from the bridge content script. Uses `put`
 * so re-captures of the same gclid upsert cleanly. `reportedAt` starts
 * empty; `markGclidReported` populates fields as each conversion fires.
 */
export async function saveGclid(value: string, capturedAt: number): Promise<void> {
  await db.gclids.put({
    id: value,
    capturedAt,
    persistedAt: Date.now(),
    reportedAt: {},
  });
}

/**
 * Marks one of the per-event timestamps on an existing gclid row.
 * No-op if the row doesn't exist (defensive — should never happen since
 * callers chain mark-after-save, but cheap insurance against future
 * callers that look up by gclid string from elsewhere).
 */
export async function markGclidReported(
  value: string,
  event: 'install' | 'day7' | 'day30',
): Promise<void> {
  const row = await db.gclids.get(value);
  if (!row) return;
  await db.gclids.update(value, {
    reportedAt: { ...row.reportedAt, [event]: Date.now() },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `cd promptvault && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add promptvault/lib/storage.ts
git commit -m "feat: saveGclid and markGclidReported helpers"
```

---

### Task 4: Refactor `GCLID_CAPTURED` handler to persist + chain POST

**Files:**
- Modify: `promptvault/entrypoints/background.ts`

This task changes the message handler to persist before responding, then fires the conversion POST chained off the persist promise (so `markGclidReported` always sees the row). The install handler and swap handler are *not* changed here — those come in Task 5.

- [ ] **Step 1: Update the import block at the top of `background.ts`**

Find this multi-line import block at the top of `promptvault/entrypoints/background.ts` (lines 1-7):

```ts
import {
  addPrompt,
  getPromptCount,
  markReviewPromptShown,
  getSettings,
  getOrCreateClientId,
} from '../lib/storage';
```

Replace with:

```ts
import {
  addPrompt,
  getPromptCount,
  markReviewPromptShown,
  getSettings,
  getOrCreateClientId,
  saveGclid,
  markGclidReported,
} from '../lib/storage';
```

- [ ] **Step 2: Replace the `GCLID_CAPTURED` handler block**

In `promptvault/entrypoints/background.ts`, find this entire block (currently lines 87-119):

```ts
    // gclid forwarded from the content script running on promptory.chat —
    // ship it to our backend which uploads the offline conversion to Google Ads.
    if (message?.type === 'GCLID_CAPTURED') {
      const { gclid, capturedAt } = message.payload ?? {};
      if (!gclid || typeof gclid !== 'string') {
        sendResponse({ ok: false, error: 'invalid gclid' });
        return true;
      }
      fetch(`${API_BASE}/v1/conversion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gclid,
          conversionTime: new Date().toISOString(),
          capturedAt,
        }),
      })
        .then(async (res) => {
          const body = await res.text();
          if (!res.ok) {
            console.warn('[Promptory] conversion API returned', res.status, body);
            sendResponse({ ok: false, status: res.status });
          } else {
            console.log('[Promptory] conversion reported');
            sendResponse({ ok: true });
          }
        })
        .catch((err) => {
          console.warn('[Promptory] conversion POST failed', err);
          sendResponse({ ok: false, error: String(err) });
        });
      return true; // keep channel open for async sendResponse
    }
```

Replace it with:

```ts
    // gclid forwarded from the content script running on promptory.chat.
    // Two responsibilities:
    //   1. Persist to db.gclids so future retention conversions (day-7,
    //      day-30 via chrome.alarms) can find the original gclid weeks
    //      from now.
    //   2. Fire the install conversion POST. Chained off the persist
    //      promise so markGclidReported can never race a not-yet-
    //      committed row (fetch can finish before IDB on fast networks).
    if (message?.type === 'GCLID_CAPTURED') {
      const { gclid, capturedAt } = message.payload ?? {};
      if (!gclid || typeof gclid !== 'string') {
        sendResponse({ ok: false, error: 'invalid gclid' });
        return true;
      }

      saveGclid(gclid, capturedAt ?? Date.now())
        .then(() => {
          // Extension owns the data now — page-side localStorage will
          // be cleared by the content script regardless of POST outcome.
          sendResponse({ ok: true });

          fetch(`${API_BASE}/v1/conversion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gclid,
              conversionTime: new Date().toISOString(),
              capturedAt,
            }),
          })
            .then(async (res) => {
              const body = await res.text();
              if (!res.ok) {
                console.warn('[Promptory] conversion API returned', res.status, body);
                return;
              }
              console.log('[Promptory] conversion reported');
              await markGclidReported(gclid, 'install');
            })
            .catch((err) => console.warn('[Promptory] conversion POST failed', err));
        })
        .catch((err) => {
          console.warn('[Promptory] gclid persist failed', err);
          sendResponse({ ok: false, error: String(err) });
        });

      return true; // keep channel open for async sendResponse
    }
```

- [ ] **Step 3: Verify build**

Run: `cd promptvault && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add promptvault/entrypoints/background.ts
git commit -m "refactor: persist gclid to Dexie before POST; chain mark on success"
```

---

### Task 5: Wire up the install → bridge → welcome flow (atomic change)

**Files:**
- Modify: `promptvault/entrypoints/background.ts` (install handler + swap handler)
- Modify: `promptvault/entrypoints/promptory-site.content.ts` (path normalization + message rename)

This task touches both files together because the message rename must be coordinated — sending the new name from the content script while the background still listens for the old name (or vice versa) would break the swap.

- [ ] **Step 1: Add the fallback-timer module-scope state to `background.ts`**

In `promptvault/entrypoints/background.ts`, find this line (currently line 12):

```ts
const API_BASE = 'https://api.promptory.chat';
```

Replace with these three lines (the existing `API_BASE` line stays; we add two new module-scope constants below it):

```ts
const API_BASE = 'https://api.promptory.chat';

// Per-install fallback timer state. If the bridge tab's content script
// never reports back (offline, promptory.chat blocked, slow load) we
// force-swap the tab to the welcome page after BRIDGE_FALLBACK_MS so
// the user isn't stranded on a spinner.
const BRIDGE_FALLBACK_MS = 6000;
const bridgeFallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();
```

- [ ] **Step 2: Replace the `onInstalled` handler in `background.ts`**

Find this block (currently lines 70-84):

```ts
  // First-install welcome: open the in-extension onboarding tab.
  // Only fires on `reason === 'install'` so updates don't re-pester users
  // who've already onboarded. The page lives at `welcome.html` (built by
  // WXT from `entrypoints/welcome/`) and persists consent locally.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;
    chrome.tabs
      .create({ url: chrome.runtime.getURL('/welcome.html') })
      .catch((err) =>
        console.warn('[Promptory] Failed to open welcome page', err),
      );
    void track('extension_installed', {
      version: chrome.runtime.getManifest().version,
    });
  });
```

Replace with:

```ts
  // First install: open the promptory.chat bridge so the content script
  // can forward any stored gclid to the conversion API. The bridge then
  // asks us to swap the tab to welcome.html (the local React onboarding).
  // A 6s fallback timer rescues users whose bridge never reports back
  // (offline / promptory.chat blocked) so they still land on welcome.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;

    chrome.tabs
      .create({ url: 'https://promptory.chat/setting-up/' })
      .then((tab) => {
        if (tab.id === undefined) return;
        const tabId = tab.id;
        bridgeFallbackTimers.set(
          tabId,
          setTimeout(() => {
            chrome.tabs
              .update(tabId, { url: chrome.runtime.getURL('/welcome.html') })
              .catch(() => {/* tab may have been closed — fine */});
            bridgeFallbackTimers.delete(tabId);
          }, BRIDGE_FALLBACK_MS),
        );
      })
      .catch((err) =>
        console.warn('[Promptory] Failed to open setting-up bridge', err),
      );

    void track('extension_installed', {
      version: chrome.runtime.getManifest().version,
    });
  });
```

- [ ] **Step 3: Replace the swap-message handler in `background.ts`**

Find this block (currently lines 132-144):

```ts
    // The /setting-up bridge asks us to close it and replace it with
    // the dashboard once the gclid handshake is done. We do it from the
    // background so the user sees a single-tab transition.
    if (message?.type === 'OPEN_DASHBOARD_AND_CLOSE_THIS_TAB') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        chrome.tabs
          .update(tabId, { url: chrome.runtime.getURL('/dashboard.html') })
          .catch((err) => console.warn('[Promptory] tab swap failed', err));
      }
      sendResponse({ ok: true });
      return true;
    }
```

Replace with:

```ts
    // The /setting-up bridge asks us to swap it for the welcome onboarding
    // once the gclid handshake is done. Doing it from the background lets
    // the user see a single-tab transition (vs. a tab close + new tab).
    // Cancels the install fallback timer so we don't double-swap.
    if (message?.type === 'BRIDGE_HANDSHAKE_COMPLETE') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        const t = bridgeFallbackTimers.get(tabId);
        if (t) {
          clearTimeout(t);
          bridgeFallbackTimers.delete(tabId);
        }
        chrome.tabs
          .update(tabId, { url: chrome.runtime.getURL('/welcome.html') })
          .catch((err) => console.warn('[Promptory] tab swap failed', err));
      }
      sendResponse({ ok: true });
      return true;
    }
```

- [ ] **Step 4: Update the path check + outgoing message name in `promptory-site.content.ts`**

In `promptvault/entrypoints/promptory-site.content.ts`, find this block (currently the entire `main:` body, lines 24-48):

```ts
  main: () => {
    const isSettingUp = window.location.pathname === '/setting-up';

    // Always try to forward a gclid if one is stashed
    const gclid = readStoredGclid();
    if (gclid) {
      console.log('[Promptory] forwarding gclid to background');
      chrome.runtime
        .sendMessage({ type: 'GCLID_CAPTURED', payload: gclid })
        .then((res) => {
          if (res?.ok) window.localStorage.removeItem('promptory_gclid');
        })
        .catch((err) => console.warn('[Promptory] gclid forward failed', err));
    }

    // On the post-install bridge, ask the background to swap this tab for
    // the dashboard. Small delay so the gclid sendMessage gets a head start.
    if (isSettingUp) {
      setTimeout(() => {
        chrome.runtime
          .sendMessage({ type: 'OPEN_DASHBOARD_AND_CLOSE_THIS_TAB' })
          .catch((err) => console.warn('[Promptory] dashboard open failed', err));
      }, 250);
    }
  },
```

Replace with:

```ts
  main: () => {
    // Astro builds /setting-up as /setting-up/index.html, so the
    // canonical URL has a trailing slash. Strip it before comparing.
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const isSettingUp = path === '/setting-up';

    // Always try to forward a gclid if one is stashed.
    // sendResponse({ok:true}) now means "extension persisted it" (not
    // "extension reported it") — clearing localStorage on ok is therefore
    // safe even if the conversion API is down.
    const gclid = readStoredGclid();
    if (gclid) {
      console.log('[Promptory] forwarding gclid to background');
      chrome.runtime
        .sendMessage({ type: 'GCLID_CAPTURED', payload: gclid })
        .then((res) => {
          if (res?.ok) window.localStorage.removeItem('promptory_gclid');
        })
        .catch((err) => console.warn('[Promptory] gclid forward failed', err));
    }

    // On the post-install bridge, ask the background to swap this tab
    // for the welcome onboarding. Small delay so the gclid sendMessage
    // gets a head start.
    if (isSettingUp) {
      setTimeout(() => {
        chrome.runtime
          .sendMessage({ type: 'BRIDGE_HANDSHAKE_COMPLETE' })
          .catch((err) => console.warn('[Promptory] bridge handshake failed', err));
      }, 250);
    }
  },
```

- [ ] **Step 5: Verify build**

Run: `cd promptvault && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add promptvault/entrypoints/background.ts promptvault/entrypoints/promptory-site.content.ts
git commit -m "feat: install opens promptory.chat bridge; swap to welcome on handshake"
```

---

### Task 6: Manual smoke test

**Files:** none (verification only)

This task validates end-to-end behavior in a real browser. The bridge content script only matches `https://promptory.chat/*`, so we test against production `promptory.chat` (the `/go` and `/setting-up` pages are already live there per earlier curl probe).

- [ ] **Step 1: Build and locate the unpacked extension**

Run: `cd promptvault && npm run build`
The build output goes to `promptvault/.output/chrome-mv3/`.

- [ ] **Step 2: Happy path — capture gclid → install → conversion**

In Chrome:

1. Open `chrome://extensions`. Enable "Developer mode" (top right) if not on.
2. If a previous Promptory unpacked install exists, click **Remove** on it (a Reload won't trigger `reason === 'install'`).
3. In a normal tab: visit `https://promptory.chat/go/?gclid=smoketest-1234567890abcdef`
4. Open DevTools → Application → Local Storage → `https://promptory.chat`. Confirm `promptory_gclid` exists with value `{"value":"smoketest-1234567890abcdef","capturedAt":<ms>}`.
5. Back at `chrome://extensions`, click **Load unpacked** and select `promptvault/.output/chrome-mv3/`. This fires `onInstalled` with `reason === 'install'`.
6. A new tab should open at `https://promptory.chat/setting-up/`. Within ~1 second it should swap to `chrome-extension://<id>/welcome.html` (the React onboarding).
7. On `chrome://extensions`, find Promptory and click the **service worker** link (under "Inspect views"). In the console, look for the line `[Promptory] conversion reported`.
8. Back on the (now-welcome) tab's DevTools → Application → IndexedDB → `PromptoryDB` → `gclids`. There should be one row: `id = smoketest-1234567890abcdef`, `capturedAt` ≈ test time, `persistedAt` ≈ install time, `reportedAt = { install: <ms> }`.
9. Confirm the original `https://promptory.chat` localStorage entry is now gone (revisit the site or check via the still-open promptory.chat tab).

If the conversion POST returned non-200, `[Promptory] conversion API returned` will appear in the SW console with the status — that's a backend problem, not an extension problem. The row in `db.gclids` should still exist with `reportedAt = {}` in that case.

- [ ] **Step 3: Organic-install path — no gclid**

1. In `chrome://extensions`, **Remove** Promptory.
2. Open DevTools on `https://promptory.chat`, run `localStorage.removeItem('promptory_gclid')` to be sure.
3. **Load unpacked** Promptory again.
4. Bridge tab opens `/setting-up/`, swaps to `welcome.html`.
5. SW console: no `conversion reported` line, no warnings about missing gclid (the content script silently does nothing if `readStoredGclid()` returns null).
6. `db.gclids` should still be empty.

- [ ] **Step 4: Offline / blocked-domain fallback**

1. **Remove** Promptory.
2. In Chrome DevTools → Network tab on a blank page, check **Offline** (or use a local hostfile entry blocking `promptory.chat`).
3. **Load unpacked** Promptory.
4. Bridge tab opens but fails to load `/setting-up/`.
5. After ~6 seconds, the tab should auto-navigate to `welcome.html` anyway. Confirm.
6. SW console: `[Promptory] Failed to open setting-up bridge` is unlikely (the tab.create succeeds even offline — the failure is on page load, not tab creation), but no swap warning either.

- [ ] **Step 5: Smoke test passes**

If all three paths above worked:
- ✓ Happy path captures and reports the conversion, persists row, lands on welcome.
- ✓ Organic install lands on welcome with no spurious POST.
- ✓ Offline install still lands on welcome via the 6s fallback.

No commit for this task — verification only. Surface any failures back to the user before declaring done.

---

## Self-review checklist (already run)

- ✓ All spec sections covered: types (T1), db (T2), storage (T3), background GCLID handler (T4), background onInstalled + swap rename + content-script changes (T5), manual testing (T6).
- ✓ No placeholders — all code is complete and inline.
- ✓ Type names consistent: `Gclid` defined in T1, used in T2 (EntityTable) and T3 (helpers).
- ✓ Function names consistent: `saveGclid`, `markGclidReported` defined in T3, called in T4 with the same signatures.
- ✓ Message names consistent: `BRIDGE_HANDSHAKE_COMPLETE` (renamed from `OPEN_DASHBOARD_AND_CLOSE_THIS_TAB`) used in both T5 background and T5 content script edits.
- ✓ File paths exact, all `cd promptvault &&` for build commands (the npm scripts live in `promptvault/package.json`, not the repo root).

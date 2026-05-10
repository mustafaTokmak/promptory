# Google Ads Conversion Tracking — Bridge → Welcome Handoff

**Date:** 2026-05-09
**Status:** Draft (awaiting review)
**Owner:** Mustafa Tokmak

## Context

Promptory runs Google Ads pointing at `promptory.chat/go?gclid=XXX`. We need to report an offline conversion to Google Ads when the ad-clicking user actually installs the extension. Most of the plumbing is already in place — both the landing page and the extension have working pieces — but the install handler in the background worker never opens the bridge that closes the loop, so the conversion ping never fires.

This spec covers the changes required to close the loop while preserving the existing local React onboarding (`welcome.html`).

## Existing pieces (no changes required)

- **`promptvault/site/src/pages/go.astro`** — captures `?gclid=` from URL into `localStorage['promptory_gclid'] = {value, capturedAt}` on the `promptory.chat` origin, then renders an "Add to Chrome" CTA.
- **`promptvault/site/src/pages/setting-up.astro`** — minimal loading-spinner page; renders a 5-second fallback CWS link if the extension content script never takes over.
- **`promptvault/lib/analytics.ts`** and `track('extension_installed', …)` — already fired in the install handler; no change needed.
- Backend `POST /v1/conversion` at `https://api.promptory.chat` — assumed to exist (see `promptvault/backend/`); not in scope here.

## Goal

When a user clicks a Google Ad → installs from CWS → the extension forwards the gclid to our backend (so the backend can call Google Ads' Offline Conversion API), then drops the user into the existing welcome onboarding.

When a user installs organically (no prior `/go` visit), no conversion ping is sent, but the welcome page still opens.

## Non-goals

- Conversion tracking for events other than install (e.g., "user activated", "user opted into community").
- Backend changes to `/v1/conversion` — assumed working.
- Firefox: `chrome.runtime.onInstalled` works in MV3 / Manifest V2 alike, but Firefox sidebar UX may differ. This spec targets Chrome/Edge (Chromium MV3); Firefox parity can follow.

## Architecture

```
[ad click]
   ↓
promptory.chat/go?gclid=ABC          (Astro static page)
   • localStorage['promptory_gclid'] = { value, capturedAt }
   ↓ user clicks "Add to Chrome"
Chrome Web Store install
   ↓
chrome.runtime.onInstalled (reason='install')   (background.ts)
   • opens https://promptory.chat/setting-up/   ← changed
   • starts a 6s fallback timer for that tab    ← new
   ↓
promptory-site.content.ts runs in the bridge tab
   • reads gclid from localStorage
   • sends GCLID_CAPTURED to background          (existing)
   • normalizes pathname (trailing-slash safe)   ← fix
   • sends BRIDGE_HANDSHAKE_COMPLETE             ← renamed from OPEN_DASHBOARD_AND_CLOSE_THIS_TAB
   ↓
background.ts
   • persists gclid to db.gclids (Dexie)         ← new
   • POSTs gclid to /v1/conversion (existing)
   • on success: marks reportedAt.install in db  ← new
   • on BRIDGE_HANDSHAKE_COMPLETE: tabs.update(tabId, { url: 'welcome.html' })   ← target changed
   • cancels the fallback timer
   ↓
welcome.html (existing 220-line React onboarding)
```

## Components

### 1. `promptvault/lib/db.ts` — new `gclids` table

Bump Dexie schema to **version 4** and add a `gclids` table. The gclid string itself is the primary key, so re-captures upsert cleanly.

```ts
db.version(4).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
  settings: 'id',
  gclids: 'id, capturedAt',
});

// Add to the typed handle:
gclids: EntityTable<Gclid, 'id'>;
```

Type definition (`promptvault/lib/types.ts`):

```ts
export interface Gclid {
  id: string;            // the gclid value itself; primary key
  capturedAt: number;    // timestamp from page-side localStorage
  persistedAt: number;   // when the extension first saw it
  reportedAt: {
    install?: number;
    day7?: number;       // unused in this spec, populated by future retention work
    day30?: number;      // unused in this spec
  };
}
```

No upgrade hook required — version 4 just adds an empty table.

### 2. `promptvault/lib/storage.ts` — new gclid helpers

```ts
export async function saveGclid(value: string, capturedAt: number): Promise<void> {
  await db.gclids.put({
    id: value,
    capturedAt,
    persistedAt: Date.now(),
    reportedAt: {},
  });
}

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

### 3. `promptvault/entrypoints/background.ts`

**Install handler change** ([line 25-35](../../promptvault/entrypoints/background.ts#L25)):

Replace the local-`welcome.html` open with a `promptory.chat/setting-up/` open, plus a per-install fallback timer.

```ts
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;

  chrome.tabs
    .create({ url: 'https://promptory.chat/setting-up/' })
    .then((tab) => {
      if (tab.id === undefined) return;
      // Fallback: if the bridge's content script never reports back
      // (offline, promptory.chat blocked, slow load), force-swap the
      // tab to welcome so the user isn't stranded on a spinner.
      const tabId = tab.id;
      bridgeFallbackTimers.set(
        tabId,
        setTimeout(() => {
          chrome.tabs.update(tabId, { url: chrome.runtime.getURL('/welcome.html') })
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

Module-scope state:

```ts
const BRIDGE_FALLBACK_MS = 6000;
const bridgeFallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();
```

**Note on MV3 service worker lifetime:** the worker can be evicted after ~30s of idle. The `setTimeout` is not guaranteed to fire if the worker dies first. For 6s this is normally fine because the active install flow keeps the worker alive (pending `tabs.create` promise + waiting for messages from the bridge tab). If we ever observe the timer not firing in the wild, we can swap to `chrome.alarms.create({ delayInMinutes: 0.1 })` which survives worker eviction. We expect to migrate to `chrome.alarms` regardless when day-7/day-30 retention conversions land (see Out of scope) — at that point we'll move this 6s timer too so there's only one timer pattern in the worker.

**`GCLID_CAPTURED` handler change** ([line 40-69](../../promptvault/entrypoints/background.ts#L40)):

Persist to Dexie before responding to the content script, decoupling page-side localStorage cleanup from POST success. The POST then becomes truly fire-and-forget; on success we mark the row, on failure we leave `reportedAt.install` undefined so the future retention scheduler can retry.

```ts
if (message?.type === 'GCLID_CAPTURED') {
  const { gclid, capturedAt } = message.payload ?? {};
  if (!gclid || typeof gclid !== 'string') {
    sendResponse({ ok: false, error: 'invalid gclid' });
    return true;
  }
  // Persist first — extension owns the data from this point.
  // Chain the POST + mark off the persist so markGclidReported can never
  // race a not-yet-committed row (fetch can finish before IDB on fast
  // networks / slow disks).
  saveGclid(gclid, capturedAt ?? Date.now())
    .then(() => {
      sendResponse({ ok: true });
      // Page-side localStorage will be cleared by the content script now.
      // Conversion POST is fire-and-forget; on success we mark the row.
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

**Message handler rename** ([line 86-95](../../promptvault/entrypoints/background.ts#L86)):

Rename `OPEN_DASHBOARD_AND_CLOSE_THIS_TAB` → `BRIDGE_HANDSHAKE_COMPLETE`. Change the `tabs.update` target from `dashboard.html` to `welcome.html`. Cancel the fallback timer when received.

```ts
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

**No-compat-needed justification for the rename:** the old message name is part of an unfinished feature — the entire `promptory-site.content.ts` file and the install→bridge wiring are uncommitted (see `git status: ??`). No deployed extension build sends or receives this message, so we can rename freely.

### 4. `promptvault/entrypoints/promptory-site.content.ts`

**Path normalization** ([line 25](../../promptvault/entrypoints/promptory-site.content.ts#L25)):

Astro defaults to `trailingSlash: 'ignore'` with directory-format builds (verified: `dist/about/`, `dist/privacy/`). The canonical URL of the bridge is `https://promptory.chat/setting-up/` (trailing slash). The current strict equality check fails in production.

```ts
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isSettingUp = path === '/setting-up';
```

**Message rename**: send `BRIDGE_HANDSHAKE_COMPLETE` instead of `OPEN_DASHBOARD_AND_CLOSE_THIS_TAB`.

**Page-localStorage cleanup is now unconditional on `res.ok`.** The semantics are unchanged from the user's point of view (`{ok:true}` still arrives only when the extension has accepted the gclid), but the meaning is now "extension persisted it" rather than "extension reported it". That's the desired behavior — it lets the page-side store be cleared without depending on conversion-API uptime.

### 5. `promptvault/site/src/pages/setting-up.astro`

No changes. The 5s "extension not installed?" fallback link is still appropriate for the inverse case (user navigates to the URL without the extension).

### 6. `promptvault/wxt.config.ts`

No changes. `https://promptory.chat/*` is already in `host_permissions`, which covers `tabs.create()` to that URL and the content-script injection. **No `storage` permission needed** — Dexie is IndexedDB under the hood, which is built into every browser without an extension permission.

## Data flow

| Step | Actor | Reads | Writes | Sends |
|------|-------|-------|--------|-------|
| 1 | `/go` page script | `URL.searchParams.gclid` | `localStorage['promptory_gclid']` | — |
| 2 | Background `onInstalled` | — | `bridgeFallbackTimers` (Map) | `tabs.create('.../setting-up/')` |
| 3 | Content script | `localStorage['promptory_gclid']`, `location.pathname` | — | `GCLID_CAPTURED`, `BRIDGE_HANDSHAKE_COMPLETE` |
| 4 | Background `GCLID_CAPTURED` (persist) | `message.payload.gclid` | `db.gclids.put(...)` | `sendResponse({ok:true})` |
| 5 | Background `GCLID_CAPTURED` (POST, after 4 commits) | — | on success: `db.gclids.update(reportedAt.install)` | `fetch('/v1/conversion', POST)` |
| 6 | Background `BRIDGE_HANDSHAKE_COMPLETE` | `bridgeFallbackTimers`, `sender.tab.id` | clears timer | `tabs.update(tabId, welcome.html)` |
| 7 | Content script (after step 4 responds) | response | clears `localStorage['promptory_gclid']` on `res.ok` | — |

The two messages from the content script are independent and ordered only by a 250ms delay (existing). The conversion POST is fire-and-forget from the user's perspective: we don't block the welcome-page swap on it. Page-localStorage cleanup triggers on extension *persistence* (step 4), not on conversion *reporting* (step 5) — so a flaky API doesn't leave gclids forever stuck on the website's origin. The POST is chained off the persist promise (rather than racing it) so `markGclidReported` always sees the row when called.

## Edge cases

| Case | Behavior |
|------|----------|
| Organic install (no gclid) | Bridge runs, `readStoredGclid()` returns null, no `GCLID_CAPTURED` sent, `BRIDGE_HANDSHAKE_COMPLETE` still sent → welcome opens. ✓ |
| Re-install / chrome update / browser update | `details.reason !== 'install'` → handler short-circuits. ✓ |
| User offline | `tabs.create` succeeds (URL doesn't load yet), content script never runs, 6s fallback timer fires → welcome opens. ✓ |
| `promptory.chat` blocked (corporate proxy, pi-hole) | Same as offline — fallback timer rescues the flow. ✓ |
| User closes the bridge tab manually before handshake | No welcome page opens. User can still open the extension via toolbar / sidepanel. Acceptable. |
| Conversion POST fails (5xx, network) | Logged warning. Row stays in `db.gclids` with `reportedAt.install` undefined. Future retention scheduler (chrome.alarms PR) will pick it up and retry — that scheduler is the natural retry surface, since it's already enumerating gclids by report state. Page-localStorage was already cleared in step 4. |
| Conversion POST 4xx (invalid gclid) | Same as 5xx — row persists, log shows the body. If the gclid is truly malformed, the future scheduler will keep retrying noisily; consider adding a `reportFailedAt` field if this becomes a problem. Out of scope for this PR. |
| User installs same extension twice with different gclids | `db.gclids.put({id: gclid, ...})` upserts on the gclid value, so different gclids are different rows. Both get reported independently. ✓ |
| User installs twice with the same gclid | `put()` overwrites `persistedAt` and resets `reportedAt`. The conversion will be re-reported. Google Ads dedupes by `(conversionAction, gclid, conversionDateTime)` server-side, so a single duplicate ping is harmless. ✓ |
| User visits `/setting-up/` manually with extension installed | Gets bounced to welcome — mildly weird but harmless. Page is `noindex,nofollow` so unlikely. |
| User visits `/setting-up/` without extension | Existing 5s fallback in `setting-up.astro` shows CWS link. ✓ |
| Extension service worker evicted before 6s timer fires | Edge case (worker is normally kept alive by pending fetch + `tabs.create` promise). If observed, swap to `chrome.alarms`. |

## Testing

**Manual happy path** (the canonical test):
1. Build site locally: `cd promptvault/site && npm run dev`
2. Load extension unpacked from `promptvault/.output/chrome-mv3`
3. Visit `http://localhost:4321/go?gclid=test-abc-123-1234567890`
4. Confirm `localStorage['promptory_gclid']` is set on that origin (DevTools → Application).
5. Trigger a fresh install: chrome://extensions → **remove** the extension → re-add via "Load unpacked". (Plain "Reload" fires `onInstalled` with `reason === 'update'` and is filtered out by our handler.)
6. Bridge tab opens to `promptory.chat/setting-up/` (or localhost equivalent if testing locally — see note).
7. Within ~1s, tab swaps to the welcome React page.
8. Background console shows `[Promptory] conversion reported`.
9. Page-side `localStorage['promptory_gclid']` is cleared.
10. Inspect IDB. The bridge tab is on `promptory.chat`, a different origin from the extension, so its DevTools won't show `PromptoryDB`. Either: (a) navigate the (already-swapped) tab to `chrome-extension://<id>/welcome.html` and open DevTools → Application → IndexedDB, or (b) use chrome://extensions → "service worker" inspector → Application tab. Confirm `PromptoryDB.gclids` has a row with `id` = test gclid, `persistedAt` set, `reportedAt.install` set (because the POST succeeded).

**Note on local testing of bridge:** `setting-up.astro` lives on `promptory.chat`. The content script's match pattern is `https://promptory.chat/*` so localhost won't trigger it. For end-to-end local testing, either (a) point the install handler at `http://localhost:4321/setting-up/` temporarily and add `http://localhost:4321/*` to manifest matches and host permissions, or (b) test against staging/prod `promptory.chat` after deploying the page changes.

**Fallback path:**
1. Disable network, repeat install.
2. Bridge tab fails to load.
3. After 6s, tab swaps to welcome anyway. ✓

**Organic-install path:**
1. Clear all `promptory.chat` localStorage.
2. Reload extension.
3. Bridge opens, swaps to welcome with no conversion POST (background log shows nothing). ✓

**Trailing-slash normalization:**
- Add a tiny vitest covering `path.replace(/\/+$/, '') || '/'` for inputs `/setting-up`, `/setting-up/`, `/setting-up//`, `/`. Optional but cheap.

## Risks and trade-offs

- **One additional cross-origin tab open on install** — the user briefly sees `promptory.chat/setting-up/` before the swap. Spinner is on-brand and short (~1s on a normal connection). Acceptable cost for the conversion data.
- **Fallback timer in MV3 service worker** — see service-worker note above. Documented; can swap to `chrome.alarms` if it bites us.
- **No retry of failed install POST until retention scheduler lands** — if the conversion POST fails (5xx, network), the gclid is safely in `db.gclids` but the install ping won't be re-attempted until the retention PR's scheduler runs. For the install conversion specifically, this means a temporarily-flaky API → some lost install conversions. Acceptable given POSTs to a healthy API rarely fail and the data isn't lost (just unreported until day 7).

## Out of scope (for this spec — flagged for later)

- Backend `/v1/conversion` implementation
- Firefox bridge handling (Firefox install flow can land on welcome directly until we extend)
- **Day-7 / Day-30 retention conversions** — Google Ads accepts multiple conversion events per gclid, so we'll later report "still active at 7 days" and "still active at 30 days" as separate conversion actions. The `db.gclids` table already has the slots (`reportedAt.day7`, `reportedAt.day30`) so the retention PR is just: (1) add an `chrome.alarms` scheduler, (2) on each fire, query `db.gclids` for rows missing the relevant `reportedAt` field where `persistedAt` is far enough in the past, (3) POST + mark. No schema migration needed.
- Retry of failed install conversions — handled implicitly by the future retention scheduler (it'll see `reportedAt.install` undefined and POST). For this PR we accept that a 5xx during the install ping = lost ping until that scheduler exists.
- Migrating to `chrome.alarms` for the install-time fallback specifically (deferred until the retention work above lands, or earlier if we observe the 6s timer missing in production). When the retention scheduler lands, this 6s fallback moves over too so there's one timer pattern in the worker.

## Open questions

None — design approved 2026-05-09.

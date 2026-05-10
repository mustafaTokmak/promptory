# Promptory Onboarding & Analytics Consent — Design Spec

**Date:** 2026-05-09
**Status:** Approved (brainstorm)
**Author:** Brainstorm session
**Related:** `2026-04-14-promptvault-design.md` §3.5 (Community consent gate)

---

## 1. Goal

Add a first-run onboarding page that collects two **independent, optional**
opt-ins from the user before they're routed into the dashboard:

1. **Anonymous usage analytics** (Google Analytics 4 via Measurement Protocol)
2. **Contribute to community library** (anonymized prompts, V2 cloud feature)

The extension's **core value — local prompt capture — works fully without
either consent.** Local IndexedDB storage is not "data collection" under
GDPR/CCPA/CWS Limited Use, so gating capture behind consent would be both
illegal under GDPR Recital 43 and a CWS policy violation.

The community-sharing consent currently lives behind a Community-tab modal
in the dashboard. Moving it into onboarding means we **start collecting
opt-in users from day 1** instead of waiting for them to discover that tab.

## 2. Decisions Log

| Question | Decision | Rationale |
|---|---|---|
| Single bundled consent or separate toggles? | **Two independent toggles** | GDPR forbids bundled consent; Firefox AMO manifest already separates `websiteContent` (required) from `technicalAndInteraction` (optional) |
| Surface for the onboarding | **Dedicated `welcome.html` entrypoint, auto-opened on install** | Standard extension pattern (Honey, 1Password, Loom). Wider than sidepanel, bookmarkable for testing |
| What if user closes welcome tab without deciding? | **Soft re-prompt banner in sidepanel & dashboard** | Catches users who closed the tab without finishing |
| Block extension use without consent? | **No — never** | CWS Limited Use, Firefox AMO, GDPR all prohibit forced consent for non-essential data collection |
| Analytics provider | **Google Analytics 4 (Measurement Protocol)** | User-specified. MV3 cannot use `gtag.js` (no DOM in service worker, CSP blocks remote scripts) |
| Onboarding layout | **Single page, three buttons** | Two toggles don't justify a wizard; faster to consent → lower drop-off |

## 3. Data Model

Extend `Settings` in `lib/types.ts`:

```typescript
interface Settings {
  id: 1;

  // Existing — community sharing opt-in
  consentGiven: boolean;
  consentTimestamp: number | null;

  // Existing — review prompt suppression
  reviewPromptShown: boolean;

  // Existing — already declared, currently unused; this spec wires them up
  onboardingShown?: boolean;
  onboardingShownAt?: number | null;

  // NEW — analytics opt-in (independent from community sharing)
  analyticsConsent: boolean;
  analyticsConsentAt: number | null;

  // NEW — stable GA4 client_id, generated once on first run
  clientId: string;
}
```

Default values for a fresh install: all booleans `false`, all timestamps
`null`, `clientId` generated lazily (see §6).

**Migration:** bump Dexie schema version. New fields default to `false`/`null`
on existing rows. No destructive change.

## 4. Consent Matrix

The combinatorial behavior the implementation must honor:

| Analytics | Community | Local capture | GA events fire | Future cloud upload |
|---|---|---|---|---|
| ❌ | ❌ | ✅ works | never | never |
| ✅ | ❌ | ✅ works | yes | never |
| ❌ | ✅ | ✅ works | never | yes (when V2 ships) |
| ✅ | ✅ | ✅ works | yes | yes (when V2 ships) |

Local prompt capture happens regardless of consent. Capture is the
extension's single purpose; it is never gated.

## 5. UI Design

### 5.1 Layout

Single-page React component at `entrypoints/welcome/App.tsx`. Centered card,
`max-w-2xl`, white background, page background `bg-gray-50`. Uses existing
brand primitives: `Logo`, `Button`, Tailwind `brand-*` palette.

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              [Logo 48px]                               │
│              Welcome to Promptory                      │
│                                                        │
│   Promptory auto-saves every prompt you send to        │
│   ChatGPT, Claude, Gemini, and 3 more — locally,       │
│   on your device. No account needed. Already working.  │
│                                                        │
│   ──────────────────────────────────────────────────   │
│                                                        │
│   Two optional extras (you can change these anytime):  │
│                                                        │
│   ┌──────────────────────────────────────────────┐     │
│   │  [ ]  Anonymous usage analytics              │     │
│   │       Helps us see which AI tools people     │     │
│   │       use most and fix bugs faster.          │     │
│   │       Sent to Google Analytics. No prompt    │     │
│   │       content is ever shared.                │     │
│   └──────────────────────────────────────────────┘     │
│                                                        │
│   ┌──────────────────────────────────────────────┐     │
│   │  [ ]  Contribute to community library        │     │
│   │       Anonymized prompts help build a        │     │
│   │       shared library of great prompts        │     │
│   │       for everyone. Coming with V2.          │     │
│   │       [Read what's anonymized →]             │     │
│   └──────────────────────────────────────────────┘     │
│                                                        │
│   [ Save preferences ]  [ Skip both ]  [ Decide later ]│
│                                                        │
│   ↓ scrolls to brief FAQ (privacy, data, opt-out)      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 5.2 Button Behavior

| Button | Action |
|---|---|
| **Save preferences** | Persist whatever the toggles are set to (any combination, including both off). Mark `onboardingShown=true`. Fire `onboarding_completed` event. Close tab → open dashboard. |
| **Skip both** | Set both consents to `false`. Mark `onboardingShown=true`. Fire **nothing** (analytics is off). Close tab → open dashboard. |
| **Decide later** | Don't change anything. Don't mark `onboardingShown=true`. Close tab → open dashboard. Sidepanel/dashboard show the soft re-prompt banner on next open. |

### 5.3 FAQ (collapsed by default, below the fold)

Three `<details>` elements:
- **What's anonymized in the community library?** — explain client + server PII scrub (refer to main spec §10.2)
- **What does the analytics track?** — list the events from §7.1, emphasize "never your prompt content"
- **How do I opt out later?** — point to dashboard settings (must be added in implementation)

### 5.4 Soft Re-Prompt Banner

If `settings.onboardingShown !== true`, show a non-blocking banner in both
sidepanel and dashboard:

```
┌──────────────────────────────────────────────────────┐
│  ⓘ  Finish setup — choose your privacy preferences   │
│     [Open setup →]                          [Dismiss]│
└──────────────────────────────────────────────────────┘
```

"Open setup" → `chrome.tabs.create({url: 'welcome.html'})`. "Dismiss" sets
`onboardingShown=true` with no consent change (treated as a passive skip).

## 6. Analytics Module

New file `lib/analytics.ts`. Three exports:

```typescript
type EventName =
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

export async function track(
  event: EventName,
  params?: Record<string, string | number | boolean>,
): Promise<void>;

export async function setAnalyticsEnabled(enabled: boolean): Promise<void>;

export async function getOrCreateClientId(): Promise<string>;
```

### 6.1 `track()` Behavior

1. Read `analyticsConsent` from settings — if `false`, return immediately
2. Lazy-load `clientId` (call `getOrCreateClientId()`)
3. POST to `https://www.google-analytics.com/mp/collect?measurement_id=<MID>&api_secret=<SECRET>` with body:
   ```json
   {
     "client_id": "<uuid>",
     "events": [{ "name": "<event>", "params": {...} }]
   }
   ```
4. Catch and `console.warn` on failure — telemetry never throws into the app

### 6.2 Hardcoded Constraints

Encoded in `track()` to make accidental data leakage structurally impossible:

- Strip any param keys ending in `Text`, `Url`, `prompt`, `response`, `email`
- Numeric caps: `prompt_chars` and `response_chars` clamped to 0..1_000_000
- Strings truncated to 100 chars

### 6.3 Where `track()` is called

All call sites live in `background.ts` (consent gate is one place). Other
contexts (welcome page, sidepanel, dashboard, content scripts) **never call
`track()` directly**. They send a message to the background SW which decides
whether to fire.

```
[Sidepanel/Dashboard/Welcome UI]
        ↓ chrome.runtime.sendMessage({ type: 'TRACK', event, params })
[Background SW]
        ↓ track(event, params)  // checks consent
[GA4 Measurement Protocol]
```

Content scripts already send `PROMPT_CAPTURED` to background — background
calls `track('prompt_captured', { platform, ... })` after the storage write.

### 6.4 GA4 Configuration

Constants in `lib/analytics.ts` (not real secrets, bundled into extension):

```typescript
const MEASUREMENT_ID = 'G-XXXXXXXXXX'; // user-provided
const API_SECRET = 'XXXXXXXXXXXXX';    // user-provided, rotate if abused
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
```

## 7. Event Catalog

### 7.1 Events & Parameters

| Event | Parameters | Trigger |
|---|---|---|
| `extension_installed` | `version` | `chrome.runtime.onInstalled` (only on `reason='install'`) |
| `onboarding_completed` | `analytics_opt_in: bool`, `community_opt_in: bool` | Save preferences clicked |
| `onboarding_skipped` | `via: 'skip_both' \| 'decide_later' \| 'banner_dismiss'` | Other exit paths |
| `prompt_captured` | `platform`, `had_response: bool`, `prompt_chars: number`, `response_chars: number` | After successful `addPrompt()` in background |
| `platform_visited` | `platform` | Once per platform per UTC day, fired by content script via background |
| `dashboard_opened` | — | Dashboard `App` mount |
| `sidepanel_opened` | — | Sidepanel `App` mount |
| `consent_changed` | `setting: 'analytics' \| 'community'`, `new_value: bool` | Any consent toggle outside onboarding |
| `prompt_exported` | `format: 'json' \| 'csv'`, `count: number` | Export click |
| `review_rated` | `stars: number` | Review banner click |
| `error` | `where`, `code` | Background catch blocks |

### 7.2 Forbidden Parameters (Module-Level Guarantee)

The `track()` helper rejects parameters with these keys, even if a caller
sends them:

`promptText`, `responseText`, `sourceUrl`, `email`, anything matching
`/text$/i`, `/url$/i`, `/prompt(?!_chars)/i`, `/response(?!_chars)/i`

This is structural; it must be enforced via filter (not code review).

### 7.3 GA4 Console Setup (one-time, post-deploy)

Document in spec — must be done in GA Admin before reports work:

1. Create a Web data stream
2. Generate a Measurement Protocol API secret
3. Register custom dimensions for: `platform`, `had_response`, `setting`,
   `via`, `format`, `where`
4. Allow ~24h before custom dimensions appear in reports

## 8. Data Flow

### 8.1 First Install

```
[User installs extension]
        ↓
[chrome.runtime.onInstalled fires with reason='install']
        ↓
[background.ts: chrome.tabs.create({url: 'welcome.html'})]
        ↓
[welcome.html loads → App.tsx mounts]
        ↓
[User toggles preferences, clicks "Save preferences"]
        ↓
[storage: setAnalyticsConsent(true), setConsent(community), markOnboardingShown()]
        ↓
[chrome.runtime.sendMessage({ type: 'TRACK', event: 'onboarding_completed', ... })]
        ↓
[background.ts: analytics.track(...)]
        ↓
[GA4 Measurement Protocol POST]
        ↓
[Welcome tab: chrome.tabs.update(self, { url: 'dashboard.html' })]
```

### 8.2 Subsequent Capture (existing flow + analytics)

```
[Content script captures prompt]
        ↓ chrome.runtime.sendMessage({ type: 'PROMPT_CAPTURED', payload })
[background.ts]
        ↓ addPrompt(payload)         (existing)
        ↓ track('prompt_captured', { platform, prompt_chars, response_chars })  (new)
        ↓ if (consent) {check review prompt}  (existing)
```

### 8.3 Decide Later → Re-Prompt

```
[User installs]
   → [welcome page opens, user clicks "Decide later"]
   → [welcome tab redirects to dashboard, onboardingShown stays false]
[User opens sidepanel later]
   → [sidepanel reads settings, sees !onboardingShown → renders banner]
   → [user clicks "Open setup" → welcome.html opens in new tab]
```

## 9. Files Affected

| File | Change |
|---|---|
| `entrypoints/welcome/index.html` | NEW — minimal HTML shell |
| `entrypoints/welcome/main.tsx` | NEW — React mount, ToastProvider wrapper |
| `entrypoints/welcome/App.tsx` | NEW — single-page onboarding (~150 lines) |
| `entrypoints/background.ts` | Re-enable `chrome.runtime.onInstalled` → welcome.html; add `TRACK` message handler; call `track('prompt_captured', ...)` after storage write |
| `lib/analytics.ts` | NEW — GA4 Measurement Protocol wrapper, ~80 lines |
| `lib/storage.ts` | Add `setAnalyticsConsent`, `getOrCreateClientId`. Update `DEFAULT_SETTINGS`. |
| `lib/types.ts` | Extend `Settings` with `analyticsConsent`, `analyticsConsentAt`, `clientId` |
| `lib/db.ts` | Bump Dexie version, add new fields to settings store |
| `entrypoints/sidepanel/App.tsx` | Add "Finish setup" banner if `!onboardingShown`. Fire `sidepanel_opened` via background message on mount |
| `entrypoints/dashboard/App.tsx` | Same banner. Fire `dashboard_opened`. Wire `analyticsConsent` toggle into a Settings affordance (lightweight — link or section, full Settings page is out of scope) |
| `wxt.config.ts` | No permission changes needed |

## 10. Privacy Disclosures Required

### 10.1 Privacy Policy
Update `promptory.chat/privacy` (out of repo, but called out here):
- List Google Analytics as a sub-processor
- Link to GA's data retention settings
- State that opt-in is required and reversible from extension settings

### 10.2 Chrome Web Store Privacy Practices Form
- "Personal communications" → No
- "Web history" → No
- "User activity" → Yes — "Anonymous interaction events via Google Analytics, opt-in only, no prompt or response content"

### 10.3 Firefox AMO
Already covered: manifest declares `technicalAndInteraction` as optional in
`data_collection_permissions`. No change needed there.

## 11. Edge Cases

| Case | Behavior |
|---|---|
| User installs, never opens welcome tab | `onboardingShown=false`, both consents stay `false`. Local capture continues. Soft re-prompt banner appears next sidepanel/dashboard open. |
| User updates extension (not fresh install) | `chrome.runtime.onInstalled` fires with `reason='update'`. Do NOT open welcome tab. Existing settings preserved. |
| User clears extension data (e.g. uninstalls + reinstalls) | Treated as fresh install. New `clientId` generated. Welcome tab opens. |
| Network down when `track()` fires | `fetch` rejects → caught, swallowed, `console.warn`. No retry queue (intentional — telemetry is best-effort, not a transactional log). |
| User toggles analytics off after initially accepting | All future `track()` calls no-op. No backfill deletion (GA4 does not expose a per-client deletion API at the free tier). Document this in privacy policy. |
| User in incognito mode | Service worker still runs. Capture and analytics behave normally. (Incognito-aware suppression is out of scope; users can disable extension in incognito via Chrome settings.) |

## 12. Testing

- Unit: `lib/analytics.ts` — verify `track()` no-ops when consent is false; verify forbidden-param filter strips known keys; verify `clientId` is generated once and reused
- Unit: `lib/storage.ts` — verify `setAnalyticsConsent` persists, verify migration adds new fields with defaults to existing rows
- Manual: install extension fresh → welcome tab opens → toggle states + each button path → confirm settings persisted via DevTools IndexedDB inspector
- Manual: click "Decide later" → open sidepanel → confirm banner appears → click "Open setup" → confirm welcome reopens
- Manual: with analytics on, capture a prompt → confirm GA4 DebugView shows `prompt_captured` event
- Manual: with analytics off, capture a prompt → confirm GA4 DebugView shows nothing

## 13. Out of Scope

- Full Settings page — a single analytics-toggle affordance on the dashboard (header dropdown or a small Settings drawer) is sufficient for V1
- A retry queue for failed analytics POSTs
- Per-platform incognito detection
- Localization (English only for V1)
- Any actual community-sharing data pipeline — that's V2 (`2026-04-14-promptvault-design.md` §10.2)

## 14. Backward Compatibility for Existing Users

Users who installed before this ships have `consentGiven` already set (true
or false), but no `analyticsConsent` field. On first launch with the new
build:

1. Dexie migration adds `analyticsConsent: false`, `analyticsConsentAt: null`,
   `clientId: <new uuid>` to their settings row.
2. If `consentGiven === true` already → set `onboardingShown = true` so they
   don't see the soft re-prompt banner. (They've already made one of the two
   decisions; nudging them only for analytics is acceptable but the banner
   pattern would imply they hadn't onboarded at all.)
3. If `consentGiven === false` and `onboardingShown` is undefined → leave
   `onboardingShown=false` so they see the banner once. They can dismiss it
   to permanently silence it.

This avoids both surprising existing happy users with a fresh welcome tab,
and missing a chance to ask the analytics question of users who never
encountered the Community tab modal.

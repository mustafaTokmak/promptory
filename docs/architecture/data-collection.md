# Data Collection Architecture

## Current state (v0.1.0 shipped)

- All prompts stored locally in user's browser (IndexedDB via Dexie)
- No data leaves the device except:
  - **Feedback** — user explicitly clicks "Send feedback" in review banner. Sends rating + optional message + extension version. POSTs to `api.promptory.chat/v1/feedback`.
  - **Conversion** — extension content script on `promptory.chat/setting-up` reads gclid from localStorage and forwards to backend, which uploads to Google Ads. No prompt content involved.
- Privacy policy at `promptory.chat/privacy` accurately describes this.

## What's NOT in v0.1.0

- No prompt sharing
- No anonymized aggregation
- No community feature wired up (was mocked, then removed)
- No `shared_prompts` table in backend

This is intentional — ship lean, add monetization features later in v0.2.0+.

## Future architecture options

When data collection is added, two patterns are on the table.

### Centralized

Each opt-in user's prompts shipped to backend, stored in `shared_prompts` table.

```
[User opt-in]
   ↓
[Each captured prompt] → [PII strip client-side] → [POST /v1/shared-prompt] → [D1 shared_prompts]
   ↓
[Server-side: SQL queries, ML, B2B reports]
```

**Pros:**
- Simple, fast to build
- Retroactive queries possible
- Iteration via server changes only
- Powerful ML possible

**Cons:**
- Privacy posture weakens
- GDPR exposure
- CWS de-list risk
- Storage scales with users
- Realistic opt-in: 10-15%

### Federated edge queries

Backend defines declarative queries, extensions execute locally, send only aggregated results.

```
[Backend defines query]
   ↓
[GET /v1/queries → Extension]
   ↓
[Extension scans local DB, computes match counts]
   ↓
[POST /v1/results { queryId, matches, anonId }]
   ↓
[Backend aggregates → B2B dashboard]
```

**Pros:**
- Raw prompts never leave device
- Privacy story bulletproof
- Default-on consent legitimate (~70-90% adoption)
- Low storage cost
- CWS / GDPR-safe

**Cons:**
- Slower iteration (need extension updates)
- No retroactive queries
- Limited to declarative patterns
- More complex aggregation infra
- Smaller data moat (others can copy queries with similar install base)

### Brand mention extraction (hybrid sweet spot)

Specific subset of federated approach using a hardcoded brand dictionary:

```
[Extension matches each captured prompt against brands.json]
   ↓
[POST /v1/mention { brand, platform, anonId }]
   ↓
[Backend aggregates → B2B "brand visibility" dashboard]
```

Simpler than full federated query engine. Ships fast.

## Decision (current)

User stated: **"I'll see how it goes"** — implying flexibility for future data sales matters more than permanent privacy moat.

→ When data collection is built, **start centralized**. Add federated layer later if regulatory pressure mounts or privacy positioning becomes critical to a major B2B deal.

This is honest given the user's actual posture. If we'd built federated to "look more privacy-respecting" while planning to abandon it at the first $50K offer, we'd pay the engineering cost for nothing.

## Schema sketch (when we add it)

### `shared_prompts` table (centralized)

```sql
CREATE TABLE shared_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anon_install_id TEXT NOT NULL,        -- rotating UUID, 90-day rotation
  platform TEXT NOT NULL,               -- 'chatgpt' | 'claude' | ...
  prompt_text TEXT NOT NULL,            -- PII-redacted client-side
  response_text TEXT NOT NULL,
  language TEXT,
  pii_redacted INTEGER NOT NULL DEFAULT 1,
  consent_version INTEGER NOT NULL,     -- bump if consent text changes
  submitted_at INTEGER NOT NULL,
  -- Server-side enrichment, populated by background workers
  entities_json TEXT,
  topics_json TEXT,
  quality_score REAL,
  enriched_at INTEGER
);
CREATE INDEX idx_shared_submitted_at ON shared_prompts (submitted_at DESC);
CREATE INDEX idx_shared_unenriched ON shared_prompts (enriched_at) WHERE enriched_at IS NULL;
```

### `consent_log` table

```sql
CREATE TABLE consent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anon_install_id TEXT NOT NULL,
  action TEXT NOT NULL,                 -- 'opt_in' | 'opt_out' | 'export' | 'delete'
  consent_version INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  ip_country TEXT                       -- coarse geo only, no exact IP
);
```

Audit trail for legal compliance — required for GDPR.

## Anonymous install ID

Foundational regardless of architecture chosen.

```ts
// lib/anon-id.ts
export async function getAnonInstallId(): Promise<string> {
  const stored = await chrome.storage.local.get([
    'anonInstallId', 'anonInstallIdGeneratedAt',
  ]);
  const ROTATION_MS = 90 * 24 * 60 * 60 * 1000;

  if (stored.anonInstallId &&
      Date.now() - (stored.anonInstallIdGeneratedAt ?? 0) < ROTATION_MS) {
    return stored.anonInstallId;
  }

  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({
    anonInstallId: fresh,
    anonInstallIdGeneratedAt: Date.now(),
  });
  return fresh;
}
```

5-line addition. Reusable for feedback metadata, future shared-prompt submissions, conversion attribution.

## PII screening

Already exists at `lib/pii.ts` — covers email, phone, credit card, SSN, auth tokens.

Extension paths that strip PII:
- ✅ `lib/capture.ts:getVisibleText` — strips screen-reader-only helpers
- ⏳ When sharing wired up: PII redaction passes before POST to backend

Server-side fallback PII screening as belt-and-braces:
- Run regex pass on every received prompt
- Reject (return 400) if any PII detected
- Log redacted samples for audit

## Onboarding consent flow (when added)

Out-of-the-box opt-in rates are typically 10-15% if buried in settings, 30-60% if prominent in onboarding with clear value. Plan: prominent + value-tied.

Proposed UX:

```
┌──────────────────────────────────────────────────┐
│  Help us build something better                  │
│                                                  │
│  Promptory is private by default — your prompts  │
│  stay on your device.                            │
│                                                  │
│  Optionally, share anonymized prompts to:        │
│   • Help us improve the product                  │
│   • Unlock the upcoming community library        │
│   • Support free access for everyone             │
│                                                  │
│  [ Share anonymized prompts ]   [ Maybe later ]  │
└──────────────────────────────────────────────────┘
```

"Maybe later" doesn't permanently disable — re-prompt at the 10-prompt milestone.

Don't dark-pattern. The consent screen has to be defensible if a user complains publicly.

## Why we're NOT shipping data collection in v0.1.0

User considered re-submitting v0.1.0 with collection added. Rejected because:

1. Re-submitting resets review queue (3-9 day delay across CWS / Edge / AMO)
2. Listing copy mismatch — current listings emphasize "stays on your device"
3. CWS scrutiny spike on prompt collection
4. Demand not yet validated — premature complexity
5. User's "I'll see how it goes" posture incompatible with hard commitment in v0.1.0

When ready (v0.2.0+):
1. Add consent UX
2. Add `POST /v1/shared-prompt`
3. Update privacy policy
4. Update CWS / Edge / AMO listings
5. Submit v0.2.0 → re-review (1-3 days)

Existing users will see a one-time consent prompt on update. No surprise.

## What can be added now safely (low-risk pre-work)

These don't change v0.1.0 behavior but make v0.2.0 cheaper:

- `getAnonInstallId()` utility — generated on first run, used by feedback endpoint
- Empty `shared_prompts` migration in backend (table exists, nothing writes to it)
- `lib/brand-extractor.ts` stub — placeholder for future brand-mention pipeline

None shipped yet. Decision deferred.

## Privacy guarantees we maintain regardless

1. Privacy policy stays accurate. Whatever we ship, the policy reflects it.
2. CWS / AMO / Edge disclosures match implementation.
3. Opt-out at any time. Settings toggle works without question.
4. User export endpoint — user can download all their prompts as JSON.
5. User delete endpoint — extension uninstall = data goes away.
6. No PII is collected even with explicit consent.
7. Consent log is auditable (GDPR Article 7 compliance).

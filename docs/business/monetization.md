# Monetization Strategy

## Current stance

**"I'll see how it goes."** No commitment to a permanent monetization model yet. Ship the consumer extension first, validate the underlying problem is real, then decide.

## Options on the table

### A. Pro subscription — $3-5/month
- Cross-device sync, advanced search, larger libraries, future Pro-only features
- Math: 5% of 10K users at $3/mo = $1.5K MRR
- Sustainable, ethical, simple
- Doesn't depend on data
- **Was rejected:** "I don't want to sell subs"

### B. Anonymized data sales — raw prompts
- Sell access to consented anonymized prompt corpora to AI labs / synthetic data shops / researchers
- Math: ~$0.01-$0.05 per prompt; meaningful at 10K+ users
- High ceiling (~$100K+/mo at 100K users)
- **Risks:** GDPR exposure, CWS de-list risk, Reddit/HN backlash, slow legal cycle, requires explicit opt-in (~10-15% rate)
- "Selling raw data" framing is a brand killer

### C. Promptory Insights — B2B GEO product
- Brand visibility / topic / sentiment insights derived from prompts
- Higher per-customer revenue ($300-$3K/mo recurring) than data sales
- See `docs/business/geo-product.md`
- **Two architectures considered**:
  1. **Centralized:** collect prompts, run analyses server-side
  2. **Federated:** ship queries to extensions, run on-device, send aggregated results

### D. Affiliate links / sponsored AI tools
- Lightweight, frictionless, low ARPU but easy
- Worth doing as side revenue at any scale
- Won't carry the business alone

## Decision tree applied

User chose:
1. Don't sell raw data → reject Option B
2. Don't want subs → reject Option A
3. Build B2B insights as the primary revenue path → focus on Option C
4. **"I'll see how it goes"** posture → centralized data architecture (more flexible)

## Centralized vs federated — the comparison

| | Centralized | Federated |
|---|---|---|
| Engineering | Simple, SQL-driven | More moving parts |
| Time to first revenue | ~3-4 weeks | ~5-8 weeks |
| Iteration speed | Fast (server-side queries) | Slow (extension updates needed) |
| Retroactive queries | ✅ yes | ❌ no |
| Query expressiveness | Anything SQL/Python can express | Declarative patterns only |
| Storage cost | Grows with users × prompts | Tiny (aggregates only) |
| Privacy story | "Trust us with your prompts" | "Prompts never leave your device" |
| GDPR exposure | High | Low |
| CWS de-list risk | Real | Near-zero |
| Default-on consent | Illegal in most regions | Legitimate (with disclosure) |
| Effective opt-in rate | 5-15% | 70-90% |

### Honest tradeoffs

**Centralized** is more powerful and more flexible but bets the company on privacy never blowing up.

**Federated** is more constrained and harder to engineer but the privacy story stays bulletproof regardless of business pivots.

### Decision rule used

> *"If you're going to abandon privacy the first time a customer offers $50K for raw data, you've engineered a more complex system for no benefit."*

User said "I'll see how it goes" → not committed to permanent privacy-first → centralized is the honest choice.

## What centralized commits us to

1. Privacy policy stays opt-in. Don't break that promise.
2. Realistic opt-in rate: 10-25%.
3. Promptory becomes a "data company" — accept the positioning.
4. CWS risk is real but manageable with clear disclosures.
5. Privacy policy must clearly state what's collected and when.

## When to add data collection

NOT in v0.1.0. Add in v0.2.0 after:
- v0.1.0 is approved and shipped
- 100+ real users on the system
- Validation calls confirm B2B demand
- Listing copy can be honestly updated

Re-submitting v0.1.0 with collection added would:
- Reset the review queue (3-9 day delay)
- Trigger reviewer scrutiny on data handling
- Force a rewrite of all 3 store listings
- Add unvalidated complexity

## Brand mention extraction (the hybrid sweet spot)

If we want client-side privacy plus monetization, an alternative emerged:

Run a **brand-name dictionary match locally** on each captured prompt. Send only the matched brand names + counts to backend, never the raw text.

- Privacy: raw prompts never leave the device ✓
- Marketing: "your conversations stay local" stays true ✓
- Monetization: brand visibility insights work fine on counts alone
- GDPR: brand-name aggregates aren't "personal data"

This was raised but not yet decided. Could be a Phase-2.5 addition once consumer launch settles.

## Federated edge query platform (the most ambitious option)

A more sophisticated version of brand mention extraction:

- Backend defines declarative queries (`brand_match`, `topic_match`, `regex_match`, `co_mention`, `sentiment`)
- Extensions fetch queries periodically
- Each extension runs queries against ITS OWN local prompts
- Extensions report only aggregated results

Customer-pays-per-query model. Each query type = a separate B2B product.

See `docs/business/geo-product.md` for detail.

This is a strong long-term direction if the consumer side reaches scale, but premature to build now.

## Summary

- Phase 0-1 (now → 1K users): no data collection, no monetization. Pure consumer product.
- Phase 2 (1K-5K users): validate B2B demand via conversations only. No code.
- Phase 3 (5K-10K users): if validated, add opt-in data collection (centralized for now). Build first manual-delivery B2B reports.
- Phase 4 (10K+ users): productize Promptory Insights. Decide centralized-only vs federated-hybrid then.
- Phase 5 (50K+ users): consider raw data sales only with rock-solid consent + DPA infrastructure.

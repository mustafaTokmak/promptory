# Promptory Roadmap

## Where we are

| | Status |
|---|---|
| Chrome extension | ⏳ submitted to CWS, in review |
| Edge extension | ⏳ submitted to Microsoft Partner Center, in review |
| Firefox extension | ⏳ submitted to Mozilla AMO, in review |
| Google Ads API token | ⏳ submitted, in review |
| Backend (api.promptory.chat) | ✅ live (feedback + conversion endpoints) |
| Marketing site (promptory.chat) | ✅ live (home, about, privacy, /go, /setting-up) |
| iCloud+ email + DNS | ✅ live |

## Decision: hold while reviews are pending

> "Ok I won't do anything until publish"

No code changes, no marketing, no growth experiments until v0.1.0 is approved. The current state is intentional and correct — ship lean, iterate after launch.

## Phase 0 — Right now (waiting period)

Don't build anything. Don't publicize. Use the time for:

- Verify the install funnel locally (`/go?gclid=...` → CWS → install → /setting-up → conversion in D1)
- Drafts only: launch posts, ad copy, blog post outlines
- Solve Wise USD billing for ad spend
- Personal-network warm list (~30 friends to message on launch day)

## Phase 1 — Launch (Day 0 of public)

Triggered by CWS approval email.

1. Verify install + capture works on a fresh Chrome
2. Soft launch: 5-10 personal messages, NO public posts
3. Watch first 24h: install count, feedback DB, error logs
4. Hot-fix anything that breaks within hours

## Phase 2 — First 500 users (Days 1-14)

Best growth channels for indie + privacy-first product:

- Tier 3 Google Ads (India, PH, Indonesia) at ~$30-50/day
- Listing sites (alternativeto, betalist, theresanaiforthat)
- Twitter daily presence
- 1 YouTube short / week
- See `docs/business/growth.md` for full plan

Target: 500-1K installs, ≥4.5★ rating, ≥25% D7 retention.

## Phase 3 — First 5K users (Months 1-3)

- Iterate on top 3 issues from feedback DB
- Validate B2B insights demand via 5-10 brand-marketer calls (no code)
- Add the consent flow if (and only if) data collection gets validated
- See `docs/business/monetization.md`

## Phase 4 — 5K-10K users (Months 3-6)

- Build folders + better search + chat-link backref (top consumer requests)
- Start the Promptory Insights MVP if 3+ design partners committed
- See `docs/business/geo-product.md`

## Phase 5 — 10K+ users (Months 6+)

- First paying B2B customer (~$500-2K/mo manual delivery)
- Productize once 3-5 customers stable
- Decide cross-device sync / Pro tier path

## North Star Metrics

| Metric | Target |
|---|---|
| Daily Active Users (DAU) | grow 10%/week early |
| Captures per DAU per day | ≥ 5 |
| D7 / D30 retention | ≥ 30% / ≥ 20% |
| Monthly churn (post-D30) | ≤ 12% |
| CWS rating | ≥ 4.5 |
| Cost per install (CPI) | < $0.50 (Tier 3 dominated) |
| First-prompt-after-install rate | ≥ 60% |

## Decision points

| At | Question |
|---|---|
| 100 installs | Do reviews feel positive? Adjust onboarding if not. |
| 500 installs | Does ad attribution actually work end-to-end? |
| 1K installs | Build folders or community first? |
| 5K installs | Run validation calls. Does anyone pay for B2B insights? |
| 10K installs | Paid tier or stay free? |
| 50K installs | Hire help, or stay solo? |

## Related docs

- `docs/business/monetization.md` — revenue strategy options
- `docs/business/geo-product.md` — Promptory Insights B2B
- `docs/business/growth.md` — channels, tactics, budgets
- `docs/architecture/data-collection.md` — privacy + collection architecture

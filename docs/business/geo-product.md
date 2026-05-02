# Promptory Insights — B2B GEO Product

## What it is

A B2B SaaS layered on top of Promptory's consumer extension data. Sells brand-visibility, competitive intelligence, and topic-trend insights derived from real user prompts to AI tools.

GEO = "Generative Engine Optimization" — the new SEO for LLMs. Brands want to know whether ChatGPT/Claude/Gemini recommend them when users ask about their category.

## Why this product makes sense for us

1. **We have a unique data asset:** real user prompts, not synthetic ad-hoc queries
2. **Existing players are weak:** Profound, AthenaHQ, Otterly.AI, etc. mostly query AI tools synthetically. Their "best CRM" prompt is not what real users actually type.
3. **Our marketing already hints at it:** privacy policy and roadmap both reference "community" and "research" features
4. **Higher ARPU than data sales:** $300-$3K/mo recurring per brand vs $1K-$50K one-off data dump

## Why this product is hard

1. **Need install volume first** — below ~10K users, dataset isn't statistically meaningful
2. **Manual sales motion** required (no self-serve)
3. **Brand entity extraction** is non-trivial at scale
4. **Long sales cycle** for B2B brands

## Architecture options

### Option A: Centralized (chosen for now)

Collect opt-in prompts to backend, run analyses server-side.

- Simple, flexible, fast iteration
- Trade-off: privacy story softens, GDPR exposure
- See `docs/business/monetization.md` for full comparison

### Option B: Federated edge queries (long-term direction)

Server defines declarative queries, extensions execute locally, send only aggregated results.

```
[Backend defines a query]:  "Find prompts mentioning these brands"
        ↓
[Extension fetches it]:      pulls /v1/queries every 24h
        ↓
[Extension runs it locally]: scans local IndexedDB, computes result
        ↓
[Extension reports result]:  POST /v1/results { queryId, counts, anonId }
        ↓
[Backend aggregates]:        sums results across all installs
        ↓
[B2B customer sees]:         "Salesforce mentioned 4,371 times last week"
```

Raw prompts never leave the device. Pattern used by Apple Private Relay, DuckDuckGo, Brave, Mozilla.

#### Query DSL (declarative, sandbox-safe)

```ts
type EdgeQuery =
  | { type: 'brand_match', id: string, brands: string[] }
  | { type: 'topic_match', id: string, keywords: string[], label: string }
  | { type: 'regex_match', id: string, pattern: string, flags: string }
  | { type: 'co_mention', id: string, primary: string[], secondary: string[] }
  | { type: 'sentiment', id: string, brand: string };

type EdgeResult = {
  queryId: string;
  queryVersion: number;
  anonInstallId: string;
  promptsEvaluated: number;
  matches: Record<string, number>;
  reportedAt: number;
};
```

#### Privacy guarantees

- Queries are public (transparency page)
- Min aggregation threshold: ≥100 users before B2B sees output
- No prompt content in results
- Rotating anonymous IDs (90-day rotation)
- Differential privacy noise on each result
- User-visible audit log of queries that ran on their device

## Customer types and queries

### SaaS companies (highest-value early target)

- Marketing: "How often does ChatGPT recommend us when users ask 'best [category]'?"
- Product: "What use cases are people asking AI about, in our category?"
- Sales/CS: "When prospects compare us against [competitor], what features come up?"

Examples: HubSpot, Notion, Vercel, Stripe, MongoDB.

### E-commerce / D2C consumer brands

- "When users ask 'best running shoes' is our brand mentioned?"
- "What attributes get mentioned alongside our brand?" (sustainability, value, premium)

Examples: Allbirds, Warby Parker, smaller D2C brands tracking AI visibility pre-launch.

### Tech infrastructure / dev tools

- "When devs ask 'how to deploy [thing]', is our service recommended?"
- "What error messages from our product show up in prompts?"

Examples: Stripe, MongoDB, Datadog.

### AI labs / model providers

- "What categories of prompts get sent to my model vs competitors?"
- "Where are users most often comparing my model to others?"

Examples: Anthropic, smaller labs. Highest willingness to pay ($10K+/mo).

### Market research firms

- "What's the share-of-voice across AI tools for [category]?"
- "How is the consideration set evolving over time?"

Examples: Gartner, Forrester, smaller research firms. Resell to enterprise clients.

### PR / brand reputation firms

- "When users ask AI about [client brand], what comes back?"
- "Crisis monitoring: are negative narratives appearing?"

Examples: Edelman, Weber Shandwick.

### Investment / VC firms

- "Which startups are showing up in AI response sets that aren't in industry reports?"
- "Early signal: which categories are seeing rising prompt volume?"

VCs pay premium for early signal.

## Productized query templates

Pre-built offerings to reduce custom-quote friction:

| Tier | Price | What's included |
|---|---|---|
| **Brand Pulse** | $300-$500/mo | Single brand visibility tracker |
| **Competitive Set** | $800-$1.5K/mo | Brand + 3 competitors, full coverage |
| **Category Dashboard** | $1K-$2K/mo | Full topic visibility (e.g., all CRM mentions) |
| **Crisis Monitor** | $500-$1K/mo | Negative sentiment alerts |
| **Use Case Discovery** | $1.5K-$3K/mo | What people ask about your category |
| **Custom Query** | $2K-$5K/mo | Customer brings the question, we ship it |

## Trends product (fly-wheel for marketing)

Non-customer-specific monthly trend reports:

- "Top 50 brands gaining mention share on ChatGPT"
- "Topics emerging fastest in AI prompts"
- "Cross-platform brand visibility leaderboard"

Sell as $99/mo newsletter or $299 quarterly report. Doubles as marketing for the main B2B product.

## Distribution model

**Manual delivery, no self-serve.** User explicitly chose this:

> "no we won't create any self-serve page"

This shifts the model:

| | Self-serve | Manual delivery (chosen) |
|---|---|---|
| Customer count needed | 100+ | 10 |
| Per-customer revenue | $300/mo | $2-5K/mo |
| Sales motion | Inbound, automated | Outbound, white-glove |
| What you build | Full SaaS dashboard, billing, onboarding | Internal admin tool + private dashboards |

**Don't build:** sign-up page, pricing page, Stripe integration, customer onboarding flow.

**Do build (eventually):**
- Internal admin tool for you (SQL views, JSON export)
- Private dashboard URLs (one per paying customer, unguessable URL)
- PDF report generator
- Simple `promptory.chat/business` contact page

## Sales motion

1. **Outbound** — LinkedIn DMs to marketing leaders at SaaS companies
2. **Discovery call** — 30 min, learn their priorities
3. **Free sample** — pull a one-off "AI visibility report" for their brand
4. **Pitch** — $2-5K/month for ongoing monitoring + monthly report
5. **Close** — invoice via Wise / Stripe Invoice
6. **Deliver** — generate report from admin tool, email PDF
7. **Renew** — they ask for next month or churn

This is the agency model, which is how every productized B2B starts (Notion, Figma, Stripe all ran like this early on).

## When to actually build

Strict gating to prevent premature optimization:

| Trigger | Action |
|---|---|
| < 1K installs | Don't think about B2B. Focus only on growth. |
| 1K-5K installs | Talk to brands. Run validation calls. **Don't build.** |
| 5K installs + 3 committed design partners | Build MVP for those specific brands. |
| 10K installs + 1 paying customer | Productize, set pricing, hire if needed. |
| 25K installs + 5 paying customers | Real business. Consider brand split. |

## The trap to avoid

**Building Stage 3 (the dashboard) before Stage 1 (validation calls).** Engineers love this trap. You'd ship a beautiful B2B dashboard with no real data and no real customers, then spend months trying to acquire either.

The cheapest way to avoid: start brand-conversation outreach the moment CWS approves the consumer extension, while you're already promoting it on Reddit / Twitter. Parallelizes growth + B2B validation.

## Brand split decision (deferred)

Consumer = "Promptory" (privacy-first AI prompt manager).
B2B = could stay under "Promptory Insights" or split off as a separate brand.

Defer until 5+ paying B2B customers. Splitting earlier is premature; splitting later is straightforward.

## Risks

1. **Reputation:** if Promptory becomes known as "the AI extension that captures all your conversations," sophisticated brand buyers will hesitate. Mitigate via consistent privacy-first marketing on the consumer side.
2. **Data quality:** Tier 3 ad traffic (India, PH) generates valid data but US brands want US user signal. Track retention/engagement by geo so Tier 1 share is provable.
3. **Long sales cycles:** B2B brands take 30-90 days to close even small deals. Don't depend on it for runway.
4. **Privacy regulation drift:** EU and US privacy law is moving. Stay attentive to changes that could affect even aggregated data sales.

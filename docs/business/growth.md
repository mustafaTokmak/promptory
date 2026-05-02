# Growth Strategy

## Stance

**No growth activity until v0.1.0 is approved.** Once approved, target 500-1K installs in first 14 days.

User opted out of Reddit / Hacker News / Product Hunt as primary launch channels. Plan below uses paid + content + direct.

## Channels (ranked by ROI for our specific situation)

### 1. Tier 3 Google Ads (fastest, predictable)

Highest-leverage channel for a free Chrome extension targeting AI users.

**Why it works:**
- Direct conversion path: ad → /go → CWS → install
- Tier 3 (India, PH, Indonesia, Egypt) keeps CPI under $0.50
- Already plumbed in: gclid → conversion endpoint
- Scales up/down based on CWS rating impact

**Setup:**
- Wise USD card live (billing solved)
- Google Ads account with PMax campaign
- Final URL: `promptory.chat/go`
- Daily budget cap: $5-10 per country to start
- Conversion goal: "first prompt captured" (not just install)

**Expected:** $200 spend = ~700 installs over 7-10 days at $0.30 CPI.

### 2. SEO blog content (slow, compounds)

Targets long-tail searches no one is monetizing yet.

**Target keywords:**

| Query | Monthly searches |
|---|---|
| save chatgpt history | 1,200 |
| chatgpt prompt manager | 800 |
| how to save claude conversations | 400 |
| ai prompt history extension | 250 |
| chatgpt prompt library chrome | 200 |
| gemini chat history extension | 150 |

**Plan:**
- 5 blog posts on `promptory.chat/blog/`
- 800-1500 words each, with screenshots
- Internal link to `/go`
- Publish 1/week, 5 weeks
- Realistic: Months 2-3 you start ranking, Month 3 → 100-300 installs/month from organic

### 3. Listing sites (low effort, free)

One-hour batch submission:

- alternativeto.net (highest traffic)
- betalist.com (early-adopter audience)
- theresanaiforthat.com / topai.tools (AI directories)
- chrome-extension-list.com

Each yields ~5-30 installs over weeks.

### 4. Twitter / X (daily presence, compounds)

Not launches — daily engagement.

- Reply to 5 AI productivity tweets/day with relevant comment + product mention
- Post 1 short demo video/week (15-30 sec)
- Tag adjacent accounts (@JustinWelsh, @petergyang, @aiwithallie, @lennysan)
- Build to 500-1K followers over 30 days; 10-15% will install

Expected: 30-50 installs/week at steady-state once presence built.

### 5. YouTube short videos

AI tool demos perform extremely well right now.

**Content angles:**
- "I auto-saved every prompt I sent to ChatGPT this week"
- "5 ChatGPT prompts I keep forgetting until I built this"
- "How to never lose a great Claude conversation"

Expected per video:
- Bad: 100 views → 2 installs
- Decent: 5K views → 80 installs
- Viral: 100K views → 2K installs

Make 5-10 videos. One viral hit pays for the rest.

### 6. Cross-promotion with adjacent extensions

Find non-overlapping tools (NOT direct competitors):

- ChatGPT Sidebar / Glasp / Notion Web Clipper / Save to Notion / Save to ReadIt

Cold-email creators offering reciprocal mentions. Most won't reply; 1-2 will. Each swap = 50-200 installs.

### 7. Personal-network warm DMs

Day 0 only. Send ~30 personal messages to friends who use ChatGPT/Claude regularly.

Template:
> "Just shipped this Chrome extension that auto-saves your AI prompts. Would love your honest opinion + a CWS review if it's useful: [link]"

Yields 50-100 real users + early reviews. The first 10 reviews shape conversion forever — this is critical.

### 8. Cold DMs on Twitter

Look for accounts that tweet ChatGPT screenshots regularly. Send personal DM.

> "Saw your thread on [topic]. Built a Chrome extension that auto-saves every prompt — thought it might help. Free, no account: [link]"

10 messages → 2-3 try it → 1-2 might tweet about it.

## What NOT to do

- ❌ Cold-email influencers in bulk (low success rate, time sink)
- ❌ "Agency" services that promise 1000 installs (bot farms, CWS will flag)
- ❌ Buy reviews (CWS bans fast)
- ❌ Display / banner ads (junk traffic for extensions)
- ❌ YouTube / Facebook / Instagram pre-roll ads (don't convert for extensions)
- ❌ Product Hunt / Hacker News / Reddit (user explicitly opted out)

## Budget tiers

### Tier A: validation only ($50-150 total, Month 1)
- $30 India PMax + $30 PH + $30 Brazil = $90
- 2 weeks runtime
- Expected: 200-400 installs
- Goal: prove funnel works. Pause if CPI > $2 or rating drops below 4.5.

### Tier B: volume building ($300-600/mo, Months 2-4)
- $150/mo Tier 3 (India + PH + Indonesia)
- $150/mo Tier 2.5 (Brazil + Mexico + Turkey + Poland)
- $0-150/mo Tier 1 (US) only if you want US brand data
- $50/mo Search keywords ("save ChatGPT prompts" etc.)
- Expected: 400-800 installs/month at $0.50-$1 CPI

### Tier C: scale ($1.5-3K/mo, Month 4+)
- Only enter when B2B demand validated
- $800/mo Tier 1 (US/UK/CA) for premium brand data
- $500/mo Tier 2.5 backstop
- $400/mo retargeting + Search
- $300/mo creative testing
- Expected: 1.5-3K installs/month

## Hard rules

1. Cap monthly spend at 2× the previous month
2. Pause if CWS rating drops below 4.3★
3. Optimize for "first prompt captured" not just install
4. Pause any country with CPI > 2× the median
5. Keep 1 month of ad spend as buffer (Wise refills take days)

## Realistic 14-day projection

```
Day 0  CWS approval     → personal network: ~80 installs
Day 1  Tier 3 ads       → +60-100 installs/day
Day 2  Listings batch   → +30/week passive
Day 3  YouTube short #1 → +5-100 installs (variable)
Day 4  Twitter daily    → +10-50/day
Day 5  Cross-promo (10 emails)
Day 7  Blog post #1
Day 10 Tier 3 working? Scale to $50/day
Day 14 Total: 600-1500 installs (mostly from ads)
```

Median outcome with focused execution: 800-1500 installs by Day 14.

## Key metrics to watch daily

| Metric | Healthy | Concerning |
|---|---|---|
| CPI | < $0.80 | > $1.50 |
| D1 retention | > 55% | < 40% |
| First-prompt rate | > 60% | < 40% |
| CWS rating | ≥ 4.5 | < 4.3 |
| Daily install velocity | growing | flat 3+ days |

## When to pivot tactics

- Bad CPI everywhere → product or onboarding problem; fix before more spend
- Bad retention everywhere → "aha moment" not happening fast enough; fix `/setting-up` flow
- High CPI in Tier 1, low in Tier 3 → expected; lean into Tier 3, defer Tier 1
- Listing sites driving zero traffic → expected at first; long tail

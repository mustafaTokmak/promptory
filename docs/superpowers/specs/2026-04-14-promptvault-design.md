# PromptVault — Design Spec

**Date:** 2026-04-14
**Revised:** 2026-04-24
**Status:** Active
**Author:** Brainstorm session

---

## 1. Vision

PromptVault is a free Chrome extension that auto-saves and organizes prompts across all major AI tools.

**Core value prop to users:** "Never lose a great prompt again. Save, search, and reuse your best AI conversations across every tool."

**Exit thesis:** The extension is a data collection mechanism. The dataset — real organic AI queries with brand mentions — is the acquisition asset. Target acquirers: GEO startups (Profound, Evertune, Otterly), or SEO tools (SEMrush, Ahrefs) at scale.

**Realistic exit range:** $500K–$2M acqui-hire at 10K–20K installs + early data validation. $5M+ requires meaningful B2B data licensing revenue first.

**Founder context:** Solo, side project (~5–10 hours/week). No revenue pressure. Strategy must be executable without B2B sales or full-time commitment.

---

## 2. Phased Roadmap

### V1 — Local Prompt Library (NOW — 3-4 weeks)

Pure client-side extension. No backend. No cloud. Ship fast, validate product-market fit, get Chrome Web Store installs and reviews. Community Prompts tab ships in V1 as a consent gate — no actual community content yet.

### V2 — Cloud Sync + Data Pipeline (Month 3–5)

Add Supabase backend, cloud sync across devices, and data collection (categorized prompt intent + full AI responses). Users opt into cloud sync which includes anonymized data aggregation. Community Prompts content goes live.

**Trigger to start V2:** 1,000+ active users saving 20+ prompts/week.

### V3 — B2B Data Product (Month 9–15)

Approach GEO companies with sample dataset. Start with manual data reports, not a full dashboard. Validate willingness to pay before building.

**Trigger to start V3:** 2,000+ cloud users, 200K+ monthly commercial-intent queries.

### V4 — Exit (Month 12–24)

Approach acquirers with unique organic GEO dataset and validated B2B interest.

---

## 3. V1 Product Spec

### 3.1 Supported AI Platforms

- ChatGPT (chat.openai.com)
- Google Gemini (gemini.google.com)
- Anthropic Claude (claude.ai)
- Perplexity (perplexity.ai)
- Grok (x.com/grok)
- Microsoft Copilot (copilot.microsoft.com)

### 3.2 Auto-Capture Engine

The core system that detects and saves prompts + responses from supported AI tools.

**How it works:**

- Content scripts injected into supported AI tool pages
- Detects prompt submission events (form submit, button click, Enter key)
- Captures the user's prompt text and the AI's response
- Stores locally in IndexedDB with metadata
- Zero network requests — everything stays on device

**Captured metadata per entry:**

- Prompt text
- AI response text
- AI platform (ChatGPT, Gemini, Claude, Perplexity, Grok, Copilot)
- Timestamp
- URL of the conversation
- Conversation thread ID (to group multi-turn chats)
- User-assigned tags (optional)
- Favorite flag

**Edge cases:**

- Multi-turn conversations: each prompt/response pair saved as a linked entry within a conversation thread
- Streaming responses: wait for response completion before capturing (debounce text node changes until stable)
- Image/file prompts: store text portion, note attachment presence
- Regenerated responses: save both versions, mark which was regenerated

### 3.3 Popup UI (Quick Access)

Accessed by clicking the extension icon in the toolbar.

- Recent prompts list (last 20)
- Quick search bar (full-text across prompts and responses)
- Favorite/bookmark toggle per entry
- One-click copy prompt to clipboard
- One-click copy response to clipboard
- Platform icon indicator per entry
- "Open Dashboard" link
- **Prompt count badge** — shows total saved ("You've saved 47 prompts") — critical for retention

### 3.4 Dashboard Page (Full Library)

Opens as a new tab — the full prompt management interface. Four tabs: **My Prompts**, **Folders**, **Community**, **Settings**.

- All prompts with infinite scroll
- Search (full-text across prompts and responses)
- Filter by: AI platform, date range, tags, favorites
- Manual folders — create, rename, delete, drag & drop prompts into folders
- Bulk actions: tag, move to folder, delete, export selection
- Conversation view: expand to see full multi-turn thread
- Sort by: newest, oldest, platform, folder

### 3.5 Community Prompts Tab (V1 — Consent Gate Only)

The Community tab is visible in the dashboard from day one. When clicked, the user sees a consent gate before accessing any content.

```
┌─────────────────────────────────────────────┐
│           Community Prompts  🌐              │
│                                             │
│  Browse prompts shared by the               │
│  PromptVault community.                     │
│                                             │
│  To access community prompts, we            │
│  anonymize and include your saved prompts   │
│  in our shared dataset. Your personal       │
│  information is never shared.               │
│                                             │
│  [Read full policy]                         │
│                                             │
│  [Accept & Browse Community]                │
│  [Keep my prompts private]                  │
└─────────────────────────────────────────────┘
```

**After accepting:** Empty state — "You're in. Community prompts are coming soon. You'll be among the first to see them."

**Storage:** `consentGiven: true` flag stored in IndexedDB. No backend needed in V1. When V2 ships, consented users are already identified — data pipeline starts immediately for them.

### 3.6 Review Prompt (Retention Mechanism)

After a user saves their 10th prompt, show a non-intrusive banner:

> "You've saved 10 prompts with PromptVault ⚡ Enjoying it? A quick review helps a lot."

This is the primary lever for Chrome Web Store star rating. No fake reviews. Just the right ask at the right moment.

### 3.7 Export & Portability

- Export all data as JSON or CSV
- Export individual folders
- Import from JSON (for backup restore)

### 3.8 Privacy (V1)

V1 is fully local by design — not as a brand promise, but because there's no backend yet. This ensures fast Chrome Web Store approval and minimal permissions review.

- No accounts — no sign-up, no login, no email
- No network requests — extension works fully offline after install
- Minimal permissions — only host permissions for supported AI tool domains

V2 will introduce optional cloud sync with clear opt-in. Privacy is a feature of V1's architecture, not the core identity of the product.

---

## 4. Technical Architecture (V1)

### 4.1 Extension Structure (WXT)

```
promptvault/
├── wxt.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── assets/
│   └── icons/                     # Extension icons (16, 32, 48, 128)
├── entrypoints/
│   ├── background.ts              # Service worker
│   ├── popup/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── dashboard/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── content/
│       ├── chatgpt.content.ts
│       ├── gemini.content.ts
│       ├── claude.content.ts
│       ├── perplexity.content.ts
│       ├── grok.content.ts
│       └── copilot.content.ts
├── lib/
│   ├── db.ts                      # Dexie.js IndexedDB setup
│   ├── storage.ts                 # CRUD operations for prompts
│   ├── capture.ts                 # Shared capture utilities
│   ├── capture-engine.ts          # Core capture logic
│   ├── platforms-config.ts        # Platform selectors (all selectors live here)
│   ├── platform.ts                # Platform detection
│   └── types.ts                   # TypeScript types
├── components/
│   ├── PromptCard.tsx
│   ├── SearchBar.tsx
│   ├── FolderTree.tsx
│   └── FilterBar.tsx
└── styles/
    └── globals.css
```

### 4.2 Tech Stack

| Layer               | Technology              | Rationale                                               |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| Extension framework | WXT (wxt.dev)           | Cross-browser, hot reload, MV3, file-based routing      |
| Language            | TypeScript              | Type safety for complex DOM parsing                     |
| UI                  | React 19 + Tailwind CSS | Fast dev, small bundle, utility-first styling           |
| Local storage       | IndexedDB via Dexie.js  | Large storage capacity, indexed queries, no size limits |
| Build               | Vite (via WXT)          | Fast builds, tree-shaking                               |

### 4.3 Content Script Strategy

Each AI platform has a dedicated content script that:

1. **Observes the DOM** using MutationObserver for prompt/response elements
2. **Identifies prompt submission** (platform-specific selectors)
3. **Waits for response completion** (streaming detection via text node change debounce)
4. **Extracts text content** from the DOM
5. **Sends to background service worker** via `chrome.runtime.sendMessage`
6. **Service worker stores** in IndexedDB via Dexie.js

**Selector maintenance is ongoing.** AI platforms change their DOM frequently. All selectors live in `platforms-config.ts` — updates require touching one file, not six.

### 4.4 Data Flow (V1)

```
[User types prompt in ChatGPT]
        ↓
[Content script detects submission via DOM observer]
        ↓
[Waits for AI response to finish streaming]
        ↓
[Extracts prompt text + response text]
        ↓
[Sends to service worker via chrome.runtime.sendMessage]
        ↓
[Service worker stores in IndexedDB via Dexie.js]
        ↓
[Popup/Dashboard reads from IndexedDB reactively]
```

### 4.5 IndexedDB Schema (Dexie.js)

```typescript
interface Prompt {
  id: string;              // UUID
  threadId: string;        // Groups multi-turn conversations
  platform: 'chatgpt' | 'gemini' | 'claude' | 'perplexity' | 'grok' | 'copilot';
  promptText: string;
  responseText: string;
  sourceUrl: string;
  timestamp: number;
  tags: string[];
  folderId: string | null;
  isFavorite: boolean;
  isRegenerated: boolean;
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  order: number;
}

interface Settings {
  consentGiven: boolean;     // Community Prompts data policy accepted
  consentTimestamp: number | null;
}
```

**Indexes:** `timestamp`, `platform`, `folderId`, `isFavorite`, `threadId`, `[tags+]` (multi-entry)

### 4.6 Chrome Permissions (V1)

```json
{
  "permissions": ["storage"],
  "host_permissions": [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "https://www.perplexity.ai/*",
    "https://x.com/*",
    "https://copilot.microsoft.com/*"
  ]
}
```

---

## 5. V1 MVP Scope

### In Scope (3-4 weeks)

1. Auto-capture engine for ChatGPT, Gemini, Claude, Perplexity, Grok, Copilot
2. Local storage with IndexedDB (Dexie.js)
3. Popup UI — recent prompts, search, copy, favorites, prompt count badge
4. Dashboard page — My Prompts, Folders, Community tab, Settings
5. Community tab — consent gate + empty "coming soon" state
6. Review prompt trigger (after 10th saved prompt)
7. Export as JSON/CSV
8. Import from JSON (backup restore)
9. Chrome Web Store listing — description, screenshots, privacy policy

### Out of Scope (V2+)

- Cloud sync / accounts / login
- Actual community prompt content (tab exists but no content)
- Keyword classifier / categorization
- Brand mention extraction
- B2B dashboard or API
- Firefox/Safari/Edge versions
- AI-powered features
- Compare feature (designed in section 10.1, not building yet)

---

## 6. Growth Strategy

### The North Star Metric

**Prompts saved per active user in week 1.**

If users save 20+ prompts in week 1, they stay. If they install and never see a captured prompt, they uninstall. Everything else is secondary to this.

### Phase 1 — Launch (Month 1)

Front-load everything into a 48-hour window.

**Pre-launch (2 weeks before):**
- Finalize CWS listing: screenshots, description, privacy policy
- Line up a ProductHunt hunter with followers
- Write Reddit posts, don't publish yet

**Launch day (Tuesday morning):**
- Submit to Chrome Web Store
- Launch on ProductHunt
- Post on r/ChatGPT, r/productivity, r/artificial simultaneously
- Post "Show HN" on HackerNews

**Primary message:**
> "Free Chrome extension that auto-saves every prompt you send to ChatGPT, Claude, Gemini, and more. Search, reuse, and organize your best AI conversations — no account needed."

**Expected Month 1 installs:** 3K–8K (organic only)

### Phase 2 — Social Proof Push (Month 2–3)

Once organic installs establish credibility (50+ reviews, 4.3+ stars), run a small paid campaign in high-volume, low-CPC markets to push install count over 10K.

**Markets:** India, Philippines, Indonesia, Eastern Europe
**CPC:** $0.05–$0.30 | **Budget:** $1K–$3K | **Goal:** Hit "10,000+ users" CWS badge

**Important:** Cheap-country installs are strictly for the CWS social proof badge. Their data is not useful for the GEO play. Commercial-intent queries come from US/UK/CA/AU users only.

### Phase 3 — Steady Organic (Month 3–6)

- YouTube outreach: contact AI tools creators (10K–200K subscribers) for mentions
- Ongoing Reddit presence in AI communities
- Twitter build-in-public content
- CWS organic search (ranking improves with installs + reviews)

**Expected monthly installs:** 500–1,500/month

### Phase 4 — V2 Launch + Quality Growth (Month 5–8)

- Ship V2 (cloud sync + community content)
- Second ProductHunt launch
- Small US-targeted paid test ($500–1K) to validate CAC before scaling
- Only scale paid if: CAC < $8 AND 30-day retention > 40%

---

## 7. The GEO Data Play

### What Brands Pay For

Commercial-intent queries from US/UK/CA/AU users:
- "Best CRM for startups"
- "Compare HubSpot vs Salesforce"
- "Which project management tool should I use"

What they don't pay for: coding queries, creative writing, personal productivity.

**Data quality > data quantity.**

### Minimum Thresholds to Approach Buyers

| Stage | Cloud Users | Queries/Month | Action |
|---|---|---|---|
| Pilot conversation | 500–2K | 50K–200K | Cold email Profound/Evertune with sample |
| Early data product | 5K–10K | 500K–1M | Manual monthly reports, $500–2K/month |
| Real licensing | 15K–30K | 1.5M–3M | Enterprise contracts |
| Exit-ready | 50K+ | 5M+ | Acquisition conversations |

### Who to Approach First (Month 9–12)

**GEO Startups: Profound, Evertune, Otterly**

The script:
> "We're collecting organic AI queries via a Chrome extension — real users, real prompts, no synthetic data. We have X cloud users generating Y queries/month. Would you pay for access to that dataset?"

### Realistic Exit Scenarios

| Scenario | Timeline | Requirements | Range |
|---|---|---|---|
| Acqui-hire by GEO startup | Month 12–18 | 10K installs, working data pipeline | $200K–$800K |
| Strategic asset purchase | Month 18–24 | 20K installs, validated data interest | $500K–$2M |
| Full acquisition | Month 24+ | 50K+ installs, $500K+ ARR | $2M–$10M |

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| AI platforms change DOM structure | High | All selectors in `platforms-config.ts`, monitor changes, patch fast |
| Chrome Web Store rejection | Low | Minimal permissions, clear privacy policy, no remote code |
| Low retention | High | Review trigger at 10th prompt, strong empty-state UX |
| Solo burnout | High | Strict scope, no B2B sales in V1–V2, only build what's in spec |
| GEO market doesn't materialize | Medium | Product has standalone value as a consumer tool regardless |

---

## 9. Success Metrics

### V1 (Month 1–3)

- **Installs:** 5K in first month (organic), 10K by month 3 (with social proof push)
- **The key metric:** 20+ prompts saved per active user in week 1
- **Retention:** 40%+ still active at 30 days
- **Chrome Web Store rating:** 4.5+ stars (50+ reviews)
- **Consent rate:** % of users who accept the community data policy

### V2 (Month 5–8)

- **Cloud conversion:** 30%+ of active users opt into cloud sync
- **Cloud users:** 1,000+ by end of Month 6

### V3 (Month 9–15)

- **First paid data conversation:** At least 1 GEO company responds to outreach
- **Monthly commercial-intent queries:** 200K+ from cloud users

---

## 10. Planned Features — Not Building Yet

These features are fully designed. Do not build until the specified trigger condition is met.

---

### 10.1 AI Response Comparator

**Status:** Designed, not building until V2
**Trigger:** Ship after V1 has 1K+ active users and the core capture engine is stable

#### What It Is

A dedicated **Compare** tab in the Dashboard where the user types a prompt once and sees responses from multiple AI platforms side-by-side — without manually copy-pasting across tabs.

#### Why It Matters

- High engagement, high shareability
- For the GEO data play: multi-platform responses to the **same query** are more valuable than single-platform captures
- Natural V2 hook: "cloud sync your comparisons across devices"

#### User Flow

```
User opens Dashboard → clicks "Compare" tab
→ Types a prompt
→ Selects platforms (2–6 checkboxes)
→ Clicks "Compare"
→ Extension opens background tabs (not visible, no tab chaos)
→ Content scripts auto-inject the prompt and submit
→ Responses stream back in real time
→ Side-by-side columns, one per platform
→ User can copy any response, save the comparison, or export
```

#### Technical Design

**Tab orchestration (background.ts):**
```
chrome.tabs.create({ url: platform.url, active: false })
→ inject prompt via content script message
→ content script submits and captures response
→ sends back via chrome.runtime.sendMessage({ type: 'COMPARE_RESPONSE', platform, response })
→ background collects all N responses
→ when all received (or timeout): sends to dashboard
```

**Content script dual-mode:**
```typescript
const mode = await chrome.storage.session.get('compareMode')
if (mode.active) {
  injectAndSubmit(mode.prompt)   // compare mode
} else {
  startPassiveCapture()          // normal mode
}
```

**Comparison schema:**
```typescript
interface Comparison {
  id: string
  prompt: string
  timestamp: number
  platforms: {
    platform: Platform
    responseText: string
    durationMs: number
    status: 'success' | 'timeout' | 'error'
  }[]
  tags: string[]
  isFavorite: boolean
}
```

**Per-platform timeout:** 60 seconds. Partial results shown as they arrive.

#### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Compare                                          [Export ↓] │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Your prompt here...                    [Compare →] │    │
│  └─────────────────────────────────────────────────────┘    │
│  ☑ ChatGPT  ☑ Claude  ☑ Gemini  ☐ Perplexity  ☐ Grok      │
├──────────────┬──────────────┬──────────────────────────────  │
│  ChatGPT     │  Claude      │  Gemini                        │
│  ──────────  │  ──────────  │  ──────────                    │
│  Response    │  Response    │  ● loading...                  │
│  text here   │  ...         │                                │
│  [Copy]      │  [Copy]      │  [Copy]                        │
└──────────────┴──────────────┴────────────────────────────────┘
```

---

### 10.2 Community Prompts (Full Feature)

**Status:** Consent gate ships V1. Full community content ships V2.
**Trigger (content):** Ship after V2 backend is stable and moderation queue is set up

#### Why This Matters Strategically

Community Prompts is the cleanest rationalization for data collection:

> "We collect anonymized prompt data to power the community library — the more people share, the better it gets for everyone."

It also creates:
- **Network effects** — more users → more prompts → more value → more users
- **Viral growth** — shareable public prompt pages drive organic installs
- **SEO surface** — public community prompt pages indexed by Google
- **Higher data quality** — shared prompts are curated and intentional, skewing toward commercial intent

#### PII Risk — Four-Layer Defense

Users routinely include PII in AI prompts without thinking (`"email sarah@company.com"`, `"I'm 45 with diabetes"`). Four layers prevent this reaching the community:

**Layer 1 — Client-Side PII Detection (before submitting)**

| PII Type | Pattern | Action |
|---|---|---|
| Email addresses | `\S+@\S+\.\S+` | Warn + highlight |
| Phone numbers | `[\+\d][\d\s\-\(\)]{8,}` | Warn + highlight |
| Credit card numbers | `\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}` | Block |
| SSNs | `\d{3}[-\s]?\d{2}[-\s]?\d{4}` | Block |
| Auth tokens in URLs | `[?&](token\|key\|auth\|secret)=\S+` | Block |

UX: warn with highlighted match. "Share anyway" allowed (shifts responsibility to user).

**Layer 2 — Server-Side Sanitization (before storing)**

Even if user clicks "Share anyway", backend replaces detected PII before persisting:
```
Emails → [email]   Phones → [phone]   Cards → [redacted]
```
Original (unsanitized) prompt never stored.

**Layer 3 — Manual Moderation Queue (before going live)**

Every submitted prompt enters `status = "pending"` — not visible in community until manually approved. Review via Supabase dashboard (filter `status = pending`, update to `approved` / `rejected`). No custom admin UI needed until 500+ submissions/day.

**Full submission flow:**
```
User submits prompt
      ↓
Layer 1: Client-side PII scan → warn if found
      ↓
Layer 2: Server-side sanitizer → store clean version only
      ↓
status = "pending" (NOT visible yet)
      ↓
Layer 3: Manual review in Supabase
      ↓
status = "approved" → appears in community
```

**Layer 4 — ToS prohibition** on sharing third-party PII, health data, credentials.

#### Data Flow (V2)

```
User saves a prompt locally (unchanged)
      ↓
User clicks "Share to Community"
      ↓
Client PII scan → user confirms
      ↓
Server PII sanitizer → clean version stored as pending
      ↓
Manual approval → appears in community library
      ↓
Other users copy it → enters their local library
```

#### Open Strategic Questions

1. **Accounts** — community sharing likely needs user accounts (for attribution, moderation). Bigger V2 lift than cloud sync alone.
2. **Moderation at scale** — auto-reject below vote threshold when manual review becomes impractical.
3. **SEO** — each approved prompt gets a public URL (`promptvault.app/community/[slug]`) for Google indexing.

---

## 11. Future Phases (Context Only)

### V2: Cloud Sync + Data Collection

- Supabase backend (auth, Postgres, real-time sync, Row Level Security)
- Cloud sync activated by user opting in (requires accepting data terms)
- Client-side keyword classifier categorizes prompts on-device (~30 categories)
- Only category labels + full AI responses sent to cloud (raw prompts stay on device)
- Server-side PII sanitizer on all uploaded content
- Server-side brand entity extraction from AI responses

### V2 Category Taxonomy

| Category | Trigger Keywords |
|---|---|
| `product_comparison` | "vs", "or", "compare", "better" |
| `recommendation_request` | "best", "top", "recommend", "which" |
| `how_to` | "how to", "how do I", "steps to" |
| `troubleshooting` | "error", "not working", "fix", "debug" |
| `pricing_inquiry` | "price", "cost", "how much", "free" |
| `code_generation` | "write", "create", "build", "implement" |
| `writing_assistance` | "rewrite", "draft", "summarize" |
| `research` | "explain", "what is", "tell me about" |
| `creative` | "design", "generate", "idea", "brainstorm" |

### V3: B2B Data Product

- Start with manual monthly reports (Notion/PDF) delivered to 2–3 pilot customers
- Build dashboard only after $5K+/month in data licensing is validated
- Brand Visibility Index, competitive landscape reports, API access

### Legal Considerations (V2+)

- Privacy policy updated for cloud data collection
- GDPR: right to access, deletion, portability, explicit consent
- CCPA: disclosure of data practices
- AI platform ToS review for content script compatibility

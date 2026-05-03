# eBay AI Message Assistant — Business Plan & Product Requirements Document

**Version:** 1.0
**Date:** May 3, 2026
**Founder:** Bayu
**Status:** Pre-build / Validation phase

---

# PART I — BUSINESS PLAN

---

## 1. Executive Summary

### The product
A Chrome extension and web dashboard that helps high-volume eBay sellers handle inbound buyer messages using AI. The extension reads the seller's own eBay inbox, the AI drafts contextual replies grounded in listing data and brand voice, and the seller approves with one click.

### The problem
High-volume eBay sellers spend 30-90 minutes per day answering repetitive buyer questions whose answers already exist in their listings. Slow replies cost sales. Time tax scales with inventory and creates a hard ceiling on seller growth.

### The market gap
Existing eBay seller tools (AutoDS, Yaballe, ChannelReply) focus on *post-purchase* templated messaging — order confirmations, tracking updates, feedback requests. **Nobody is doing AI-drafted, listing-aware, brand-voice-trained responses to inbound buyer questions.** That's the wedge.

### The model
SaaS subscription, $19-49/month, targeting volume sellers (100+ listings). Cost-conscious LLM architecture keeps margins healthy. Distribution through Chrome Web Store, eBay seller communities, and content marketing.

### Why this works
- Single, focused problem with a clear ROI (time saved → more selling time)
- Underserved category (no direct AI-Q&A competitor on eBay)
- Lean tech stack buildable solo with AI-assisted coding
- Validated pain (founder is an active eBay seller with this exact problem)
- Clear V2+ expansion path (Poshmark, Mercari, Depop)

### The ask / next steps
This is a bootstrapped solo build. Phase 0 validation is happening on the founder's own eBay account. Beta launch targeted within 12 weeks.

---

## 2. Vision & Mission

### Vision
Make running a high-volume marketplace business as effortless as running a small one. Sellers should focus on sourcing and growth, not on retyping answers all day.

### Mission (V1)
Save eBay sellers 30+ minutes a day by drafting smart, on-brand replies to inbound buyer questions — without violating any platform policy and without forcing the seller to give up control.

### Long-term vision (3-5 years)
Become the default AI customer service layer for resale marketplaces — eBay, Poshmark, Mercari, Depop, Vinted — with a single dashboard that gives volume sellers a unified, intelligent inbox.

---

## 3. The Problem (Detailed)

### Customer pain points (validated through founder experience)
1. **Repetition fatigue:** sellers answer the same 5-10 questions over and over per day
2. **Listing redundancy:** ~70% of incoming questions have answers already written in the listing description
3. **Response speed pressure:** buyers shop multiple sellers; whoever replies first often wins the sale
4. **Inconsistency:** when sellers are tired, they reply curtly or skip messages entirely — hurting their feedback score
5. **Vacation problem:** sellers can't take a real day off without messages piling up
6. **Scale ceiling:** at ~500+ listings, message volume becomes a full part-time job

### Quantified pain (founder benchmarks)
- 30-90 min/day on messages for 200-500 listings
- ~3-5 minutes per message manually (read → check listing → reply)
- For a seller doing $5K/month profit, that's ~$15-25/hour of unpaid customer service work
- A tool that saves 1 hour/day = ~$450-750/month of recovered time at minimum

### Why the problem isn't already solved
- Big platforms (AutoDS, Yaballe) chose to focus on post-sale automation because it's templated and easier
- Inbound Q&A requires natural language understanding, listing context, and brand voice — that's only become economically feasible with LLMs in the last 18-24 months
- eBay itself rolled out generic Smart Reply, but it's not personalized and not listing-aware

---

## 4. Market Analysis

### Total Addressable Market (TAM)
- ~19 million active eBay sellers globally (2024 figures)
- ~2-3 million considered "active sellers" with regular sales
- ~500K-1M of those are high-volume sellers (our target)

### Serviceable Addressable Market (SAM)
- English-speaking high-volume eBay sellers in US, UK, Australia, Canada
- Estimated 250-500K sellers
- At an average ARPU of $30/month → $90M-$180M/year SAM

### Serviceable Obtainable Market (SOM, 3-year)
- Realistic capture: 0.5-2% of SAM in 3 years = 1,250-10,000 paying users
- ARR range: $450K - $3.6M by year 3 (conservative band)

### Market trends (favorable)
- LLM costs dropping ~80% YoY making per-message AI economics work
- Solo entrepreneur boom — more people running side-hustle eBay stores who need leverage
- AI tooling acceptance rising fast — sellers used to fear "AI sounds robotic" now expect it
- eBay actively allows seller-tooling Chrome extensions (precedent exists: Seller Protect, ZIK Booster, eBay Safe Sellers)
- Cross-listing economy growing — same sellers on Poshmark/Mercari give us obvious V2 customers

### Market trends (risks)
- eBay could change DOM, breaking scraping
- eBay could launch their own AI message handler (mitigation: speed, focus, multi-platform path)
- LLM commoditization could erode our drafting moat (mitigation: our moat is the *learning loop* per seller, not the LLM itself)

---

## 5. Competitive Landscape

### Direct-ish competitors (post-sale messaging)

#### AutoDS
- **What they do:** full dropshipping platform — listing import, order automation, tracking updates, automated post-sale messaging (3 messages: order placed, tracking, feedback request)
- **Pricing:** $19.90/mo (Import) → $69.90/mo (Advanced 800), with higher tiers up to $3,000+/mo for enterprise
- **Tech:** OAuth into eBay; backend monitors order events; sends via eBay APIs and/or browser automation; template-based
- **Strengths:** big company, broad feature set, established brand, multi-marketplace
- **Weaknesses:** focused on dropshippers; pre-sale buyer Q&A not their core focus; expensive if you only need messaging; templated, not AI-drafted; no listing-aware intelligence

#### Yaballe
- **What they do:** very similar to AutoDS — dropshipping management with templated auto-messages
- **Pricing:** $14.90-$179.90/mo depending on listing count
- **Tech:** API-based (requires their non-API option for some flows); template-based messaging
- **Strengths:** affordable lower tier
- **Weaknesses:** same as AutoDS — templated, post-sale focus, not pre-sale Q&A

#### ChannelReply
- **What they do:** integrates eBay messaging into helpdesk software (Zendesk, Help Scout, Gorgias, Freshdesk)
- **Pricing:** ~$59-$129/mo
- **Tech:** API integration with eBay + helpdesk software
- **Strengths:** good for teams that already use a helpdesk
- **Weaknesses:** doesn't draft replies — just routes them; expensive; designed for support teams not solo sellers

#### eBay's native Smart Reply
- **What it is:** eBay's own AI suggested reply feature
- **Pricing:** free
- **Strengths:** zero install
- **Weaknesses:** generic, not trained on seller voice, not listing-aware, limited control

#### Generic AI tools (ChatGPT, Claude.ai, etc.)
- **What people do:** copy/paste messages into ChatGPT, ask for a reply, copy/paste back
- **Strengths:** flexible, cheap
- **Weaknesses:** manual, no automation, no memory, no listing context, slow

### Indirect competitors
- Helpdesk SaaS (Gorgias, Zendesk) — overkill for solo sellers, not eBay-native
- Inkfrog, ChannelAdvisor — listing/inventory tools, not messaging-focused
- VAs (virtual assistants) — what many sellers actually use; we're a cheaper, faster, more consistent alternative

### Competitive positioning summary

| | AutoDS / Yaballe | ChannelReply | eBay Smart Reply | **Our Tool** |
|---|---|---|---|---|
| Inbound buyer Q&A | ❌ | ⚠️ (organize only) | ⚠️ (generic) | ✅ |
| AI-drafted replies | ❌ | ❌ | ⚠️ | ✅ |
| Listing-aware | ❌ | ❌ | ❌ | ✅ |
| Brand voice training | ❌ | ❌ | ❌ | ✅ |
| Per-buyer memory | ❌ | ⚠️ | ❌ | ✅ |
| Post-sale tracking msgs | ✅ | ✅ | ❌ | ❌ (V1) |
| Solo-seller friendly price | ⚠️ | ⚠️ | ✅ | ✅ |

### Our wedge in one sentence
**The only tool that uses AI to draft personalized, listing-aware replies to inbound eBay buyer questions in the seller's own voice.**

---

## 6. Business Model

### Revenue model
SaaS subscription, monthly or annual billing.

### Pricing tiers (proposed — to validate in beta)

| Tier | Price | Limits | Target |
|---|---|---|---|
| **Free Trial** | $0 for 14 days | Up to 50 messages, all features | Acquisition |
| **Starter** | $19/mo or $190/yr | Up to 200 messages/mo, 1 eBay account, basic templates | Hobbyist transitioning to volume |
| **Pro** | $39/mo or $390/yr | Up to 1,000 messages/mo, 1 eBay account, all features, memory + learning | Primary target — volume sellers |
| **Power** | $79/mo or $790/yr | Up to 5,000 messages/mo, multi-account, priority model, API send option | Power sellers, small teams |

Annual pricing offers ~17% discount (2 months free).

### Unit economics (rough estimate, to refine)

**Per Pro user ($39/mo):**
- LLM cost (Claude API with caching, tiered models): ~$2-4/mo
- Hosting (Postgres + backend + dashboard): ~$0.50/mo amortized
- Email/auth/analytics: ~$0.20/mo amortized
- Stripe / payment fees: ~$1.50/mo
- **Gross margin: ~$30-35/user/month → ~85% gross margin**

### Customer Acquisition Cost (CAC) target
- Goal: blended CAC under $30
- Target LTV/CAC: 5:1+

### Lifetime Value (LTV) estimate
- Average tenure goal: 12-18 months
- Pro tier LTV: ~$470-$700

### Churn assumptions
- Monthly churn: 5-8% (typical for SMB SaaS)
- Will improve as memory/learning makes the product stickier over time

---

## 7. Go-To-Market Strategy

### Phase 1: Founder validation (Weeks 0-4)
- Build and test on founder's own eBay account
- Document time saved, draft quality, edge cases
- Refine prompts, categories, brand voice templates with real data

### Phase 2: Closed beta (Weeks 5-12)
- Recruit 5-10 beta users from:
  - Founder's existing seller network
  - eBay seller Facebook groups, Reddit (r/Flipping, r/eBay)
  - Direct outreach to volume sellers
- Free during beta in exchange for feedback + testimonials
- Daily check-ins, fast iteration

### Phase 3: Public launch (Month 4-6)
- Chrome Web Store listing
- Landing page with clear demo video showing time saved
- Initial channels:
  - **Content marketing:** YouTube videos demoing the tool ("How I save 1 hour a day on eBay messages")
  - **Reddit / Facebook:** organic presence in r/Flipping, eBay seller groups (no spammy posts — actual help)
  - **eBay-focused influencers:** outreach to YouTubers covering reselling
  - **Product Hunt launch**
  - **SEO:** target queries like "eBay message automation," "auto reply eBay buyer questions"
- Lifetime deal on AppSumo as one-time bump (consider carefully — can hurt LTV)

### Phase 4: Scale (Month 7-12)
- Add Poshmark support (V2)
- Affiliate program (15-25% commission for first 12 months of referrals)
- Paid ads testing — Google Search, Reddit, YouTube pre-roll on reselling content
- Conference / community presence (Reseller events)

### Distribution channels ranked by expected ROI
1. **Organic content (YouTube + SEO)** — highest leverage long-term
2. **Reseller community presence** — Reddit, Facebook groups, Discord
3. **Influencer partnerships** — reselling YouTubers
4. **Chrome Web Store organic** — important to optimize listing
5. **Paid search (Google)** — once unit economics proven
6. **Affiliate / referral** — once we have happy customers

### Brand voice (marketing)
- Practical, time-saving, no-BS
- Speak seller-to-seller (founder is one of them)
- Avoid over-promising AI magic — emphasize control, approval, and time recovered

---

## 8. Financial Projections (Conservative)

### Year 1 — bootstrapped, solo

| Quarter | Users (paying) | MRR | Notes |
|---|---|---|---|
| Q1 | 0 | $0 | Build + closed beta (free) |
| Q2 | 25 | ~$800 | Public launch, early adopters |
| Q3 | 100 | ~$3,200 | Content + community traction |
| Q4 | 250 | ~$8,000 | First scale signs |

**Year 1 ARR exit:** ~$96K
**Year 1 total revenue (cumulative):** ~$30-40K
**Year 1 costs:** ~$8-15K (hosting + tools + maybe minimal ads)
**Year 1 net (founder pre-tax):** $20-30K side income

### Year 2 (with Poshmark added)

| Quarter | Users (paying) | MRR |
|---|---|---|
| Q1 | 500 | ~$17K |
| Q2 | 1,000 | ~$34K |
| Q3 | 1,800 | ~$60K |
| Q4 | 2,800 | ~$95K |

**Year 2 ARR exit:** ~$1.1M
**Year 2 total revenue:** ~$420K
**Year 2 costs:** ~$120K (hosting scales, possible part-time hire, ads)
**Year 2 net:** ~$300K

These are conservative estimates — actual could be higher with viral traction or lower if churn is worse than expected.

### Costs structure (initial, monthly)
- Hosting (Railway/Render + Postgres): $50-200
- Domain, email, misc: $30
- LLM API: starts ~$0, scales with users
- No payroll (solo founder)
- Total Y1 fixed: ~$100-300/mo

### When to consider hiring
- After ~$15K MRR consistently — first hire likely customer support / community manager part-time
- After ~$40K MRR — second engineer for V2 platform expansion

---

## 9. Team & Operations

### Current team
- **Bayu** — Founder, full-stack, primary user (active eBay seller). Building solo with AI-assisted coding (Claude Code).

### Operating model
- Async-first, remote
- AI-assisted development (Claude Code) for velocity
- Customer support: Bayu directly during beta and early launch (high signal)
- Move to ticketing system (e.g., Plain, HelpScout) at ~250 users

### Founder's superpower
- Active eBay seller with the exact problem → product instinct, fast feedback loops, credibility in the community

### Founder gaps to plug eventually
- Marketing / content production at scale
- Customer support at scale
- Frontend polish (current build will be functional, not beautiful — fine for V1)

---

## 10. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| eBay changes DOM, breaks extension | High | Modular selectors; monitoring; quick-patch playbook; consider partial fallback to API |
| eBay changes policy banning this category | Medium | Stay strictly "helper, not bot"; engage eBay developer community; keep API send option ready |
| LLM gives wrong/embarrassing reply that ships | Medium | Seller-approves-before-send is the V1 firewall — never auto-send in V1 |
| eBay launches their own competing AI feature | Medium | Speed to market; focus on cross-platform expansion (V2 Poshmark) where eBay can't follow |
| LLM cost spikes | Low-Med | Aggressive caching; tiered models; per-user budget caps; pricing flexibility |
| Buyer messages contain PII | Medium | Clear privacy policy; PII scrubbing option; data retention limits |
| Founder burnout | High | Conservative phased roadmap; don't skip Phase 0 validation; honor weekly limits |
| Low conversion | High | Validate willingness-to-pay with 5+ sellers before scaling build |
| Scraping flags seller account | High | Conservative rate limits; randomized timing; strict "respond only" stance |
| Cross-platform expansion delayed | Med | Eat dogfood — founder cross-lists, so V2 motivation is real |

---

## 11. Key Milestones

| Milestone | Target Date | Success Criteria |
|---|---|---|
| Phase 0 validation complete | Week 1 | ≥60% of founder's messages clearly automatable |
| Working extension + ingestion | Week 3 | Messages flow from eBay → DB |
| AI drafting end-to-end loop | Week 5 | Founder using own product daily |
| Send path functional | Week 6 | Closed loop working on founder's account |
| Memory + learning integrated | Week 8 | Drafts noticeably better after a week of edits |
| Multi-tenant, onboarding, billing | Week 10 | Second user can install and pay |
| Closed beta with 5 sellers | Week 12 | 3+ retained beta users |
| Public launch | Month 4-5 | 25 paying users in first month |
| 100 paying users | Month 6 | $3K+ MRR |
| Poshmark support shipped | Month 12 | First cross-platform user |

---

## 12. Strategic Decisions / Open Questions

1. **Pricing model finalization** — flat tiers vs. usage-based vs. hybrid? Validate with beta users.
2. **Brand name** — TBD. Needs to be available as domain + Chrome extension.
3. **LLM vendor** — Anthropic Claude as default; consider fallback for redundancy in V2.
4. **Paid ads timing** — wait until unit economics proven (~50+ paying users with stable churn).
5. **Affiliate program** — when to launch; how generous.
6. **Annual billing aggressiveness** — push annual hard from day 1, or after retention is proven?
7. **Free tier vs. trial only** — free tier risks abuse and cost; trial focuses on conversion. Lean trial-only.

---

# PART II — PRODUCT REQUIREMENTS DOCUMENT (PRD)

---

## 13. Product Vision

A Chrome extension + web dashboard that helps eBay sellers automate the bulk of their inbound buyer-message handling using an LLM. The extension reads the seller's authenticated inbox, the AI drafts contextual replies grounded in listing data and brand voice, and the seller approves replies through a focused dashboard. Routine questions get auto-drafted; complaints and edge cases get flagged for human attention.

---

## 14. Core Features (V1)

### 14.1 Onboarding
- Install Chrome extension from Chrome Web Store
- Extension detects active eBay login
- One-time auth handshake with backend (token issued, tied to seller's eBay user ID)
- Seller picks brand voice (Friendly / Professional / Casual / Custom)
- Seller picks auto-reply categories vs. review-required categories (smart defaults provided)
- **Backfill preview:** extension downloads last 30-90 days of message history → AI categorizes → seller sees "here's what we'd have auto-handled" before flipping live

### 14.2 Message Ingestion (Chrome Extension)
- Background script polls seller's eBay Messages page (every 10-15 min while browser open)
- Or event-based — runs whenever seller visits eBay and has unread messages
- Extracts: message text, buyer username, item ID, timestamp, thread context
- Pulls associated listing details (title, description, condition, shipping policy, return policy)
- POSTs structured JSON to backend over HTTPS
- Local "last seen message ID" stored to prevent reprocessing

### 14.3 AI Categorization & Drafting (Backend, Always-On)
- Backend receives message → runs lightweight **classifier** (embeddings + cosine similarity, NOT Claude — saves tokens) into:
  - Sizing / measurements
  - Shipping timeline / tracking
  - Condition / authenticity
  - Combined shipping / discount request
  - Returns / refunds *(always flagged)*
  - Complaint / dispute *(always flagged)*
  - Generic greeting / "are you a real seller"
  - Offer / negotiation
  - Other / unclear *(flagged)*
- **Auto-draft categories** → Claude generates draft with: message + listing data + seller's brand voice template + relevant past Q&A from memory
- **Flagged categories** → no auto-draft, dashboard shows "needs your attention"
- **Caching:** identical/near-identical question on same listing reuses cached answer

### 14.4 Seller Dashboard (Web App)
- **Inbox view:** all messages, filterable by status / category / urgency / listing
- **Message detail:** original message, buyer history with this seller, listing context, AI draft, edit field, action buttons (Send / Send & remember edit / Skip & flag)
- **Templates page:** edit brand-voice instructions, greeting, sign-off, category overrides
- **Listings KB:** see what listing data the AI is using; allow "behind-the-scenes" private notes per listing (e.g., "fits small, recommend up a size")
- **Analytics:** time saved (estimated), drafts approved/edited/rejected, top categories
- **Settings:** notifications, data retention, billing

### 14.5 Memory & Learning
- **Per-buyer memory:** every conversation stored; future messages from same buyer get prior context
- **Per-seller learning:** seller edits a draft → diff captured → fed forward as few-shot example for future drafts in same category
- **Listing knowledge base:** active listings pulled into structured KB so AI doesn't re-read full HTML each call (token saver)

### 14.6 Send Path

**Reality of eBay's API:** the messaging APIs (`AddMemberMessageRTQ`, `AddMemberMessagesAAQToBidder`) only allow sending in specific contexts (responding to existing inquiries, messaging current bidders) and require the seller's own developer credentials. There is no public API for general third-party messaging on eBay. Every meaningful competitor (AutoDS, Yaballe) either uses the seller's own API credentials or browser automation.

**Our V1 send path:**
- **Default — Extension-mediated send:** seller approves draft in dashboard → backend marks it "ready to send" → next time the seller's Chrome is open with our extension active, the extension picks up approved drafts and simulates the click-to-send action in the seller's eBay session.
- **Notification flow:** when drafts are ready and the extension hasn't picked them up in N hours, send the seller an email notification ("12 messages drafted and waiting"). Optionally: browser push notification when extension is running.
- **Power-user option (V1.5):** seller can supply their own eBay developer API credentials → backend sends via official API. Faster delivery, no extension dependency for the send. Higher onboarding friction.

**Implications of this design:**
- The backend works 24/7 — receiving messages, drafting replies, queueing approvals
- The extension only needs to be running when the seller wants messages actually delivered to eBay
- This is the same pattern AutoDS, Yaballe, and similar tools use — it is the standard approach given eBay's API limits
- Sellers naturally have Chrome open during their work hours; the bot can deliver in batches when they sit down

---

## 15. Out of Scope (V1)

- Outbound promotional messaging to past buyers (eBay policy risk)
- Poshmark, Mercari, or other platforms (V2+)
- Native mobile app (dashboard is mobile-responsive; native is V2+)
- Multi-user / team accounts
- SMS / phone notifications
- Voice replies, image generation, anything beyond text
- Auto-pricing, auto-listing, anything non-message related

---

## 16. User Flows

### 16.1 Install & Onboard
1. Seller installs extension from Chrome Web Store
2. Extension opens onboarding tab → sign up for dashboard
3. Extension detects eBay login → links seller's eBay user ID
4. Seller picks brand voice (3 presets + custom)
5. Seller reviews default category routing, can adjust
6. Extension backfills 30 days of messages → AI shows "here's how we'd have handled these"
7. Seller toggles "go live" → extension begins watching new messages

### 16.2 Daily Active Use
1. Seller gets notification (email or browser push) when drafts are ready
2. Opens dashboard → sees inbox with drafts and flagged items
3. For drafts: skim, approve, send (or quick-edit)
4. For flagged: read, write reply manually, click send
5. Approved sends are queued; extension delivers them when Chrome is open

### 16.3 Edit-as-Training Loop
1. Seller approves a draft but changes "Hi there" to "Hey friend!"
2. Backend captures diff, tags it with category "greeting"
3. Future similar messages use "Hey friend!" automatically
4. After N consistent edits, seller's brand voice template auto-updates (with their consent)

---

## 17. Technical Architecture

```
+--------------------------+
|   eBay (in browser)      |
|   - seller's session     |
|   - messages, listings   |
+-----------+--------------+
            |
            | DOM read / send simulation
            v
+--------------------------+        HTTPS         +--------------------------+
|   Chrome Extension       | -------------------> |   Backend API (24/7)     |
|   - background.js        |                      |   - Node.js + Express    |
|   - content script       | <------------------- |   - Auth, ingestion,     |
|   - popup UI             |       drafts/cmds    |     drafting orchestrator|
+--------------------------+                      +-----+--------+-----------+
                                                        |        |
                                                        v        v
                                              +--------------+  +-------------+
                                              | PostgreSQL   |  | Claude API  |
                                              | - users      |  | (Anthropic) |
                                              | - messages   |  +-------------+
                                              | - listings   |
                                              | - templates  |
                                              | - memory     |
                                              +--------------+
                                                        ^
                                                        |
                                                +--------------------------+
                                                |   Web Dashboard (React)  |
                                                |   - inbox, settings,     |
                                                |     templates, analytics |
                                                +--------------------------+
                                                        ^
                                                        |
                                              +--------------------+
                                              | Notification Layer |
                                              | - email (Resend)   |
                                              | - browser push     |
                                              +--------------------+
```

### Component responsibilities

**Chrome Extension**
- AuthN to backend (token in `chrome.storage`)
- Watch eBay Messages page; extract new messages
- Pull listing details on demand
- Receive approved drafts from backend; simulate send in eBay UI
- Surface badge in popup ("3 messages need attention")

**Backend API (always-on)**
- AuthN/AuthZ (magic link or Google OAuth for dashboard; extension uses server-issued token)
- Ingest endpoint: dedupe + store messages from extension
- Categorization service: classifies messages, decides draft vs. flag
- Drafting service: orchestrates Claude calls with prompt assembly, caching, memory injection
- Send queue: stores approved drafts, serves them to extension when it polls
- Notification service: email when drafts are pending too long
- Analytics events

**Database (PostgreSQL)**
- Source of truth for everything

**Web Dashboard (React)**
- Standard SPA, talks to backend over REST/JSON
- Real-time updates via SSE or polling (V1 = polling every 30s)

**Claude API**
- LLM for drafting only — not for classification (cost)
- Prompts assembled server-side with strict structure

**Notification Layer**
- Email: Resend or Postmark for "drafts waiting" notifications
- Browser push (V1.5): when extension is running, surface OS-level notifications

---

## 18. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Chrome Extension | Manifest V3, vanilla JS or lightweight Preact | Required for new extensions; small bundle |
| Backend | Node.js + Express (or Fastify) | Same language as extension/frontend; mature ecosystem |
| Database | PostgreSQL (Neon or Supabase) | Relational fits; managed PG = trivial ops |
| ORM | Prisma | Strong types, easy migrations |
| Frontend | React + Vite + TailwindCSS | Fast, mobile-responsive easy |
| LLM | Claude API (Anthropic) | Strong instruction-following, brand voice fidelity |
| Classifier | Embeddings + cosine similarity | Cheap routing — don't burn Claude tokens |
| Auth | Clerk or Supabase Auth or magic link via Resend | Don't build custom auth |
| Hosting (backend) | Railway or Render | Cheap, push-to-deploy, no Kubernetes |
| Hosting (dashboard) | Vercel or Cloudflare Pages | Free tier covers MVP |
| Email | Resend or Postmark | Magic-link auth + notifications |
| Analytics | PostHog | Product analytics + feature flags |
| Error tracking | Sentry | Free tier covers MVP |
| Payments | Stripe | Standard SaaS billing |

### Cost-conscious tech decisions
- **No Claude calls for classification.** Embeddings + similarity = ~100x cheaper.
- **Aggressive caching.** Listing data, brand voice, FAQ-style answers hit cache, not LLM.
- **Prompt caching** (Anthropic supports it) for system prompts and listing KB.
- **Tiered model usage.** Cheaper Claude model for routine drafts; flagship for complex categories.
- **Template-first matching.** For ultra-common Q's, match cached answer first; fall through to LLM only if confidence low.
- **Truncate listing descriptions** to structured summary before sending to LLM.
- **Per-user monthly budget caps.** Soft-warn 80%, hard-cap 100%.

---

## 19. Data Model

```
users
  id (uuid, pk)
  email
  ebay_user_id
  brand_voice_template (text)
  default_settings (jsonb)
  plan (free/starter/pro/power)
  trial_ends_at
  created_at

listings
  id (uuid, pk)
  user_id (fk)
  ebay_item_id
  title
  description (text)
  condition
  shipping_policy (jsonb)
  return_policy (jsonb)
  seller_notes (text)        -- private behind-the-scenes notes
  last_synced_at

messages
  id (uuid, pk)
  user_id (fk)
  listing_id (fk, nullable)
  buyer_username
  ebay_message_id (unique)
  thread_id
  body (text)
  direction (incoming/outgoing)
  category (enum)
  status (pending/drafted/approved/sent/flagged/skipped)
  received_at
  sent_at

drafts
  id (uuid, pk)
  message_id (fk)
  draft_text (text)
  model_used
  tokens_used
  generated_at
  approved_at
  edited_text (text, nullable)
  approved (bool)
  delivered_at (timestamp, nullable)

buyer_memory
  id (uuid, pk)
  user_id (fk)
  buyer_username
  history_summary (text)
  last_interaction_at
  total_orders

template_overrides
  id (uuid, pk)
  user_id (fk)
  category (enum)
  template_text (text)
  active (bool)

learned_edits
  id (uuid, pk)
  user_id (fk)
  category
  original_phrase
  preferred_phrase
  observation_count
  promoted_to_template (bool)

notifications
  id (uuid, pk)
  user_id (fk)
  kind (drafts_pending / weekly_summary / etc.)
  sent_at
  delivered_via (email / push)
```

---

## 20. API Specification

### Extension → Backend
- `POST /api/v1/ingest/messages` — bulk insert new messages
- `POST /api/v1/ingest/listings` — sync listing data
- `GET  /api/v1/queue/outgoing` — fetch approved drafts ready to send
- `POST /api/v1/queue/confirm-sent` — mark draft delivered

### Dashboard → Backend
- `GET  /api/v1/messages?status=pending&category=...`
- `POST /api/v1/messages/:id/approve` — approve draft, optionally with edits
- `POST /api/v1/messages/:id/skip` — flag for manual handling
- `GET/PUT /api/v1/templates`
- `GET/PUT /api/v1/listings/:id/notes`
- `GET  /api/v1/analytics/summary`

### Auth
- Magic link → JWT for dashboard
- Extension issues short-lived token bound to user_id, refreshed via dashboard session

---

## 21. eBay Policy & Compliance

### What we believe is fine
- Reading seller's own inbox via their own browser session
- Drafting replies the seller approves before sending — we're a writing aid (Grammarly-style)
- Storing seller message data with consent (clear Privacy Policy)
- Helper extensions for sellers — precedented category on eBay

### What we will NOT do
- Send unsolicited promotional messages to past buyers
- Auto-send without seller approval (V1)
- Read/interact with any account other than the logged-in seller's
- Scrape competitor listings
- Bulk-message anyone

### Open compliance questions to verify pre-launch
1. eBay Acceptable Use Policy on extensions that simulate clicks for sending
2. Rate limits on send-simulation to avoid bot detection
3. Privacy disclosure for processing buyer messages through third-party LLM
4. Consistency with eBay's 2024-2025 AI training privacy policy updates

---

## 22. Token & Cost Optimization

- **Routing via embeddings, not Claude** → ~100x cheaper classification
- **Prompt caching** for system prompts + brand voice + listing KB
- **Tiered models** — cheap model for routine, flagship for complex
- **Template-first matching** — only fall through to LLM if confidence low
- **Truncate descriptions** to structured summary
- **Per-user budget caps** — protect margins
- **Async batching** where latency tolerates

### Rough cost model per active Pro user
- 50 messages/day × 30 days = 1,500 drafts/month
- With caching: ~1-3 cents per draft → $15-45/month gross LLM cost
- Goal: keep under $5/user/month with aggressive optimization
- Pricing leaves $30+ gross margin per Pro user

---

## 23. MVP Roadmap

### Phase 0: Validation (Week 0-1)
- Pull last 90 days of own messages from eBay
- Manually categorize — what % is automatable?
- Run a few hundred through Claude offline to assess draft quality
- **Decision gate:** if quality is good and ≥60% automatable, proceed

### Phase 1: Core extension + ingestion (Week 2-3)
- Build minimal extension reading eBay Messages page DOM
- Build `/api/v1/ingest/messages` endpoint
- PostgreSQL schema for users + messages
- Just store messages — no AI yet
- **Goal:** real messages flowing into DB

### Phase 2: Drafting + dashboard (Week 4-5)
- Add Claude integration with category routing
- Basic dashboard: inbox + draft view + approve button
- Brand voice template editor
- **Goal:** end-to-end loop

### Phase 3: Send path (Week 6)
- Extension click-simulation to send approved drafts
- Confirm-sent loop
- **Goal:** fully closed loop on founder's account

### Phase 4: Memory + learning (Week 7-8)
- Per-buyer memory
- Edit-as-training capture
- Listing KB sync
- **Goal:** drafts noticeably better after a week

### Phase 5: Onboarding + multi-tenant (Week 9-10)
- Auth, sign-up, billing skeleton (Stripe)
- Onboarding flow with backfill preview
- **Goal:** second seller can install + pay

### Phase 6: Beta launch (Week 11-12)
- 5-10 invited beta sellers
- Daily check-ins, fast iteration
- **Goal:** 3+ retained beta users at month-end

---

## 24. Future Roadmap (Post-V1)

- **V1.5:** API send option (power users), more category templates, better analytics, browser push notifications
- **V2:** Poshmark integration (~Month 9-12)
- **V2.5:** Mercari, Depop, Vinted
- **V3:** Native mobile app for on-the-go approvals
- **V3.5:** Team / multi-user accounts
- **V4:** Proactive features — *with extreme policy caution* — e.g., gentle nudges to past interested buyers (only if eBay policy clearly permits)
- **V5:** Voice replies, multi-language

---

## 25. Risks & Mitigations (Detail)

| Risk | Severity | Mitigation |
|---|---|---|
| eBay DOM changes break scraping | High | Modular selectors, monitoring, rapid-patch playbook |
| eBay policy bans helper extensions | Medium | Stay strict "helper not bot"; engage developer community; API send option as fallback |
| LLM gives bad reply, ships to buyer | Medium | Approve-before-send firewall in V1 |
| Seller account flagged for automation | High | Conservative rate limits; randomized timing; no outbound |
| Buyer messages contain PII | Medium | Privacy policy; PII scrubbing; retention limits |
| LLM cost overruns | Medium | Token caps per user, tiered models, caching |
| Low conversion / WTP | High | Validate with 5+ beta sellers before scaling build |
| Founder burnout | High | Phased roadmap; honor weekly limits; don't skip Phase 0 |
| Competitor (AutoDS) adds AI Q&A | Medium | Speed; focus moat; cross-platform expansion path |
| eBay launches own AI feature | Medium | Cross-platform expansion; brand-voice + memory moat |

---

## 26. Notes for the Build / Coding Agent

When handing this to a coding agent (Claude Code, Cursor, etc.):

- **Start with Phase 0 and Phase 1 only.** Don't scaffold the whole thing at once. Validate first.
- **Chrome extension is the highest-risk technical piece.** DOM scraping eBay is fiddly. Build it as a standalone PoC before touching the backend.
- **Backend scaffold:** Express + Prisma + a single `/ingest/messages` endpoint and one Postgres table. Make data flow end-to-end before adding LLM.
- **LLM integration:** write the prompt-builder as a pure function — `(message, listing, brand_voice, buyer_history) → prompt string`. Test it in isolation with eval cases before wiring to API.
- **Keep secrets out of the extension.** All API keys live on backend. Extension carries only user-scoped token.
- **Manifest V3 only.** Service workers, no background pages.
- **Don't over-engineer V1.** No microservices. No Kubernetes. Single backend service, single database, single SPA.
- **Eval harness early.** Build a simple eval set of ~50 real messages with expected categories and ideal drafts. Run it on every prompt change.
- **Telemetry early.** Track every draft generation, every approval, every edit. This is the data that powers the learning loop and the analytics.

---

## 27. Appendix: Quick Reference

### Brand promise
*Save 30 minutes a day on eBay messages. AI drafts, you approve.*

### Elevator pitch (30 seconds)
> "If you sell on eBay, you spend an hour a day answering the same buyer questions over and over — sizing, shipping, condition. Our Chrome extension reads your inbox, AI drafts personalized replies in your voice using your listing details, and you approve them with one click. It's like having a customer service assistant that knows your store inside out, for less than the price of one hour of your time per month."

### Why now
- LLM costs finally low enough for per-message AI economics
- Manifest V3 mature enough to handle this reliably
- Reseller economy growing
- AI tooling acceptance high — sellers ready for this

### Why us
- Founder is the customer (active eBay seller with the exact pain)
- Focused single-problem product (vs. AutoDS doing 20 things, none of them this)
- Lean stack, fast iteration
- Clear cross-platform expansion path

---

*End of Business Plan & PRD v1.0.*

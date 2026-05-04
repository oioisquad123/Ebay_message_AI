# eBay AI Message Assistant — Business Plan & PRD v2.0

**Version:** 2.0 (revised after 10-agent review of v1.0)
**Date:** May 3, 2026
**Founder:** Bayu
**Status:** Pre-build / Validation phase
**Supersedes:** `BusinessPlan_and_PRD_eBay_AI_Message_Assistant.md` (v1.0)

---

## 0. What Changed From v1.0 (read first)

v1.0 was directionally correct and well-written but optimistic in five places that would have hurt the build:

1. **Send path** — v1's "extension click-simulates send" is the single highest existential technical and legal risk; click-simulation send is plausibly an eBay TOS violation, not "the same pattern AutoDS uses." v2 demotes click-simulation to a closed-beta-only fallback and makes **eBay Compatible Application + OAuth + official Sell API the V1 send path**. Prepare-and-paste fallback is the never-fail backup.
2. **MV3 lifecycle** — v1 implies an "always-on background watcher." MV3 service workers terminate aggressively. v2 redesigns ingestion as content-script + MutationObserver driven, with `chrome.alarms` only as a wake hint, and adds an `offscreen` document for any DOM-parsing work the SW can't do.
3. **Cost math** — v1's "1-3¢/draft → $2-4 LLM cost/user" assumes 90%+ cache hit and Haiku-everything. Realistic blended is **$4-12/user/mo**. Pricing moves from $19/39/79 to **$24/49/99** to preserve margin and signal value.
4. **Timeline** — 12 weeks to closed beta is fiction for solo + part-time + active eBay seller. v2 plans **16-18 weeks** with explicit decision gates and ruthless V1 scope cuts (auto-promotion of learned phrases, full backfill preview, custom brand voice → all V1.5).
5. **Niche-down** — v1 targets "all volume eBay sellers." v2 launches into **vintage/used clothing** first: highest message/listing ratio (sizing), tightest community for word-of-mouth, cleanest cross-platform path (Poshmark, Depop, Vinted).

Plus: hardened security (prompt injection, RLS multi-tenancy from D1, ZDR with Anthropic), buyer-side privacy/transparency baked in (GDPR/UK GDPR DPA, EU AI Act Art. 50 disclosure), proper data model (pgvector, pg-boss, llm_calls audit, idempotency keys), and a real eval harness.

---

# PART I — BUSINESS PLAN

---

## 1. Executive Summary

### Product
A Chrome extension + web dashboard + mobile-PWA companion that helps high-volume eBay sellers — **starting with vintage/used clothing sellers** — handle inbound buyer messages using AI. The extension reads the seller's own eBay inbox, the AI drafts contextual replies grounded in listing data and brand voice, the seller approves on desktop or via mobile/email link, and approved replies are sent through eBay's **official Sell API** under our certified Compatible Application keyset (with prepare-and-paste fallback).

### Problem
High-volume eBay sellers spend 30-90 min/day answering repetitive buyer questions whose answers already live in their listings. Slow replies cost sales. Time tax scales with inventory and creates a hard ceiling on seller growth. In vintage/used clothing specifically, **sizing questions alone are ~40% of inbound** and are the single most automatable category.

### Wedge (one sentence)
*The only AI message assistant for eBay vintage clothing sellers that drafts personalized, listing-aware replies in the seller's own voice — with one-click approval, brand-voice memory, and a prepare-and-paste fallback that never gets your account flagged.*

### Model
SaaS subscription, **$24-99/mo**, 14-day free trial (no card). Cost-conscious LLM architecture (tiered Haiku/Sonnet routing + Anthropic prompt caching + answer cache). Distribution through Chrome Web Store, founder YouTube ("Reseller's AI Workshop"), reseller community presence (90-day no-link Reddit rule), and influencer partnerships.

### Why This Works
- Underserved category — no direct AI-Q&A competitor focused on vintage clothing on eBay
- Single, focused problem with measurable ROI (time saved → more selling time)
- Lean tech stack buildable solo with AI-assisted coding in 16-18 weeks
- Validated pain (founder is an active eBay vintage seller)
- Clear V2 expansion path (Poshmark, Depop, Vinted — all clothing-native cross-listing destinations)
- The data flywheel (drafts × edits × approvals × outcomes) is a real moat once instrumented

### Conservative Targets
- **Y1 ARR exit:** $50-90K (lower than v1's $96K — accounts for niche-down and 18-wk timeline)
- **Y2 ARR exit:** $600K-1.0M (lower than v1's $1.1M — solo throughput is the constraint)
- **3-yr SOM:** 2,500-4,000 paying users / $1.0-1.6M ARR (replaces v1's optimistic 10K stretch)

---

## 2. Vision & Mission

**Vision:** Make running a high-volume marketplace business as effortless as running a small one. Sellers should focus on sourcing and growth, not on retyping answers all day.

**Mission (V1):** Save eBay vintage clothing sellers 30+ minutes a day by drafting smart, on-brand replies to inbound buyer questions — through eBay-sanctioned APIs, with default privacy protections, and without ever auto-sending without seller approval.

**Long-term (3-5 years):** Become the default AI customer service layer for resale clothing marketplaces — eBay, Poshmark, Depop, Vinted, Mercari — with one dashboard and one brand voice across all of them.

---

## 3. The Problem (Detailed)

### Customer pain points (validated, vintage clothing seller lens)
1. **Repetition fatigue:** sizing questions, condition/flaw questions, shipping windows — same 5-10 questions, all day
2. **Listing redundancy:** ~70% of incoming questions have answers already in the listing description
3. **Sizing complexity:** vintage sizing differs from modern sizing; sellers re-explain "this is a true vintage Medium ≈ modern Small" five times a day
4. **Response speed pressure:** buyers ping multiple sellers; first responder often wins
5. **Inconsistency under fatigue:** tired sellers reply curtly or skip messages — feedback hit
6. **Vacation problem:** can't take a real day off without buildup
7. **Scale ceiling:** ~500+ active listings → message handling becomes a part-time job

### Quantified pain (founder benchmarks)
- 30-90 min/day on messages for 200-500 vintage listings
- ~3-5 minutes per message manually (read → check listing → reply)
- For a $5K/mo profit seller: ~$15-25/hour of unpaid CS work
- Tool that saves 1 hour/day = ~$450-750/mo of recovered time at minimum

### Why not yet solved
- AutoDS / Yaballe focus on post-sale because it's templated — easier
- Inbound Q&A needs NLU + listing context + brand voice — only economical with LLMs in last 18-24 months
- eBay's Smart Reply is generic; not seller-trained, not listing-aware
- DIY ChatGPT works but has zero integration (no listing sync, no send, no memory)

---

## 4. Market Analysis

### Market sizing — corrected
| Tier | Count | Notes |
|---|---|---|
| All eBay sellers globally | ~19M | eBay-published, slow-moving |
| Active sellers with regular sales | ~2-3M | Third-party estimate, treat as estimate |
| High-volume sellers (250+ listings) | **300-700K** | Tighter than v1's 500K-1M |
| US/UK/AU/CA English high-volume | **150-300K** | Our SAM denominator |
| **Vintage/used clothing subset (V1 ICP)** | **30-60K** | Eyeballed from eBay clothing category share + reseller community signal |

### Revised TAM/SAM/SOM
- **SAM (broad, full eBay volume sellers in EN-4):** ~$55-110M/yr at $30 ARPU
- **SAM (V1 niche, vintage clothing):** ~$15-25M/yr at $30 ARPU
- **SOM (3-yr realistic, niche-first then expand):** 2,500-4,000 paying / $1.0-1.6M ARR

### Trends — favorable
- LLM costs continuing to drop, prompt caching widely available
- Solo entrepreneur boom; more side-hustle volume sellers
- AI tooling acceptance high; "AI sounds robotic" objection fading
- eBay continues to allow seller-tooling Chrome extensions (precedent: Seller Protect, ZIK Booster — though these are read-only)
- Cross-listing economy (Poshmark/Depop/Vinted) growing — clear V2 path

### Trends — risks
- eBay DOM/UI changes break scraping (mitigation: hot-patchable selectors, server-served)
- **eBay launches a much better Smart Reply** (mitigation: cross-platform expansion, niche-down, become the "controller layer" not the brain)
- LLM commoditization (mitigation: moat is per-seller learning loop + community trust, not the LLM)
- **Cross-listing aggregators (Vendoo, List Perfectly) add AI Q&A** (mitigation: explore partnership before AutoDS does)

---

## 5. Competitive Landscape

### Competitor scorecard v2 (today vs. 12-month threat)

| Competitor | Inbound AI Q&A today | 12-mo threat | Notes |
|---|---|---|---|
| AutoDS | None | **High** — has AI in adjacent areas; will ship Q&A drafter in 6-9 mo if prioritized | Their constraint is roadmap, not capability |
| Yaballe | None | Medium — slower follower; 9-12 mo behind AutoDS | |
| ChannelReply | Routing-only | Medium — passive benefit if Gorgias adds AI macros | Watch for ChannelReply + Gorgias stack |
| eBay Smart Reply | Generic templated | **High** — 40-60% chance of materially better version in 12 mo | Single biggest existential risk |
| Generic GenAI (ChatGPT custom GPTs) | Real today, DIY stack | Underrated — 60% of value for $20/mo | Defense: integration tax (no copy-paste, listing sync, memory, send) |
| Vendoo / List Perfectly (cross-listing) | None | **High if they add AI replies** — they already have multi-platform integration | Explore partnership early |
| VAs ($3-8/hr Philippines/India) | Real today | Stable | Position as "VA copilot," not killer |

### Our wedge — niche-down version
**The only AI message assistant for eBay vintage clothing sellers that drafts personalized, listing-aware replies in the seller's own voice — with eBay-sanctioned send path and default privacy.**

### Defensive moats (scored 1-5 over 24 mo durability)
- Founder community trust + content presence — **4** (double down)
- Data flywheel (drafts × edits × outcomes) — **4** (instrument from D1)
- Brand voice + memory data per seller — **3** (real switching cost only if export-hard + measurably-better-month-over-month)
- Cross-platform breadth — **2** (treadmill, not moat — each platform is a near-rebuild)
- Speed to market — **2** (evaporates day a competitor ships)
- Distribution moat (CWS, SEO) — **2** (contestable)
- Network effects — **1** today, **could be 4** with shared scam-buyer DB or anonymized cross-seller FAQ patterns (V1.5+ design)

### eBay-launches-AI contingency
1. Reposition as the **controller layer** — bulk approve, brand voice override, per-buyer memory, analytics — even if eBay drafts the reply
2. Accelerate Poshmark to Month 6 (from M9-12) the day eBay-only value collapses
3. Niche pivot harder — vintage/used clothing's sizing nuance is what eBay's median-seller-optimized model will serve worst

---

## 6. Business Model (revised pricing)

### Pricing v2

| Tier | Price | Gate (axis = listings + accounts, not raw messages) | Soft draft cap | Target |
|---|---|---|---|---|
| **Trial** | 14 days, no card | 1 account, ≤300 listings, full features | 100 drafts | Acquisition |
| **Solo** | $24/mo or $230/yr (~20% off) | 1 account, ≤300 active listings | 1.5K/mo | Sub-300-listing seller |
| **Pro** | $49/mo or $470/yr | 1 account, unlimited listings, memory + learning, priority queue | 4K/mo | Primary ICP |
| **Power** | $99/mo or $950/yr | 3 accounts, API send, weekly digest, founder Slack | 10K/mo | Multi-store ops |
| **Overage** | +$0.02/draft above soft cap | — | — | Volume spike protection |

Why these moved:
- $49 Pro sits under AutoDS Advanced ($69.90) and ChannelReply ($59-129) but signals "real tool" — $39 anchored too close to AutoDS Import ($19.90)
- $24 Solo preserves the $19 anchor zone but adds margin
- $99 Power because real multi-store operators are a distinct segment (consignment, family shops, US+UK)
- Annual at **20%** (not 17%) — matches B2B SaaS norm, pulls cash forward
- Hybrid usage component (overage) handles 10x volume variance

### Unit economics — corrected math (per Pro at $49)

LLM cost band (1,500 drafts/mo, blended Sonnet/Haiku, prompt caching enabled):

| Cache hit rate | Per-draft | Monthly LLM |
|---|---|---|
| 0% (cold, first month) | ~$0.025 | $37.50 |
| 50% (typical month 1-2) | ~$0.013 | $19.50 |
| 80% (mature, month 3+) | ~$0.006 | $9.00 |

**Realistic blended LLM COGS at maturity: $8-12/user/mo**, not $2-4.

| Line | Cost | Notes |
|---|---|---|
| LLM | $9-12 | Blended, mature cohort |
| Hosting | $1.50 at 100 users; $4-8 at 25 users | Scales down with growth |
| Auth/email/analytics | $0.30 | Resend/Clerk/PostHog free tiers |
| Stripe + tax | $1.43 + 0.5% Stripe Tax + 1.5% chargeback reserve = ~$2.20 | Higher than v1's $1.50 |
| **Blended COGS at 100 users** | **~$13-16** | |
| **Gross margin at $49 Pro** | **$33-36 = 67-73%** | Healthy, not 85% |

Margin crosses 80% only past ~500 users with cache mature. Below 75 users, margin is closer to 50%. Plan cash accordingly.

### CAC reality check
At 6% blended monthly churn, ARPU ~$40, 70% gross margin → LTV ≈ $467. LTV/CAC 5:1 → **supportable CAC = $93**, not v1's $30. v2 plans for $30 in months 1-9 (organic) and $80-120 in months 10+ (when paid kicks in).

### Churn target: 7% → 4%
Levers:
1. Mandatory backfill preview during trial (sellers who see "I'd have handled 142/200" convert + retain better)
2. Weekly "time saved" email on Mondays (single biggest churn-killer in productivity SaaS)
3. **Pause subscription** ($5/mo) — vintage sellers go on Q1 vacation; pause beats churn 3:1
4. Annual upgrade prompt at month 6 with proven value
5. Multi-account lock-in for Power tier (3 stores' history)
6. Per-seller memory + visible "AI got better this week" surfaced in dashboard

---

## 7. Go-To-Market Strategy

### Phase 1: Founder validation (Weeks 0-2)
Identical to v1 but with explicit kill switch (see §11 Phase 0 GATE A).

### Phase 2: Closed beta (Weeks 13-18)

**N = 8-12** (not 5-10). With 5, one ghost + one quiet user kills signal.

Hard qualification gate:
- ≥150 active eBay listings, ≥10 inbound msgs/day
- US/UK/AU/CA, English, 12+ months selling tenure
- Chrome primary, willing to install nightly builds
- Commits to one 30-min weekly call + Loom feedback within 48h
- Signs Beta Agreement: testimonial + case-study rights for 6 months free post-launch + grandfathered 50%-off Pro forever

Sourcing: founder's network (3-4), warm referrals (3-4), targeted DMs to r/Flipping power posters + eBay TRP-1000+ sellers in vintage clothing (2-3).

Feedback rituals:
- Mon: weekly release notes + 3 specific questions
- Wed: 30-min 1:1 (rotating, 2/wk)
- Fri: async Loom prompt
- Public Notion/Linear board for bug/idea triage
- One private Slack/Discord channel

Exit-to-public criteria (all required):
1. ≥6 of 8-12 actively used weekly for 4 consecutive weeks
2. Median draft-approval rate ≥60% (edited or sent unchanged)
3. ≥3 unsolicited "I'd pay for this" statements
4. ≥2 video testimonials filmed
5. <1 critical bug per beta-week for 3 consecutive weeks
6. Onboarding completable by stranger in <10 min (test with a non-beta seller)

### Phase 3: Public launch (Month 5-7)

Day-by-day launch week:
- D-7: Newsletter pre-announce. Email influencer partners with embargo + assets
- D-3: Submit final CWS listing (review takes 1-3 days)
- Mon: YouTube hero video 6am PT. Newsletter blast 9am PT. LinkedIn + X founder posts. DM betas for CWS reviews + RTs. IndieHackers post
- Tue: r/Flipping AMA (mod-pre-approved). "I built this for my own store" thread
- Wed: Influencer videos drop coordinated. Founder on 1 reseller podcast (booked 60d prior)
- Thu: Show-HN + X retro thread "16 weeks, 12 betas, here's what I learned"
- Fri: Transparent first-week metrics post. Drives second wave
- Sat-Sun: Reply to everything; personally onboard top 10 signups via 15-min calls
- Skip Product Hunt this week — schedule for Week 4-6 post-launch

### Phase 4: Scale (Month 8-12)
- Add Poshmark V2 (clothing-native; same ICP)
- Affiliate program (15-25% commission, 12-month referral window)
- Paid ads testing (Google, Reddit, YouTube pre-roll)
- Consider AppSumo only if MRR has plateaued at month 12+ (NOT at launch)

### Channels (top 5, first 90 days, $0 paid)

1. **Founder YouTube — "Reseller's AI Workshop"** — face + screencast hybrid, 1 long video/wk + 2 Shorts. First 12 topics: "I tested every eBay messaging tool," "Reading 1,000 buyer messages — the patterns," "Why eBay's Smart Reply isn't enough," live Q&A handling demos. Differentiator: tool-builder POV — be the eBay Pieter Levels. Expected: 30-80 trials/mo by M3.

2. **Reddit (r/Flipping, r/eBay, r/Ebayreselling)** — 90-day "no-link" rule: pure helpful comments first. AMA at month 3 (mod-approved DM in advance). One data piece without CTA: "I categorized 5,000 buyer messages — top 10 question types." Expected: 20-50 trials/mo.

3. **Chrome Web Store organic** — keywords front-loaded: *eBay messages*, *eBay reply*, *eBay AI*, *eBay seller assistant*, *eBay inbox*, *vintage seller AI*. 5 screenshots in order: before/after time-saved, draft preview w/ approve, brand-voice picker, analytics, pricing. 30-sec silent demo GIF. Seed first 10 reviews from beta cohort. Expected: 15-40 installs/mo growing.

4. **Cold DM to volume sellers (NEW)** — 10/day, hand-personalized, mentioning a specific listing. Source: eBay store-search filtered TRP+1000+ feedback in Vintage Clothing; r/Flipping flair posters; YouTube reseller comments; Posh-pro Discords. Expected: 6-12 trials/mo.

5. **Influencer partnerships (free Pro for life + 25% lifetime affiliate)** — target list (priority): Daily Refinement, Commerce Crowd, Reezy Resells, Justin Resells, Hairy Tornado, Lindey Glenn, Tech Reseller, The Auction Professor, BeckerTime, Flipping Junkie. Tier-2 TikTok: @reselleraj, @resellingwithryan. Pitch: 60-day exclusive code + integrated 90-sec demo. Expected: 1-2 yes from 10 in 90 days = 50-200 trials per video.

### Owned channel from D1: email newsletter
**"Reseller's AI Weekly"** — 5 sections, 4-min read, Tuesday 8am: this week's question pattern, one prompt tip, one tool update, one buyer-psychology insight, one community shoutout. By month 6: ~1,500 subs at 35% open. Highest-converting channel you own. **Skip Discord until month 6+** — synchronous tax with no community manager.

### Comparison content (60 days post-launch)
1. "[Tool] vs AutoDS for eBay messages"
2. "[Tool] vs ChannelReply"
3. "[Tool] vs eBay Smart Reply"
4. "Best eBay messaging tools 2026 (honest comparison)"

These rank fast (low competition, high commercial intent), convert at 8-15%, reuse the §5 table.

### Beta-to-paid handoff design
Grandfather all 12 betas at **50% off Pro forever + 6 months free**. Don't give it away forever — creates two-tier resentment when they're your loudest advocates. Lock the discount to original Stripe customer ID. Document in onboarding emails. Never discuss publicly.

### Brand promise (sharper)
> "If you've got 200+ eBay listings, you know the drill: 'Will this fit?' 'When does it ship?' 'Is this authentic?' — 50 times a day, same answers, already in your listing. I'm an eBay seller too. I built a Chrome extension that drafts every reply in your voice using your listing details. You hit approve. It saved me an hour a day. $49/month, 14-day free trial, no credit card. If it doesn't save you 30 minutes a day in week one, I'll refund you and apologize."

---

## 8. Financial Projections (revised, conservative)

### Year 1 (16-18 wk build, public launch M5-6)

| Quarter | Users (paying) | MRR | Notes |
|---|---|---|---|
| Q1 | 0 | $0 | Build + Phase 0 + early build |
| Q2 | 0-5 | ~$0-200 | Closed beta (free / 50% post-launch) |
| Q3 | 30-50 | ~$1.2-2K | Public launch ramp |
| Q4 | 100-150 | ~$4-6K | Content compounding |

**Y1 ARR exit:** ~$50-90K (vs v1's $96K)
**Y1 cumulative revenue:** ~$15-30K
**Y1 costs:** ~$8-15K
**Y1 net (founder pre-tax):** ~$5-20K side income

### Year 2 (with Poshmark V2)

| Quarter | Users (paying) | MRR |
|---|---|---|
| Q1 | 300-500 | ~$13-22K |
| Q2 | 600-900 | ~$26-39K |
| Q3 | 1,000-1,400 | ~$43-60K |
| Q4 | 1,400-2,000 | ~$60-86K |

**Y2 ARR exit:** ~$700K-$1.0M (vs v1's $1.1M)
**Y2 total revenue:** ~$300-500K
**Y2 costs:** ~$120K (hosting scales, possible part-time hire, ads)
**Y2 net:** ~$180-380K

v1's 250→2,800 (11x) Y2 was fantasy for solo + V2 launch. v2 plans 4-6x and brings on a part-time CS/community hire by M9 if MRR > $15K.

### Cost structure (initial monthly)
- Hosting (Railway/Render + Neon Postgres): $50-200
- Domain, email, misc: $30
- LLM API: $0 → scales with users (plan $10-15/Pro user, mature)
- Legal docs initial spend (lawyer-reviewed PP+ToS+DPA): $300-2,000 one-time
- Business entity (LLC + EIN): $100-500 one-time
- No payroll (solo founder)
- Total Y1 fixed: ~$100-300/mo

### Hiring triggers
- ~$15K MRR consistently → first hire CS/community part-time
- ~$40K MRR → second engineer for V2 platform expansion

---

## 9. Team & Operations

Identical to v1 — solo founder, AI-assisted dev, async-first, customer support direct during beta and early launch, ticketing tool (Plain/HelpScout) at ~250 users.

Founder's superpower: active eBay vintage clothing seller — product instinct + community credibility + dogfood data flywheel.

Founder gaps: marketing/content scaling, CS scaling, frontend polish (V1 will be functional, not beautiful — fine).

---

## 10. Risks & Mitigations (consolidated)

| Risk | Severity | Mitigation |
|---|---|---|
| eBay deems click-simulation TOS-violating; mass-suspends customers; class-action liability | **Critical** | **Make Compatible Application + OAuth + official Sell API the V1 default**. Click-simulation is closed-beta-only with rate limits + randomized timing + opt-in disclosure. Prepare-and-paste fallback for everyone. |
| GDPR/UK GDPR enforcement over un-consented buyer data flowing to US LLM | **Critical** | Default-on PII scrubbing (regex pre-pass). Anthropic ZDR agreement before EU sellers. EU region pin. Signed DPA. Buyer disclosure clause in seller signup. Explicit retention defaults. |
| Chrome Web Store removal | **Critical** | Over-disclose in store privacy disclosures. Minimize permissions (`https://*.ebay.com/*` only). Have a non-Chrome fallback (Edge add-on, Firefox V2). Server-side OAuth path so extension isn't the only send mechanism. Hardware 2FA on dedicated CWS publisher account. |
| eBay DOM changes break extension | High | Modular selectors stored in server-fetched config; hot-patch in <4h without CWS resubmission. Monitoring + alerting on selector failure rates. |
| eBay launches better Smart Reply | Medium-High | Cross-platform expansion accelerated; controller-layer reposition; vintage niche-down |
| LLM gives bad reply that ships | Medium | Approve-before-send firewall; structured-output `used_facts` validator; output filter for forbidden phrases (off-platform contact, "free shipping," refund admissions) |
| Prompt injection from buyer messages | Medium-High | Delimited untrusted-content tags; system prompt explicit data-vs-instructions rule; output-time policy check; force-flag any draft mentioning money/refunds/off-platform |
| LLM cost spikes | Medium | Tiered models (Haiku-first, Sonnet for nuance); aggressive caching; per-user budget caps (soft 80%, hard 100%); answer cache w/ 0.93 cosine threshold |
| Buyer messages contain PII | Medium | Default-on PII scrubbing; column-level encryption on `messages.body`, `drafts.draft_text`; 30/90/purge retention |
| Seller account flagged for automation | High | Conservative rate limits (≥1 send/2-3s w/ jitter); randomized timing; never run on accounts under eBay review; certified-API send before paid GA |
| Founder burnout | High | Conservative phased roadmap; honor weekly limits; explicit buffer weeks 17-18; freeze-mode rule (any 7-day stretch <10h → support-only) |
| Low conversion / WTP | High | Validate WTP with 8-12 betas via Van Westendorp PSM at $19/29/39/49/69 |
| Cross-listing aggregator (Vendoo, List Perfectly) adds AI Q&A first | Medium-High | Explore partnership before AutoDS ships AI Q&A |
| Tenant isolation regression leaks Seller A data to Seller B | Critical | Postgres RLS from D1 + Prisma middleware tenant-scope helper + integration test that fails CI if any list endpoint returns cross-tenant rows |
| Chrome Web Store publisher account compromise | Critical | Dedicated Google account, hardware 2FA, recovery codes offline, signed releases, documented "rollback to last known good" |
| Extension token leak | High | Short-lived (24h) RS256 JWTs bound to (user_id, install_id), refresh via dashboard cookie, `/extension/revoke` on password change/plan cancel/log-out-everywhere |

---

## 11. Key Milestones (revised, 16-18 weeks)

| Milestone | Target Week | Success Criteria |
|---|---|---|
| Phase 0 GATE A: validation complete | Week 1 | ≥60% of founder's 300+ labeled messages automatable AND ≥70% offline drafts score ≥4/5; if <50%, **kill** |
| Architectural spikes done | Week 2 | MV3 PoC reading messages page + Postgres skeleton + prompt-builder eval harness all "hello world" |
| Real ingestion stable | Week 3 | 100 real messages ingested, 0 dupes, idempotency working |
| Drafting + classifier + eval ≥75% | Week 4 | Eval harness ≥75% on hand-labeled set |
| Founder dashboard usable | Week 5 | Founder using own dashboard daily, single-tenant |
| Send-path PoC | Week 6 | **Decision gate**: click-simulation flake <5% over 50 sends, no eBay account warnings — OR pivot to prepare-and-paste-only V1 |
| Closed loop on founder | Week 7 | 7 consecutive days dogfooding without manual fallback |
| Multi-tenant retrofit + memory + learning | Week 8-9 | Two test accounts isolated end-to-end via RLS; learned-edits captured |
| Auth + Stripe test mode | Week 10 | Friend installs from unlisted CWS, completes $1 test charge |
| Onboarding polish + observability + legal | Week 11 | PP/ToS/DPA published; Sentry + PostHog wired; onboarding completable in <10 min by stranger |
| **CWS submission** | Week 12 | Submitted; assume 7-14d review |
| Per-buyer memory + edit-as-training (capture only, no auto-promotion) | Week 13 | Drafts measurably improving on founder account |
| **CWS approval** + first 3 betas onboarded | Week 14 | 3 sellers ingesting messages |
| Beta iteration | Weeks 15-16 | Daily triage, hotfixes, quotes captured |
| Beta expand to 8-12 | Weeks 17-18 | ≥3 retained, ≥1 willing to pay |
| Public launch | Month 5-6 | First 25 paying users in launch month |
| 100 paying users | Month 7-9 | $4-6K MRR |
| Poshmark V2 | Month 12-15 | First cross-platform user |

Definition of Done for V1 (must all be true):
- 3 non-founder sellers used it 14 consecutive days, ≥50 real drafts each
- ≥70% drafts approved with edits ≤20% character change
- Zero double-sends, zero cross-tenant leaks, zero eBay account warnings
- Stranger completes onboarding without founder assistance
- Stripe live-mode subscription created, charged, renewed once on a real card
- Eval harness ≥80% on a 200-message held-out set
- p95 draft latency <8s; backend uptime ≥99% trailing 30d
- PP + ToS + DPA published; CWS listing live and approved
- Founder hasn't touched the codebase for 7 consecutive days, nothing broke

---

## 12. Strategic Decisions / Open Questions

1. **Send path V1** — Decision: **eBay Compatible Application + OAuth + official Sell API as V1 default**, click-simulation closed-beta-only with disclosure, prepare-and-paste as never-fail fallback. Apply to eBay Compatible App program in Week 1.
2. **Pricing** — Decision: $24/49/99 with 20% annual; validate with PSM in beta.
3. **Brand name** — TBD. Criteria: ≤8 letters, .com or .ai available, CWS slug + Twitter handle available, no eBay/PayPal TM hit in USPTO TESS, pronounceable in voice search, no "ebay/bay/auction" in name.
4. **LLM vendor** — Anthropic Claude default; ZDR agreement target before EU launch; consider OpenAI as fallback redundancy V1.5.
5. **Niche-down** — Decision: vintage/used clothing first; expand to broader vertical at Month 9+.
6. **Paid ads timing** — Wait until ~50+ paying with stable churn; budget for $80-120 CAC, not $30.
7. **Affiliate program** — Launch at month 6 once 100+ paying users exist as social proof.
8. **Annual billing aggressiveness** — Push from D1 with 20% off + month-6 upgrade prompt.
9. **Free tier vs trial-only** — Decision: trial-only, 14d, no card, with mandatory backfill preview to convert.
10. **Mobile** — Decision: dashboard mobile-responsive at V1, **PWA with web push + approve-from-notification at V1.5** (not V2+); email-with-approve-button is V1 fallback.
11. **AppSumo lifetime deal** — Decision: NO at launch; reconsider only if MRR plateau at month 12+.
12. **eBay Developer Program registration** — Week 1, regardless of V1.5 timing.
13. **Business entity** — LLC + EIN before Stripe live mode (Week 10).
14. **Anthropic ZDR agreement** — File request Week 1; mandatory before EU sellers in beta.

---

# PART II — PRODUCT REQUIREMENTS DOCUMENT (PRD)

---

## 13. Product Vision

A Chrome extension + web dashboard + mobile-PWA companion that helps eBay vintage clothing sellers automate the bulk of inbound buyer-message handling using an LLM. The extension reads the seller's authenticated inbox, the AI drafts contextual replies grounded in listing data and brand voice, the seller approves replies through a focused dashboard or mobile/email link. Routine questions get auto-drafted; refunds/disputes get flagged for human attention. Sends are dispatched through eBay's official Sell API under our certified Compatible Application keyset.

---

## 14. Core Features (V1)

### 14.1 Onboarding (revised 7-step)

1. **Install + sign in (≤30 sec).** Magic-link via email already on the eBay account. Microcopy: *"We never see your eBay password — we work inside your own browser session."*
2. **Pick brand voice with live samples (60 sec).** Show three real anonymized buyer questions with side-by-side draft samples for Friendly / Professional / Casual *before* committing. Decision: pick or skip ("Decide later from a real message").
3. **Listing context bootstrap (silent, in background).** Pull top 50 listings while seller continues. No blocking spinner.
4. **Backfill preview, narrated (~90-180 sec for last 200 msgs / 7 days, capped at 4 min).** Show progress: *"Reading 213 messages… categorizing… drafting 148 of them now."* Real-time counter of "would-have-handled" messages climbing. Don't show drafts until ≥30 ready.
5. **The reveal — confidence dashboard.** Three numbers up top: *148/213 auto-drafted (69%) • 28 flagged for you • 37 too old to need reply*. Then a swipeable carousel of the 10 best drafts with confidence badges (High/Medium/Review-needed). Microcopy: *"Tap any draft to see what you'd have edited."*
6. **Recovery path when preview underwhelms.** If <50% auto-drafted or seller rejects 3+ samples → inline "Tune my voice" wizard: paste 2-3 favorite past replies, re-draft 5 messages on the spot.
7. **Soft go-live, not hard.** Default first 7 days to **"Review-only mode"** — AI drafts, seller approves, banner reads *"Training week — I'm watching how you edit me."* On Day 8: *"You've approved 84% of drafts unedited. Ready to enable batch approve?"*

(Full backfill preview of 30-90 days deferred to V1.5; "last 200 / 7 days" is V1's onboarding scope.)

### 14.2 Message Ingestion (Chrome Extension, MV3-correct)

- **Content script** auto-injects on `https://www.ebay.com/mesg/*` and `https://mesg.ebay.com/*`; uses `MutationObserver` on the message list
- **Service worker** uses `chrome.alarms` (1-5 min interval, never <30s) to wake and ingest only when a Messages tab is detected open via `chrome.tabs.query`
- **MAIN-world bridge script** via `chrome.scripting.executeScript({world:"MAIN"})` for any access to React-state or page-context handlers
- **Offscreen document** for any DOMParser/`fetch` work the SW can't perform
- Extracts: message text, buyer username, item ID, timestamp, thread context
- Pulls associated listing details (title, structured description, condition, shipping policy, return policy)
- POSTs structured JSON envelope (versioned, Zod-typed) to backend over HTTPS with `Idempotency-Key` header
- Local "last seen message ID" stored in `chrome.storage.local` to prevent reprocessing
- Selector configuration fetched from backend (`GET /api/v1/extension/selectors?version=N`) — hot-patchable without CWS resubmission
- Extension is Chromium-only V1 (Chrome, Edge, Brave, Arc); Firefox V2; Safari out

### 14.3 AI Categorization & Drafting (Backend, Always-On)

Embedding-based classifier into 9 categories (with multi-label support):
- Sizing / measurements
- Shipping timeline / tracking
- Condition / authenticity
- Combined shipping / discount request
- Returns / refunds *(always flagged)*
- Complaint / dispute *(always flagged)*
- Generic greeting / "are you a real seller"
- Offer / negotiation
- Other / unclear *(flagged if confidence <0.72)*

**Multi-label:** return top-2 categories with scores; if margin between top-1 and top-2 < 0.08, route the draft prompt with both category templates merged AND tag for review.

**Confidence floor:** cosine <0.72 → "unclear" → flag.

**Drift control:** monthly re-embedding of prototype set from latest 200 messages per category. Bootstrap from founder's hand-labeled 300+ messages + Claude-synthesized 1-2K examples per category.

**Tiered model routing:**

| Category | Model | Why |
|---|---|---|
| Generic greeting / "are you real" | Haiku 4.x | Templated, low-variance |
| Sizing / measurements | Haiku 4.x | Fact lookup from KB |
| Shipping timeline / tracking | Haiku 4.x | Policy lookup |
| Condition / authenticity | Sonnet 4.x | Nuance matters |
| Combined shipping / discount | Sonnet 4.x | Multi-fact + tone |
| Offer / negotiation | Sonnet 4.x | Money on the line |
| Returns / refunds | flagged, no draft V1 | Legal/policy risk |
| Complaint / dispute | flagged, no draft V1 | Reputation risk |
| Other / unclear | Sonnet 4.x but flagged | Don't auto-send |

**Quality regression measurement:** A/B 200 messages before promoting Haiku to a category currently on Sonnet.

**Caching strategy:**
- Anthropic prompt caching for system prompt + brand voice + listing KB (5-min TTL, 1-hr available)
- Separate **answer cache** keyed `hash(listing_id, listing_version, brand_voice_version, category, normalized_question_embedding_bucket)`
- Answer-reuse threshold: cosine ≥0.93 on normalized question
- Invalidation: any of (listing edit, brand_voice_template change, seller edits draft, 14-day TTL) busts entry

**Prompt-injection defense:**
- Buyer message wrapped in `<buyer_message_untrusted>...</buyer_message_untrusted>` delimited tags
- System prompt explicitly states content inside tags is data, not instructions
- Output check: if draft contains "free shipping," "refund," "I'll send for free," off-platform contact info, or admissions of fault → force-flag

**Structured output:**
```json
{
  "draft": "...",
  "confidence": 0.87,
  "used_facts": ["listing.size", "listing.shipping.domestic_days"],
  "flags": []
}
```
Backend verifies every claim in `used_facts` is grounded in `listing_kb`. Reject/regenerate if numeric claims (price, dimension, ship date) aren't grounded.

### 14.4 Seller Dashboard (Web App)

- **Inbox view:** all messages, filterable by status / category / urgency / listing; cursor-paginated
- **Message detail:** original message, buyer history, listing context, AI draft with confidence badge, edit field, action buttons (Send / Send & remember edit / Regenerate / Skip & flag)
- **In-eBay overlay (NEW for V1):** content script renders right-rail panel inside eBay Messages page with inline draft (Approve / Edit / Skip). Eliminates context-switch tax for the 70% of approvals that happen while the seller is already on eBay. Dashboard is the *batch* + settings surface.
- **Batch approve by category:** "Approve all 12 sizing replies" with 3-second undo toast
- **Templates page:** edit brand-voice instructions, greeting, sign-off, category overrides; **visible "learned phrases" section with one-click unlearn** for every captured edit
- **Listings KB:** see what listing data the AI is using; private "behind-the-scenes" notes per listing (e.g., "fits small, recommend up a size")
- **Analytics V1 (single number):** "drafts pending"; full analytics page V1.5
- **Settings:** notifications, data retention, billing, **pause subscription**, **buyer disclosure language toggle** (mandatory if EU/UK seller)
- **Send-status indicator everywhere:** green dot + "Chrome open, will deliver in <2 min" or "Will deliver next time you open Chrome (~9am tomorrow)"
- **"Pause AI" big red button** in extension popup
- **10-second "sent — undo" toast** on every send (queue-side cancel before extension picks up)
- **"Why this draft" expandable** showing listing facts and prior buyer context AI used
- **Activity log / audit trail** — every send, edit, learned phrase, timestamped, exportable
- **Honest "time saved":** approved-and-sent drafts × seller-self-reported median manual reply time − seconds spent editing; show formula on hover; cap at realistic numbers; display "drafts I got wrong" alongside

### 14.5 Memory & Learning (V1 = capture; auto-promotion deferred to V1.5)

- **Per-buyer memory:** every conversation stored; future messages from same buyer get prior context. Rolling-window summarization: when raw_message_count >30 OR summary_token_count >1500, summarize-then-truncate; keep last 5 raw turns
- **Per-seller learning (capture only V1):** seller edits a draft → diff captured into `learned_edits`. **No auto-promotion in V1** — that's a UX/consent landmine and statistical false-positive risk
- **Listing KB sync:** active listings pulled into structured KB so AI doesn't re-read full HTML; drift-detection via `kb_version` snapshot in each draft

V1.5 adds:
- Auto-promotion rule: edit becomes brand-voice rule when `observation_count ≥ 5` AND `consistency_ratio ≥ 0.8`
- Few-shot injection cap: 3 examples per category ranked by recency × consistency
- Beyond 50 learned edits per category, collapse to summary instruction not raw examples
- Inline "I noticed you switched X→Y five times — make this default? [Yes / No / Only for greetings]" toast
- Context-conditional preferences via buyer-history metadata

### 14.6 Send Path (revised — eBay-sanctioned default)

**V1 default — eBay Compatible Application + OAuth + official Sell API:**
- We register as eBay Compatible Application; certified keyset owned by us
- Sellers OAuth-grant our Compatible App access to messaging on their behalf
- Approved drafts dispatched via `AddMemberMessageRTQ` / `AddMemberMessagesAAQToBidder` (or current Sell API equivalents)
- Compliant with eBay Developer Program; no shared keys

**V1 fallback for messages eBay's API can't reach — prepare-and-paste:**
- Approved draft + listing context surfaces in extension as a "Send via eBay" button
- Click opens eBay reply form with text pre-filled
- Seller clicks send manually (one human click; not automation)
- Captures 80% of time savings with zero account-flag risk

**Closed-beta-only experimental — click-simulation:**
- Extension simulates send for ≤8 power users who explicitly opt in with disclosed risk
- Conservative rate limits (≥1 send per 2-3s with jitter), randomized timing, paused on any account warning
- Never the default; never enabled without seller signature on disclosure
- Existence is informational; do NOT market this path

**Notification flow:** drafts ready → mobile/email approve link → tap → magic-link auth → approve. Email-approve is the V1 mobile fallback. PWA with web push is V1.5.

**State machine:**
```
received → classified → (drafted | flagged) → (approved | skipped) → queued → claimed → sending → (sent | failed) 
                                                                                          ↓
                                                                                   send_attempts >= 3 → flagged
```
Split fields: `message_state` (received/classified/awaiting_review/resolved) and `send_state` (none/queued/claimed/sending/sent/failed/cancelled).

---

## 15. Out of Scope (V1)

Same as v1 plus explicit additions:
- Outbound promotional messaging to past buyers (eBay policy risk)
- Poshmark, Mercari, Depop, Vinted (V2)
- Native mobile app (mobile-responsive in V1; PWA in V1.5; native V2.5+)
- Multi-user / team accounts
- SMS / phone notifications
- Voice replies, image generation
- Auto-pricing, auto-listing
- **Auto-promotion of learned phrases** (capture only in V1; promotion logic in V1.5)
- **Custom brand voice** (3 presets only in V1; Custom in V1.5)
- **Full 30-90 day backfill preview** (last 200 / 7 days only in V1; full in V1.5)
- **Full analytics dashboard** (single "drafts pending" number in V1)

---

## 16. User Flows

### 16.1 Install & Onboard
See §14.1's revised 7-step flow.

### 16.2 Daily Active Use
1. Seller gets notification (email or web push) when drafts ready
2. Approves inline in eBay (right-rail extension overlay) for ~70% of drafts, OR opens dashboard for batch
3. Bulk-approve by category with 3-sec undo, OR per-message approve via J/K/A/E/S keyboard shortcuts
4. For flagged: read AI's "reason for flag" + suggested approach bullets + 2-3 saved snippets + link to relevant eBay policy page
5. Approved sends queued; eBay API delivers via Compatible App OAuth, or extension queues prepare-and-paste action when Chrome opens
6. 10-sec "sent — undo" toast on every send

### 16.3 Edit-as-Training Loop (V1 capture; promotion V1.5)
1. Seller approves but changes "Hi there" to "Hey friend!"
2. Backend captures diff, tags category "greeting", stores in `learned_edits`
3. **V1:** seller can review captured edits in Templates → "Learned phrases" section with one-click unlearn
4. **V1.5:** after N consistent edits + consistency ratio, inline toast asks: *"Make 'Hey friend!' your default greeting? [Yes / No / Only for greetings]"*

---

## 17. Technical Architecture

```
+--------------------------+
|   eBay (in browser)      |
|   - seller's session     |
|   - messages, listings   |
+-----------+--------------+
            |
            | DOM read (content script + MutationObserver)
            | + MAIN-world bridge for React-state access
            v
+--------------------------+        HTTPS         +---------------------------+
|   Chrome Extension MV3   | -------------------> |   Backend API (24/7)      |
|   - service worker       |    versioned envelope|   - Node.js + Fastify     |
|   - content script       |    +Idempotency-Key  |   - Auth, ingestion,      |
|   - MAIN-world bridge    | <------------------- |     drafting orchestrator |
|   - offscreen doc        |   selectors/cmds     |   - pg-boss job queue     |
|   - popup UI             |                      +-----+--------+------------+
+--------------------------+                            |        |
                                                        v        v
                                              +--------------+  +-------------+
                                              | PostgreSQL   |  | Claude API  |
                                              | + pgvector   |  | (Anthropic, |
                                              | - users      |  |  ZDR pending)|
                                              | - listings   |  +-------------+
                                              | - messages   |  
                                              | - drafts     |  +-------------+
                                              | - llm_calls  |  |  eBay APIs  |
                                              | - usage_etc  |  | (Sell API,  |
                                              | RLS enforced |  |  Compat App)|
                                              +--------------+  +-------------+
                                                        ^
                                                        |
                                                +-------+----------------+
                                                | Web Dashboard (React)  |
                                                | + Mobile PWA (V1.5)    |
                                                | - inbox, settings,     |
                                                |   templates, analytics |
                                                | - SSE for real-time    |
                                                +------------------------+
                                                        ^
                                                        |
                                              +-------------------+
                                              | Notification Layer|
                                              | - email (Resend)  |
                                              | - web push (V1.5) |
                                              +-------------------+
```

### Component responsibilities

**Chrome Extension MV3**
- AuthN to backend via short-lived RS256 JWT in `chrome.storage.local`
- Content script: watch eBay Messages page; extract via MutationObserver
- MAIN-world bridge: access React-state-bound DOM events when needed
- Offscreen doc: DOM parsing, listing-page processing
- Service worker: woken by `chrome.alarms`; coordinates ingestion + send queue polling
- Selector config fetched from backend; hot-patchable
- Popup UI: status indicator, "Pause AI" button, drafts-pending count
- Right-rail in-eBay overlay for inline approve

**Backend API (always-on)**
- Auth: magic link → dashboard JWT; extension token issued from dashboard session
- Ingest endpoint: idempotency-key dedupe + RLS-scoped store
- Categorization service: embedding classifier, multi-label, confidence threshold
- Drafting service: prompt assembly with PII pre-pass, structured output, used_facts validator, output policy filter
- pg-boss job queue: classification, drafting, embedding, notification, summarization, send-retry
- Send queue: claim/lease pattern with `claim_token` + 2-min lease; supports both Compat-App-API send and prepare-and-paste queue
- Notification service: email digests + web push (V1.5)
- Audit logging: every approve/edit/send to immutable `audit_log`
- LLM cost tracking: every Claude call rows in `llm_calls`

**Database (PostgreSQL + pgvector + Postgres RLS)**
- Source of truth
- RLS enforced via `app.current_user_id` per-request session var
- Prisma middleware enforces tenant scope; CI test fails if any list endpoint returns cross-tenant rows

**Web Dashboard (React + Vite + Tailwind)**
- Standard SPA over REST/JSON
- Real-time via SSE (V1, replacing v1's 30s polling)
- Mobile-responsive V1; PWA with web push V1.5

**Claude API (Anthropic)**
- LLM for drafting only — never for classification (cost)
- Prompt caching enabled
- ZDR agreement target before EU sellers in beta

**eBay Sell API (via certified Compatible Application)**
- OAuth integration; tokens stored encrypted server-side per user
- Default send path V1

**Notification Layer**
- Email: Resend (warm sending domain SPF/DKIM/DMARC ≥2 weeks pre-launch)
- Web push (V1.5)

---

## 18. Tech Stack (revised)

| Layer | Choice | Why |
|---|---|---|
| Chrome Extension | Manifest V3, vanilla JS (or lightweight Preact); `webextension-polyfill` for future cross-browser | MV3 required; small bundle |
| Extension testing | `@playwright/test` against logged-in eBay test account | DOM stability validation |
| Backend | Node.js + Fastify | Faster than Express; same JS ecosystem; better validation/typed routes |
| Job queue | **pg-boss** | Runs on existing Postgres, no Redis bill, transactional enqueue, retries + DLQ built in |
| Database | PostgreSQL on Neon (or Supabase) + **pgvector** + RLS | Relational fit; managed PG; vector search same DB |
| ORM | Prisma + tenant-scope middleware | Strong types, easy migrations |
| Frontend | React + Vite + TailwindCSS | Fast, mobile-responsive |
| State / data fetching | TanStack Query | Standard for React |
| LLM | Claude API (Anthropic) | Strong instruction-following |
| Embeddings | Voyage `voyage-3` or OpenAI `text-embedding-3-small` | Cheap classifier |
| Auth | Clerk (or Supabase Auth) | Don't build custom auth; magic-link + Google OAuth |
| Hosting (backend) | Railway or Render | Push-to-deploy, no Kube |
| Hosting (dashboard) | Vercel or Cloudflare Pages | Free tier covers MVP |
| Email | Resend (warm domain, SPF/DKIM/DMARC) | Magic link + notifications |
| Analytics | PostHog | Product analytics + feature flags |
| Error tracking | Sentry (with `beforeSend` PII scrubber) | Free tier covers MVP |
| Logging | pino → Better Stack or Axiom (free tiers) | Structured JSON logs with `trace_id` |
| Payments | Stripe + Stripe Tax | Standard SaaS billing |
| Encryption | libsodium secretbox column-level on `messages.body`, `drafts.draft_text/edited_text`, `buyer_memory.history_summary` | Per-tenant DEK wrapped by KMS |
| Build CI | GitHub Actions w/ shadow database for migrations | Migration safety |

### Cost-conscious tech decisions
- No Claude calls for classification (embeddings ~100x cheaper)
- Anthropic prompt caching for system prompt + brand voice + listing KB
- Tiered model usage (Haiku-first, Sonnet for nuance)
- Answer cache with 0.93 cosine threshold
- Truncate descriptions to structured `listing_kb` schema
- Per-user budget caps (soft-warn 80%, hard-cap 100%)
- Atomic counter via `UPDATE usage_counters … RETURNING` checked before Claude call
- Embedding classifier itself ~$0.005/user/mo

---

## 19. Data Model (expanded)

```
users
  id (uuid, pk)
  tenant_id (uuid, default = id, makes RLS trivial)
  email
  ebay_user_id
  brand_voice_template (text)
  brand_voice_preset (enum: friendly | professional | casual | custom)
  default_settings (jsonb)
  plan (trial | solo | pro | power)
  trial_ends_at
  current_period_start
  monthly_budget_cents
  stripe_customer_id
  stripe_subscription_id
  ebay_session_fingerprint
  ebay_oauth_token_encrypted (for Compat-App send path)
  buyer_disclosure_enabled (bool)
  paused_until (timestamp, nullable)
  deleted_at (soft delete for GDPR)
  created_at

ebay_accounts
  id (uuid, pk)
  user_id (fk)
  ebay_user_id
  account_label (e.g. "main store" | "uk store")
  oauth_token_encrypted
  is_primary (bool)
  -- enables Power tier multi-account without rewrite

listings
  id (uuid, pk)
  user_id (fk)
  ebay_account_id (fk)
  ebay_item_id
  title
  description (text)
  listing_kb (jsonb)  -- structured: {title, condition, brand, size, color, materials, measurements, shipping, returns, combined_shipping, flaws_noted, raw_description_excerpt}
  kb_chunk_embedding vector(1024)
  is_active (bool)
  ended_at (timestamp, nullable)
  content_hash (text)
  kb_version (int, monotonic)
  last_seen_in_dom_at
  last_synced_at
  seller_notes (text)  -- private behind-the-scenes notes

UNIQUE (user_id, ebay_item_id)

message_threads
  id (uuid, pk)
  user_id (fk)
  buyer_username
  ebay_thread_id
  last_seen_at
  is_unread (bool)
  buyer_memory_id (fk, nullable)

messages
  id (uuid, pk)
  user_id (fk)
  ebay_account_id (fk)
  listing_id (fk, nullable)
  thread_id (fk)
  buyer_username
  ebay_message_id
  body (text, encrypted)
  body_embedding vector(1024)
  pii_scrubbed_body (text)  -- post-regex-pass for LLM input
  direction (enum: incoming | outgoing)
  category (enum)
  category_secondary (enum, nullable for multi-label)
  classifier_confidence (float)
  classified_at (timestamp)
  category_locked (bool)
  message_state (enum: received | classified | awaiting_review | resolved)
  send_state (enum: none | queued | claimed | sending | sent | failed | cancelled)
  send_attempts (int)
  last_send_error (text)
  ebay_send_receipt_id (text)
  dedupe_hash (text)
  ingest_request_id (text)
  received_at
  sent_at
  version (int, optimistic locking)

UNIQUE (user_id, ebay_message_id)
INDEX (user_id, message_state, received_at DESC)
INDEX ON drafts WHERE send_state='queued' (partial)

drafts
  id (uuid, pk)
  message_id (fk)
  version (int, monotonic per message)
  parent_draft_id (fk, nullable)
  superseded_by_id (fk, nullable)
  draft_text (text, encrypted)
  edited_text (text, encrypted, nullable)
  used_facts (jsonb)  -- LLM structured output
  flags (jsonb)
  confidence (float)
  model_used (text)
  prompt_template_version (text)
  prompt_hash (text)
  cache_key (text)
  cache_hit (bool)
  tokens_used_in (int)
  tokens_used_out (int)
  cost_cents (int)
  generated_at
  approved_at
  approved (bool)
  claim_token (uuid, nullable)
  claim_expires_at (timestamp, nullable)
  delivered_at (timestamp, nullable)
  send_method (enum: ebay_api | paste_fallback | click_sim)
  listing_kb_version_at_draft (int)
  stale (bool)

INDEX (message_id, version DESC)

buyer_memory
  id (uuid, pk)
  user_id (fk)
  buyer_username
  history_summary (text, encrypted)
  raw_message_count (int)
  summary_token_count (int)
  summary_version (int)
  last_summarized_at (timestamp)
  total_orders (int)
  last_interaction_at

UNIQUE (user_id, buyer_username)

template_overrides
  id (uuid, pk)
  user_id (fk)
  category (enum)
  template_text (text)
  active (bool)
  version (int)

learned_edits
  id (uuid, pk)
  user_id (fk)
  category
  original_phrase
  preferred_phrase
  embedding vector(1024)
  observation_count
  consistency_ratio (float)
  last_observed_at
  promoted_to_template (bool)
  disabled_at (timestamp, nullable)
  -- V1: capture only; V1.5 promotion logic

llm_calls (audit, NON-NEGOTIABLE)
  id (uuid, pk)
  user_id (fk)
  message_id (fk, nullable)
  draft_id (fk, nullable)
  model (text)
  prompt_hash (text)
  tokens_in (int)
  tokens_out (int)
  cost_cents (int)
  cache_hit (bool)
  latency_ms (int)
  request_id (text)
  anthropic_request_id (text)  -- idempotency
  created_at

INDEX (user_id, created_at)

usage_counters
  id (uuid, pk)
  user_id (fk)
  period_start (date)  -- Stripe-aligned, not calendar
  messages_drafted (int)
  tokens_in (int)
  tokens_out (int)
  cost_cents (int)
  budget_cents (int)
  warned_at_80 (bool)
  hard_capped (bool)

UNIQUE (user_id, period_start)

idempotency_keys
  id (uuid, pk)
  user_id (fk)
  key (text)
  request_hash (text)
  response_json (jsonb)
  created_at

UNIQUE (user_id, key)

audit_log (immutable)
  id (uuid, pk)
  user_id (fk)
  actor (text)  -- 'seller' | 'system' | 'admin:bayu'
  action (text)  -- 'approve_draft' | 'send' | 'edit_template' | etc.
  target_id (uuid)
  target_type (text)
  payload_hash (text)
  created_at

INDEX (user_id, created_at)

webhooks_events
  id (uuid, pk)
  source (enum: stripe | ebay)
  event_id (text)
  payload (jsonb)
  signature_verified (bool)
  processed_at (timestamp)

UNIQUE (source, event_id)

notifications
  id (uuid, pk)
  user_id (fk)
  kind (enum: drafts_pending | weekly_summary | budget_warn | etc.)
  sent_at
  delivered_via (enum: email | push)
```

All FKs `ON DELETE CASCADE` (or soft-delete pattern via `deleted_at`) for GDPR. CHECK constraints on enums. Postgres RLS policies set `tenant_isolation USING (user_id = current_setting('app.user_id')::uuid)` on every tenant table.

---

## 20. API Specification (expanded)

### Conventions
- All endpoints require `Authorization: Bearer <jwt>`
- `Idempotency-Key` header required on all POST/PUT (replay-safe)
- `If-Match: <version>` required on PUT (returns 409 on mismatch)
- Cursor pagination: `?cursor=...&limit=50`, returns `{ data, next_cursor, has_more }`
- Status codes: 201 ingest, 202 async draft, 409 version conflict / duplicate, 422 validation, 429 rate limit (with `Retry-After`), 402 budget exceeded
- All responses include `X-Request-Id`

### Extension → Backend
- `POST /api/v1/ingest/messages` — bulk insert; idempotent on `(user_id, ebay_message_id)`
- `POST /api/v1/ingest/listings` — sync listing data
- `POST /api/v1/queue/claim` → `{drafts: [...], claim_token, lease_expires_at}` — atomic claim with 2-min lease
- `POST /api/v1/queue/confirm-sent` — mark draft delivered (must include `claim_token` + `delivery_proof` like eBay-returned message ID or DOM hash)
- `POST /api/v1/queue/release` — extension closing tab, voluntarily release claim
- `POST /api/v1/queue/report-failure` — eBay send rejected
- `GET /api/v1/extension/selectors?version=N` — hot-patchable DOM selector config
- `POST /api/v1/extension/pair` — bootstraps extension JWT from dashboard session
- `POST /api/v1/extension/revoke`

### Dashboard → Backend
- `GET /api/v1/messages?status=pending&category=...&cursor=...`
- `GET /api/v1/messages/:id` — detail with thread, draft history, buyer memory
- `POST /api/v1/messages/:id/approve` — approve draft, optionally with edits
- `POST /api/v1/messages/:id/regenerate` — new draft version, optional `instructions`
- `POST /api/v1/messages/:id/unapprove` — race-fix
- `POST /api/v1/messages/:id/skip` — flag manual handling
- `GET/PUT /api/v1/templates`
- `GET/PUT /api/v1/listings/:id/notes`
- `GET /api/v1/learned-edits` — list captured phrases
- `POST /api/v1/learned-edits/:id/unlearn`
- `GET /api/v1/usage` — current period counters for UI warning
- `GET /api/v1/analytics/summary` — V1: just `{drafts_pending}`
- `GET /api/v1/events` — SSE stream for real-time inbox updates
- `POST /webhooks/stripe` — Stripe-Signature verified
- `POST /auth/magic-link`
- `DELETE /api/v1/users/me/data` — GDPR

### Auth
- Magic link → dashboard JWT (RS256, 1h, refresh via cookie)
- Extension issues short-lived JWT (24h) bound to (user_id, extension_install_id)
- Refresh via dashboard session
- Revocation list checked on every request

### Rate limits
- Per-token: 200 ingest msgs/min, 5K/day
- Anti-abuse: reject if (user_id, ebay_user_id) doesn't match token binding

---

## 21. eBay Policy, Privacy & AI Transparency (rewritten)

### 21.1 Platform compliance commitments
- **Send path:** eBay-certified Compatible Application using official OAuth + `AddMemberMessageRTQ` / equivalent Sell API endpoints **as V1 default**. Click-simulation is closed-beta-only fallback, disclosed to beta sellers, capped at conservative rate limits with randomized timing, never run on accounts under eBay review
- No outbound to non-engaged buyers, no scraping competitor listings, no bulk messaging, no auto-send without per-message human approval
- Quarterly review of eBay User Agreement, AUP, API License, Developer Program Agreement; changelog published to customers

### 21.2 Buyer data handling (default-on)
- **PII scrubbing default-on:** emails, phones, addresses, names beyond first-name salutation, free-text fields matching health/financial regex are redacted before transmission to Anthropic
- **Buyer message retention:** 30 days hot, 90 days cold (anonymised then), purge after 90
- **Sub-processors:** Anthropic (US, ZDR pending), Neon/Supabase (region-pinned EU for EU sellers), Vercel/Railway, Resend, Stripe, Sentry, PostHog, Clerk. Public sub-processor list maintained
- **Column-level encryption** on `messages.body`, `drafts.draft_text`, `drafts.edited_text`, `buyer_memory.history_summary` (libsodium secretbox, per-tenant DEK wrapped by KMS)
- GDPR/UK GDPR DPA available pre-signature; SCCs + UK addendum included
- CCPA/CPRA: data category disclosures, "do not sell/share" honored, deletion-on-request workflow

### 21.3 Transparency to buyers (EU AI Act Art. 50 compliance)
- Sellers agree to a buyer-disclosure clause: their public eBay profile or auto-appended signature includes *"Replies may be assisted by AI; reviewed by the seller before sending."*
- **Required in EU/UK accounts**; strongly recommended elsewhere
- Optional automatic signature insertion controlled in Settings
- Effective August 2026 deadline for EU AI Act Art. 50

### 21.4 Audit logging
- Every draft generation, edit, approval, send is logged with model used, prompt hash, scrub status, seller identity
- Logs retained 12 months
- Available to seller on request, available to eBay under valid legal process

### 21.5 Data retention defaults
- Buyer message body: 30 hot / 90 cold / purge
- Drafts (approved/sent): 12 months
- Buyer memory summaries: aggregate-only after 90 days, no raw quotes
- `learned_edits`: indefinite (anonymized phrase pairs only)
- Logs: 30 days; Sentry events 30 days with PII scrubbing on ingress
- Seller cancellation: 30-day grace, full purge of buyer data within 14 days; seller-owned templates exportable
- Seller can trigger "purge all buyer data now" from Settings

### 21.6 AI Act / disclosure regime
- System classified as limited-risk under EU AI Act
- Transparency notice (21.3) discharges Art. 50 obligation
- No automated decision-making with legal effect on buyers (Art. 22 GDPR)

### 21.7 What we will NOT do
- Send unsolicited promotional messages
- Auto-send without seller approval
- Read/interact with any account other than the logged-in seller's
- Scrape competitor listings
- Bulk-message anyone
- Share or sell buyer data
- Train on buyer data without consent

### 21.8 Pre-launch verification checklist
1. eBay User Agreement automation clause re-read (https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement)
2. eBay API License + Developer Program Agreement terms confirmed for Compat-App messaging
3. Apply to eBay Compatible Application program — Week 1
4. Chrome Web Store program policies — single-purpose, limited use, 2024 user-data disclosure rules
5. Anthropic ZDR agreement filed — Week 1
6. Privacy Policy + ToS + DPA drafted and lawyer-reviewed by Week 11
7. EU AI Act Art. 50 timing confirmed for August 2026

---

## 22. Token & Cost Optimization (corrected math)

Per-draft tokens (uncached, first call on a listing):

| Component | Tokens in |
|---|---|
| System prompt (rules, format, guardrails) | 1,200 |
| Brand voice block + few-shots | 1,500 |
| Listing structured summary (`listing_kb`) | 800 |
| Buyer history + thread context | 400 |
| Incoming message (PII-scrubbed) | 150 |
| **Total in** | **~4,050** |
| **Total out (draft + structured fields)** | **~250** |

Per-draft cost band:

| Scenario | Per-draft | Per Pro user (1,500/mo) |
|---|---|---|
| Sonnet 4.x, no cache | ~1.6¢ | $24/mo |
| Sonnet 4.x, prompt cache 60-75% | ~0.9¢ | $13.50/mo |
| Sonnet 4.x, mature 80% cache | ~0.65¢ | $9.75/mo |
| Haiku 4.x, mature 80% cache | ~0.18¢ | $2.70/mo |

**Realistic blended LLM COGS at maturity: $8-12/user/mo**, not $2-4. Plan for $12 blended LLM COGS in pricing.

### Optimizations
- **Routing via embeddings, not Claude** — ~100x cheaper classification
- **Anthropic prompt caching** for system + brand voice + listing KB (5-min TTL, 1-hr available)
- **Tiered models** per category routing table (§14.3)
- **Answer cache** for ultra-common Q's, threshold cosine ≥0.93
- **Truncate descriptions** to structured `listing_kb`
- **Per-user budget caps** — soft-warn 80%, hard-cap 100%, atomic counter pre-Claude
- **Hard-cap Starter (Solo) tier to Haiku + 1 redraft per message** — protects margin on cheapest tier
- **Idempotency on Claude calls** — `anthropic-request-id: deterministic_uuid(message_id, draft_version)` — re-checks `llm_calls` row before re-billing

---

## 23. MVP Roadmap (revised, 16-18 weeks)

| Wk | Deliverable | Decision Gate | Est. (hrs, part-time) | Risk |
|----|-------------|---------------|----------------------|------|
| 0 | Phase 0 prep: export 90-day messages, draft eval set spec, apply to eBay Compat App | Rubric exists & reviewed; Compat App application submitted | 10-15 | Low |
| 1 | Hand-label ≥300 messages: automatable Y/N, category, "would I have shipped this?" Run Claude offline on full set, score 1-5. File Anthropic ZDR request | **GATE A:** ≥60% automatable AND ≥70% drafts ≥4. If <50%, **kill** | 20-25 | **High — kill switch** |
| 2 | Architectural spikes parallel: (a) MV3 manifest + content script PoC reading messages page; (b) Postgres + Prisma + Fastify skeleton w/ RLS from D1; (c) prompt-builder pure function with eval harness | All three "hello world" working; multi-tenancy enforced | 25-30 | High |
| 3 | Real ingestion: extension → backend → DB; selectors modular (server-served); idempotency on `ebay_message_id` | 100 real messages ingested, 0 dupes | 20-25 | Med |
| 4 | Listing scraper + classifier (embeddings, multi-label) + drafting service w/ structured output + eval harness in CI | Eval ≥75% on Wk-1 set; factuality 100% | 25-30 | Med |
| 5 | Founder-only dashboard (single-tenant, hardcoded user, Tailwind, no auth): inbox, draft, edit, approve, in-eBay overlay PoC | Founder uses it daily | 20-25 | Low |
| 6 | **Send-path PoC: eBay Compat App OAuth flow** + prepare-and-paste fallback | **GATE B:** OAuth flow working on test eBay account; paste fallback delivers correctly | 25 | **CRITICAL** |
| 7 | Send-path productionization + retry + confirm-sent w/ claim/lease; founder fully closed-loop via Compat App API | 7 consecutive days dogfooding | 20-25 | High |
| 8 | Buffer / bug fix / eval expansion to 150. Privacy Policy + ToS + DPA draft to lawyer. CWS account setup, screenshots, store listing copy. Trademark search. LLC + EIN. Stripe Tax setup | Eval set = 150; legal in lawyer review | 20 | Med |
| 9 | Memory & learning capture (no auto-promotion); buyer-memory summarization job; learned_edits visible in Templates with unlearn | Drafts measurably improving on founder's account | 25 | Med |
| 10 | Auth (Clerk) + magic-link onboarding + Stripe test mode + trial logic + email warm-up SPF/DKIM/DMARC | Friend installs from unlisted CWS, completes $1 test charge | 25-30 | Med |
| 11 | Backfill preview UX (last 200 / 7 days) + brand-voice picker (3 presets) + onboarding polish + observability (Sentry, PostHog, status page) + Resend email warming | Onboarding completable in <10 min by non-founder | 20-25 | Med |
| 12 | **CWS submission** + email deliverability live + support inbox + buyer-disclosure-clause UI for EU/UK | Submitted to CWS | 20 | Med — review 3-30 days |
| 13 | While CWS in review: PWA scaffold (V1.5 prep), in-eBay overlay polish, "time saved" honest math, audit log surfacing | PWA at MVP, audit trail viewable | 25 | Med |
| 14 | CWS approval (hopefully) + private invite to first 3 betas + 1:1 onboarding calls each + Beta Agreement signatures | 3 sellers ingesting messages | 20 | High |
| 15 | Beta iteration: triage daily, ship hotfixes, capture quotes, run Van Westendorp PSM | All 3 sellers retained week-over-week | 25-30 | High |
| 16 | Beta expand to 8-12; learning loop visible in metrics; first paid testimonials filmed | ≥3 retained, ≥1 willing to pay (verbalized) | 25 | Med |
| 17-18 | Buffer for spillover, polish, public launch prep, comparison content drafted, demo video shot | DoD met (see §11) | 25 each | — |

**Total: ~390-490 hours over 18 weeks** at 22-27 hr/wk part-time.

### Critical path
```
Phase 0 GATE A → MV3 PoC → Ingestion stable → Drafting+Eval ≥75% →
   Send-path PoC GATE B → Closed loop on founder
      → [parallel: multi-tenant in DB | legal docs | CWS listing prep]
         → CWS SUBMISSION → CWS review wait (3-30d)
            → Beta recruit → Beta iteration → DoD
```

### Hidden work checklist (now in roadmap, not omitted)
- Privacy Policy + ToS authoring (Termly or lawyer; $300-2K) — Week 8-11
- DPA template — Week 8-11
- eBay Developer Program registration + Compat App application — Week 0-1
- Trademark/name search; domain; CWS extension name uniqueness — Week 8
- CWS developer account ($5) + screenshots + demo video + privacy disclosures — Week 11-12
- Stripe + Stripe Tax + LLC + EIN — Week 8-10
- Email deliverability SPF/DKIM/DMARC + warm domain ≥2 weeks pre-launch — Week 10-11
- Customer support channel (`support@`, Plain.com or Gmail+labels) — Week 11
- Eval harness as code — Week 4
- Logging/observability/uptime — Week 11
- Bug-fixing buffer — built into weeks 8 and 17-18
- Onboarding video/GIFs — Week 17-18
- Refund/cancellation policy + Stripe webhook — Week 10
- Beta recruiting itself — 10-15 hrs across weeks 13-14
- Anthropic ZDR agreement — Week 1

### V1 scope cuts (deferred to V1.5)
1. Auto-promotion of learned phrases — capture only in V1
2. Custom brand voice — 3 presets only in V1
3. Full 30-90 day backfill preview — last 200 / 7 days only in V1
4. Full analytics dashboard — single "drafts pending" number in V1
5. Browser push notifications — email-approve in V1
6. Full PWA — mobile-responsive in V1; PWA in V1.5

### Architecture decisions to make in Week 1 (avoid Month 6 rework)
- Multi-tenant from D1 (RLS + Prisma middleware + CI test)
- Platform abstraction (`platform` enum on messages, listings; `users.platform_account_ids` JSONB) — don't name tables `ebay_messages`
- Versioned, typed extension↔backend protocol (Zod schemas, `protocol_version: 1`)
- Selectors as data, not code
- Idempotency keys on every send and ingest endpoint
- Prompt-builder as pure function with snapshot tests
- Per-user budget caps wired before first external user
- Encryption keys in env from D1 (don't retrofit)
- Audit log table from D1 (cheap to add, expensive to backfill)

---

## 24. Future Roadmap (Post-V1)

- **V1.5 (Months 5-7):** PWA + web push, auto-promotion of learned phrases, custom brand voice, full backfill preview, full analytics, in-eBay overlay polish, more category templates, V1 of community-flag-shared-scam-buyers feature
- **V2 (Months 8-12):** Poshmark integration (clothing-native; same ICP), Edge add-on, Firefox MV3 port
- **V2.5 (Months 13-18):** Depop, Vinted, Mercari
- **V3 (Year 2):** Native mobile app for on-the-go approvals
- **V3.5 (Year 2):** Team / multi-user accounts
- **V4 (Year 2-3):** Proactive features — *with extreme policy caution* — gentle nudges to past interested buyers (only if eBay policy clearly permits)
- **V5 (Year 3):** Voice replies, multi-language, network-effect features (cross-seller benchmarks, anonymized FAQ patterns)

### Cross-platform expansion as eBay-risk insurance
If eBay launches better Smart Reply, **accelerate Poshmark to Month 6** (from M9-12). Cross-platform breadth becomes the moat.

---

## 25. Risks & Mitigations (consolidated)

See §10 — same table covers PRD-side risks.

---

## 26. Notes for the Build / Coding Agent (revised)

When handing this to a coding agent (Claude Code, Cursor, etc.):

- **Start with Phase 0 and Phase 1 only.** Don't scaffold the whole thing at once. Validate first.
- **Multi-tenant from day 1.** RLS on every table, Prisma middleware, CI test that fails if any list endpoint returns cross-tenant rows.
- **Extension is the highest-risk technical piece.** DOM scraping is fiddly. Build it as a standalone PoC in Week 2; validate Phase 0 verification checklist (§28) before touching production code.
- **Backend scaffold:** Fastify + Prisma + pg-boss + pgvector + RLS + a single `/ingest/messages` endpoint and one Postgres table. Make data flow end-to-end before adding LLM.
- **LLM integration:** write prompt-builder as pure function — `(message, listing_kb, brand_voice, buyer_history, learned_edits) → prompt string`. Snapshot-test it. Test in isolation with eval cases before wiring API. Use structured output with `used_facts` validation.
- **Prompt-injection defense from D1:** delimited untrusted-content tags + system prompt rule + output filter for forbidden phrases.
- **PII scrubbing default-on:** regex pre-pass before any Claude call; default-on, opt-out (with explicit warning).
- **Keep secrets out of the extension.** All API keys live on backend. Extension carries only short-lived (24h) RS256 JWT scoped to (user_id, install_id).
- **Manifest V3 only.** Service workers, content scripts, MAIN-world bridge, offscreen doc as needed.
- **Selectors as data.** Server-served, hot-patchable.
- **Don't over-engineer V1.** No microservices. No Kubernetes. Single backend service, single database, single SPA.
- **Eval harness early.** ~150 real messages with expected categories and ideal drafts. Run on every prompt change. Exit gate: no category drops >5 F1 points; factuality 100%; LLM-judge mean ≥4.0.
- **Telemetry early.** Track every draft generation, approval, edit. `llm_calls` table is non-negotiable for cost attribution and dispute defense.
- **Idempotency on every POST.** `Idempotency-Key` header, store + replay response.
- **Send queue with claim/lease.** Atomic claim, 2-min lease, multi-tab safe.
- **Per-user budget caps wired pre-Claude call.** Atomic `UPDATE usage_counters … RETURNING`.
- **Audit log table from D1.** Every approve/send/edit with `payload_hash`.
- **eBay Compat App OAuth as V1 default send path.** Click-simulation is closed-beta-only.
- **Platform abstraction in data model.** Don't hardcode "eBay" — `platform` enum from D1.

---

## 27. Threat Model & Trust Boundaries (NEW)

| Principal | Trust | Boundary | Top threats |
|---|---|---|---|
| Seller (customer) | Semi-trusted | Owns extension + dashboard session | ATO; ToS-violating misuse; approves discriminatory/illegal AI draft; subpoenas |
| Buyer | Untrusted | Message body crosses into our system | Prompt injection; embedded PII/PCI; submitting illegal content; GDPR erasure |
| eBay (DOM + session) | Untrusted host | Content script reads DOM | XSS in eBay reaching extension; DOM changes; hostile JS reading our token |
| Anthropic (Claude) | Trusted vendor | All buyer text egresses to them | Log retention; subpoena; output of harmful content |
| Our backend | Trusted (us) | Multi-tenant DB + LLM proxy | Tenant isolation bug; admin abuse; key compromise |
| Our extension | Semi-trusted | Distributed via CWS | Compromised publisher → malicious update |
| Stripe | Trusted vendor | Webhooks back to us | Forged webhooks if signature unverified |
| Third-party SaaS | Trusted vendors | PII flows | Vendor breach; PII in error/event payloads |
| npm supply chain | Untrusted | Build pipeline | Typosquats; malicious update stealing secrets |

### Tenant isolation enforcement
- Postgres RLS: `CREATE POLICY tenant_isolation ON messages USING (user_id = current_setting('app.user_id')::uuid)` on every tenant table
- Set `app.user_id` per request in middleware
- Defense-in-depth: Prisma middleware enforces `user_id` filter on every query
- CI test: every list endpoint runs as user A, asserts zero rows from user B; fails CI if cross-tenant leak

### Incident response plan
- **Detection:** Sentry alerts on auth anomalies, ingest spikes, draft-send mismatches; budget overruns
- **On-call:** founder pager during beta + early launch
- **Containment:** kill-switch flag disables ingest + send queue globally
- **Notification:** sellers within 72h per GDPR; eBay if platform integrity affected; buyers via sellers
- **Post-mortem:** within 14 days, published if customer-affecting

---

## 28. Phase 0 Verification Checklist (NEW, must complete Week 1)

Each is a binary go/no-go. Validate on founder's real eBay seller account.

1. **DOM stability probe** — capture full HTML of Messages list + 5 message detail panes. Re-capture 48h later. Diff. If selectors changed in a week → invest in selector-config service before anything else.
2. **Cross-account DOM diff** — open Messages page in Chrome incognito with second eBay account. Confirm DOM matches founder's. If not → A/B variants real, plan accordingly.
3. **Listing description access** — from content script on View Item page, attempt to read description iframe's `contentDocument`. Document whether cross-origin or accessible. If cross-origin → use Browse API or structured data path.
4. **Send-simulation PoC** — in devtools console on real Messages thread, manually craft event sequence (native value setter + `input` + `change` + `click`). Verify message actually sends. Verify in eBay UI and buyer's view. If 4xx or silent drop → click-simulation is dead, double down on Compat App + paste fallback.
5. **Anti-automation network diff** — record network tab on manual vs simulated send. Diff headers, timing, `X-EBAY-C-*` tokens. If simulated missing tokens that real send carries → CSRF token sourced from React state; adjust dispatch path.
6. **MV3 lifecycle reality check** — build 50-line extension with SW logging wake/sleep. Run 24h normal use. Confirm `chrome.alarms` at 1-min interval fires reliably or measure throttle behavior.
7. **Backfill timing** — manually scroll through 30 days of messages on founder's account, time it. Multiply 3-5x for a higher-volume customer. If >10 minutes → V1 backfill is "last 200 / 7 days" only.
8. **Chrome Web Store policy read** — read program policies on `host_permissions`, "remotely hosted code" (selector config must serve data not code), Limited Use data policies. Submit a stub extension early to surface review hurdles.
9. **Session/2FA behavior** — force-expire eBay session; observe Messages page rendering to content script. Confirm extension can detect "needs login" and prompt seller rather than silently fail.
10. **Selector resilience SLA** — define commitment: "if eBay changes selectors, hot-patch within 4 hours." Validate selector-config service hot-patch flow end-to-end.
11. **eBay Compatible Application program eligibility check** — read program requirements; submit application. This is the V1 send path; if rejected, V1 timeline shifts.
12. **Anthropic ZDR eligibility** — file request via Trust Center; required before EU sellers in beta.

Items 4 and 6 are existential. Items 11 and 12 are paperwork-on-critical-path.

---

## 29. Eval Harness Specification (NEW)

### Dataset
- **150 real messages** from founder's 90-day backfill, hand-labeled with `(category, ideal_draft, key_facts_required)`
- Stratified: ≥10 per category × 9 categories
- Hold-out: 30 messages never used for prompt tuning (only for final regression)

### Metrics (layered)
1. **Classifier:** macro-F1 per category, confusion matrix. **Target: ≥0.85 macro-F1 before launch**
2. **Draft factuality:** automated check — every numeric/policy claim in draft must appear in `listing_kb`. **Failures = hard fail**
3. **Draft quality:** LLM-as-judge (Sonnet grading Sonnet/Haiku output) on rubric — tone match, completeness, no hallucination, no policy violation, 1-5 each. Calibrate judge against 30 founder-graded samples first
4. **Approval-rate proxy** (production telemetry): % drafts founder ships unedited

### Run cadence
- On every prompt change
- On every model swap
- Nightly in CI
- Block deploy if any category drops >5 F1 points OR factuality not 100% OR LLM-judge mean <4.0

### Founder-voice overfitting protection
- As beta sellers join, do NOT merge their data into eval set
- Each seller gets own 20-message personal eval slice
- Aggregate only factuality + classifier metrics across sellers
- Tone metrics per-seller

### Bootstrap from zero
1. Hand-label founder's 300 backfill messages
2. Synthesize 1-2K examples per category via Claude ("generate 50 plausible buyer messages for the 'sizing' category")
3. Use synthesized + real as prototype-vector library
4. Threshold floor: cosine <0.72 → "unclear" → flag

---

## 30. Definition of Done for V1 (NEW)

V1 ships when **all** are true:
- 3 non-founder sellers used it for 14 consecutive days, ≥50 real drafts each
- ≥70% of drafts approved with edits ≤20% of characters changed
- Zero double-sends, zero cross-tenant data leaks, zero account warnings from eBay across all users
- Onboarding completable end-to-end without founder assistance (measured)
- Stripe live-mode subscription created, charged, renewed once on a real card
- Eval harness ≥80% on a 200-message held-out set, run on every prompt change
- p95 draft latency <8s; backend uptime ≥99% over trailing 30 days
- Privacy Policy + ToS + DPA published; CWS listing live and approved
- eBay Compatible App approved and live (or documented prepare-and-paste fallback validated as primary)
- Anthropic ZDR agreement signed (if any EU sellers in beta)
- Founder hasn't touched the codebase for 7 consecutive days and nothing broke

That's V1 done. Month-6/100-paying-users is a marketing milestone, not a product DoD.

---

## 31. Appendix: Quick Reference

### Brand promise
*Save 30 minutes a day on eBay messages. AI drafts in your voice. You approve.*

### Elevator pitch (30 seconds, sharper)
> "If you've got 200+ vintage clothing listings on eBay, you know the drill: 'Will this fit?' 'When does it ship?' 'Is this authentic?' — 50 times a day, same answers, already in your listing. I'm an eBay seller too. I built a Chrome extension that drafts every reply in your voice using your listing details. You hit approve. It saved me an hour a day. $49/month, 14-day free trial, no credit card. If it doesn't save you 30 minutes a day in week one, I'll refund you and apologize."

### Why now
- LLM costs finally low enough for per-message AI economics with prompt caching
- Manifest V3 mature enough to handle this reliably
- Reseller economy growing; cross-listing economy growing
- eBay has not yet shipped a meaningfully better Smart Reply (window closing)
- AI tooling acceptance high

### Why us
- Founder is the customer (active eBay vintage clothing seller)
- Focused single-problem product (vs AutoDS doing 20 things)
- Lean stack, fast iteration
- Niche-down for trust + word-of-mouth
- Data flywheel as moat (instrumented from D1)

### Critical numbers
- LLM cost target: $8-12/Pro user/mo (mature)
- Pro pricing: $49/mo
- Realistic gross margin: 67-73% (not 85%)
- Realistic supportable CAC: $93 (not $30)
- Y1 ARR target: $50-90K
- 3-yr SOM: 2,500-4,000 paying users / $1.0-1.6M ARR
- Build timeline: 16-18 weeks to closed beta
- Eval harness: 150 messages hand-labeled, ≥0.85 macro-F1 before launch

### One-liner risk reminders
- Send via Compat App API, not click simulation
- Multi-tenant + RLS from D1, not Week 9 retrofit
- PII scrubbing default-on, not opt-in
- Prompt-injection defense from D1
- Anthropic ZDR before any EU seller
- CWS publisher account = hardware 2FA + dedicated Google account
- Beta-to-paid: 50% off Pro forever, NOT free forever

---

*End of Business Plan & PRD v2.0.*

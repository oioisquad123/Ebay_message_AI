# Execution Plan v1.0 — Fastest Honest Path to Ship

**Companion to:** `BusinessPlan_and_PRD_v2.md`
**Date:** 2026-05-03
**Founder:** Bayu

---

## TL;DR

You asked: "FE first, then BE, then integration?" → **No, that's the slowest path.** Vertical thin slices end-to-end is dramatically faster.

You asked: "Can we ship today?" → A polished multi-tenant SaaS, no. **A personal tool you use yourself in 7 days, yes.** Then a closed-beta SaaS in 12-13 weeks (not 18).

The plan has three phases:

| Phase | Calendar | What you have at end |
|---|---|---|
| **V0 — Personal tool of one** | Days 1-10 (this + next week) | A working assistant on your own eBay account; saves you 30+ min/day; produces 300+ labeled real messages = your eval set |
| **V1 — Closed-beta SaaS** | Weeks 4-13 (start 2026-05-25) | 8-12 paying-eligible beta sellers using a multi-tenant product, CWS-approved, eBay Compat App integrated, Stripe live |
| **Public launch** | Month 5-6 | First 25 paying users |

Honest compression of v2 PRD's 18 weeks → **~13 weeks to closed beta** with Claude Code + parallel calendar tracks. Anyone promising less is selling you something.

---

## The Three Mental Shifts

1. **Slices, not layers.** Don't build "the FE" and then "the BE." Build "I paste a buyer message and see one AI draft" end-to-end on Day 1, then thicken slice by slice. Each slice is dogfoodable.
2. **V0 personal tool first.** 10 days of `localhost-only` SQLite + minimal extension + React. You use it on your own messages while the calendar-time SaaS infra (eBay Compat App approval, lawyer docs, LLC, ZDR) processes in parallel. Hard freeze on V0: **2026-05-24**.
3. **Calendar tracks fire Week 1, not Week 8.** eBay Compatible App review takes 4-12 weeks. Filing it today saves ~4 calendar weeks. Same logic for Anthropic ZDR, lawyer-drafted legals, LLC+EIN, CWS publisher account. These are bureaucratic critical path; start the clock now.

---

## THIS WEEK Checklist (Mon May 4 → Sun May 10)

Total: ~28-33 hours, ~$700 spend. Do them roughly in this order.

### Calendar-time tracks (do this; the clock runs whether you build or not)

- [ ] **Register eBay Developer Program** at developer.ebay.com (1h, $0). Blocks Compat App application below.
- [ ] **File eBay Compatible Application program submission** (4-6h, $0). Use case: "AI-drafted reply assistant for sellers; messaging via official Sell API; seller approval before send; rate-limited; non-API-replaceable categories use prepare-and-paste fallback." This is the single most important action this week — review takes 4-12 weeks and gates V1's send path.
- [ ] **File Anthropic ZDR (Zero Data Retention) request** via Trust Center / sales contact (1h, $0). Required before any EU sellers in beta.
- [ ] **Brand name shortlist** (4h, $30-60): 3-5 candidates → USPTO TESS check (free) + .com/.ai availability + CWS slug + Twitter/IG/YouTube handles. Buy domain for top pick. Criteria from PRD §12: ≤8 letters, no eBay/bay/auction in name.
- [ ] **File LLC + EIN** (3h, $150-550): Wyoming ($100 + $39/yr RA, 24-48h) or Delaware ($90 + $50 expedite). EIN online same day after LLC files (irs.gov, free).
- [ ] **Create dedicated Google account for CWS publisher**, hardware 2FA enrolled (1h, $5 CWS dev fee).
- [ ] **Email 3 SaaS attorneys** for PP+ToS+DPA quotes (2h, $0 to send). Engage by Week 2 once LLC named. Budget $1.5-3K flat fee.
- [ ] **Set up Resend account + add domain DNS** (SPF/DKIM/DMARC) so propagation finishes early (2h, $0). Active warming starts Week 8.
- [ ] **Stripe account application** in pending state (1h, $0). Verifies once LLC+EIN ready.
- [ ] **Submit CWS stub extension** for review (4h, $0). Surfaces policy hurdles 6+ weeks early per PRD §28 item 8.

### V0 build kickoff (start tomorrow)

- [ ] **V0 Day 1** (4-8h): "Paste-and-draft" loop. Vite+React shell, Fastify, SQLite, `POST /dev/draft` calling Claude with system prompt + listing JSON + buyer message. End of day: paste any message → see AI draft. (See V0 plan below.)
- [ ] **Phase 0 hand-labeling, batch 1** (2-3h): Export 90 days of your eBay messages. Hand-label first 50 into 9 PRD categories with `(automatable Y/N, ideal_draft, key_facts_required)`. This *is* PRD GATE A run as code. Continue 30/day in spare moments.

### Audience-building tracks (start Week 1, parallel forever)

- [ ] **YouTube #1 recorded + published Friday** (3h): "I'm building an AI message assistant for eBay sellers — here's why." Raw cut OK. Don't perfect.
- [ ] **Newsletter Issue #1** Tuesday (1h): Founder intro + "I'm building this in public" + signup form on Carrd/Vercel landing.
- [ ] **Reddit r/Flipping presence** (30 min/day): pure helpful comments, no link, no pitch. 90-day no-link rule from GTM agent. Build credibility.

---

## V0: Personal Tool of One (Days 1-10)

**Hard time-box: ship Day 1-7 deliverables by 2026-05-10. Freeze 2026-05-24.**

### Why V0 first

The 18-week SaaS spec rests on guesses about your real message mix, prompt shape, category taxonomy, and unit economics. Two weeks living with V0 will move at least 3 of these assumptions before you commit infra to them. Cost of V0: 2-3 weeks. Cost of skipping: 4-6 weeks of mid-beta re-architecture.

### V0 shape

Localhost-only Node + SQLite + minimal React, fed by a 30-line MV3 content script that scrapes `mesg.ebay.com` and POSTs to `http://localhost:3000/ingest`. No auth, no deploy, no multi-tenancy. Stack you already know: TS + Fastify + better-sqlite3 + Vite + React + Tailwind + `@anthropic-ai/sdk`. ~600 LOC total.

### V0 day-by-day

| Day | Deliverable | End-of-day capability |
|---|---|---|
| 1 | Vite+React shell, Fastify server, SQLite schema (`messages`, `drafts`, `listings`, `learned_edits`, `llm_calls`), `POST /dev/draft` paste page | Paste any message + listing JSON, see Claude draft + cost |
| 2 | MV3 extension: content script on `mesg.ebay.com/*`, "Sync now" button POSTs visible thread to localhost | One click → real eBay messages land in SQLite |
| 3 | Listing scraper: pastes 50 listing URLs once, extension visits + extracts `listing_kb` JSON (title, condition, size, shipping, returns) | Listing KB populated for top 50 items |
| 4 | Drafting endpoint with structured output (`{draft, confidence, category, used_facts}`); inbox UI lists ingested messages with drafts | First AI drafts on real messages — eyeball quality |
| 5 | Approve / Edit / Skip buttons; capture edit diff into `learned_edits` (no auto-promotion); category tag dropdown | Working review loop. Already saving time |
| 6 | "Approve" copies final text to clipboard + opens eBay reply tab; mark `sent_at` | Full daily-use loop end-to-end |
| 7 | Anthropic prompt caching (system + brand voice + listing KB block); seed 50 hand-labeled messages as eval set | Cost halves; eval baseline exists |
| 8 (opt) | J/K/A/E/S keyboard shortcuts; batch-approve-by-category | Speed |
| 9 (opt) | Tiered routing: Haiku for sizing/shipping/greeting, Sonnet for negotiation/condition; log model + tokens to `llm_calls` | Real per-category cost data |
| 10 (opt) | Eval harness: replay any message through current prompt, diff against approved version, regression report | Iterate prompts confidently |

If you slip, kill Days 8-10 first. Days 1-7 are the product.

### V0 needs vs. skips

| ABSOLUTELY NEEDS | ABSOLUTELY SKIPS |
|---|---|
| Real eBay message ingest (extension) | Auth, JWT, RLS, multi-tenancy, Clerk |
| Listing KB (~50 listings) | Stripe, plans, trials, billing, budget caps |
| Claude API + prompt caching | pgvector, embedding classifier (use Claude for category in V0) |
| Approve / Edit / Skip UI | Multi-label routing, drift control, A/B model testing |
| Prepare-and-paste send | Compatible App OAuth, Sell API, click-sim |
| `learned_edits` capture | Auto-promotion logic, consistency ratios |
| Local SQLite | Postgres, Neon, Prisma, pg-boss |
| Hardcoded brand voice (single string) | Voice picker UI, presets, custom voice |
| `npm run dev` onboarding | 7-step onboarding, backfill preview |
| 9-category labels (manual at first) | Embedding-based classification |
| Cost log (model + tokens) | Usage analytics, dashboards |
| | Right-rail overlay, undo toasts, send-status |
| | PWA, web push, mobile, email digests |
| | Audit log, GDPR retention, EU disclosure |
| | CI, Playwright, comprehensive tests |
| | Idempotency keys, send-state machine, claim/lease |

### V0 success metric (binary, falsifiable)

> *I personally use V0 for 7 consecutive business days and self-report ≥30 min/day saved, with ≥60% of drafts approved unedited or with edits ≤10 chars.*

Hit it → V1 thesis is proven, build with confidence. Miss it → product thesis is wrong; you've burned 10 days, not 18 weeks. **That's the entire reason V0 exists.**

### V0 → V1 graduation

| Survives unchanged | Gets thrown away |
|---|---|
| 9-category taxonomy + your hand-labeled examples | Inbox UI (V1 is multi-page, mobile-responsive, RLS-aware) |
| `listing_kb` JSON schema | SQLite (→ Postgres + pgvector) |
| Prompt structure + `used_facts` validator | MV3 dev-mode extension (V1 needs CWS-published, signed) |
| `learned_edits` rows (300+ tuples = V1 eval gold) | Hardcoded brand voice → preset picker |
| `llm_calls` cost log → seeds real unit economics | Clipboard send → Compat App + Sell API |
| Eval harness | Localhost server → Railway-hosted Fastify |

Net: ~30% of V0 LOC survives as schema/prompts/data; ~70% throwaway scaffolding. That ratio is right for a probe.

### PRD assumptions V0 will likely change

After 2 weeks of real use, expect at least 3 of these to shift:

1. **Category mix** — vintage clothing reality is ~40% sizing, not the even 9-way split.
2. **Tiered routing economics** — Haiku may cover 5+ categories with strong KB grounding (not the 3 PRD assumes); changes margin math materially.
3. **In-eBay overlay necessity** — keyboard-shortcut batch in your own dashboard may beat in-context approval. Could save 1-2 weeks of MV3 work in V1.
4. **Brand-voice presets shape** — voice = vocabulary swaps + sign-off + phrasings, not "Friendly/Professional/Casual." V1.5 auto-promotion may need to be V1.
5. **Returns/refunds rule** — "always flag, never draft" may be too conservative; ~60% of "return" messages may be low-stakes.

---

## V1: Vertical Slices (Weeks 4-13)

Replaces v2 PRD §23's horizontal "ingestion / drafting / dashboard / send" weekly buckets with 8 vertical slices that are each end-to-end.

### Slice rules

- Every slice touches every needed layer (extension → backend → DB → LLM → UI).
- Every slice is dogfoodable on your own account.
- Every slice anchors one new Zod contract in `packages/shared`.
- Every slice ships behind tests + adds a fixture.

### The 8 slices

| # | Slice | When | Hours | Validates |
|---|---|---|---|---|
| 1 | `/dev/draft` paste-and-draft loop with Claude | Day 1 (V0) | 4-8 | Claude can draft your messages; cost; prompt shape |
| 2 | DOM read → backend ingest → DB row (RLS from D1) | Week 4-5 | 15 | MV3 lifecycle, selectors, idempotency, multi-tenancy |
| 3 | Ingest → classify → draft → see in `/dev/inbox` (eval harness in CI) | Week 5-6 | 20 | Category routing, factuality, prompt-injection filter, cost target |
| 4 | Approve in dashboard → prepare-and-paste send | Week 6-7 | 20 | Claim/lease, send-state machine, idempotency on send |
| 5 | In-eBay overlay inline approve → paste send | Week 7-8 | 15 | The 70% primary surface |
| 6 | eBay Compat App OAuth send path (GATE B) | Week 8-9 | 25 | Production send path; Slice 4 paste fallback still works |
| 7 | Listings KB + buyer memory grounding (rolling summarization) | Week 9-10 | 20 | 100% factuality target |
| 8 | Stripe trial + magic-link signup, end-to-end for one external user | Week 10-11 | 25 | Stranger-onboarding path |

End of Week 11: V1 is dogfoodable for 6+ weeks already. CWS submission Week 12; CWS review Week 13-14; first 3 betas Week 14-15. **Closed beta complete by Week 16-17, public-launch-ready by Week 17-18.**

### Critical path

```
Slice 1 (V0) → Slice 2 → Slice 3 (eval gate) → Slice 4 (paste send)
                                                    ├→ Slice 5 (overlay)        [PARALLEL]
                                                    ├→ Slice 7 (KB + memory)    [PARALLEL]
                                                    └→ Slice 6 (Compat App OAuth)
                                                          └→ Slice 8 (auth + Stripe)
```

Sequential founder-only work: Slices 1, 2, 3, 6, 8. Everything else can be dispatched to AI subagents in parallel worktrees once Slice 3 lands.

### Definition-of-slice-done

A slice is done when **all** are true. Resist polishing past these:

1. End-to-end real data path works once on your real eBay account (not synthetic).
2. A test exercises the slice from outside its boundary.
3. The slice's data shape is in `packages/shared` as Zod, reusable by future slices.
4. Telemetry exists — slice logs to `llm_calls`, `audit_log`, or stdout enough to debug post-hoc.
5. Failure modes are visible (labeled error envelope; UI surfaces it).
6. Tenant isolation holds if slice touches DB; RLS test passes in CI.
7. You used it for one real task without code changes.
8. You can articulate what the slice taught you in one sentence.

If those are true and you want to keep polishing, you're procrastinating. Move on.

---

## Repo Structure (Day 1 setup)

```
ebay-msg-ai/
  CLAUDE.md                      # project context, conventions
  pnpm-workspace.yaml
  turbo.json
  .github/workflows/             # ci.yml, eval.yml, db-migrate.yml
  packages/
    shared/                      # Zod contracts + inferred types — single source of truth
      src/contracts/
        ingest.ts, drafts.ts, queue.ts, webhooks.ts
    prompts/
      src/builders/              # PURE functions (msg, listing_kb, voice) → prompt
      src/templates/              # versioned: drafting.v1.ts, classifier.v1.ts
      src/policies/               # output filter (forbidden phrases)
      fixtures/                   # 300+ labeled messages, golden drafts
      evals/                      # harness loop, scorers, regression set
    db/
      prisma/schema.prisma
      prisma/migrations/
      src/rls.sql                 # tenant_isolation policies
      src/tenant-middleware.ts
  apps/
    api/                          # Fastify
      src/
        routes/                   # ingest/, queue/, messages/, templates/, webhooks/, auth/
        services/                 # drafting/, classifier/, send-queue/, billing/, memory/
        plugins/                  # auth, rls, idempotency, rate-limit
        jobs/                     # one file per pg-boss job
      test/
        contract/                 # Zod schemas + fixtures
        rls/                      # cross-tenant leak tests (CI gate)
        integration/              # Postgres testcontainers
    extension/                    # MV3
      src/
        background/               # service worker
        content/                  # MutationObserver, in-eBay overlay
        main-world/               # React-state bridge
        offscreen/
        popup/
      test/                       # Playwright against test eBay account
    dashboard/                    # React + Vite + Tailwind
      src/routes/, components/, hooks/, lib/api-client/
      test/                       # vitest + Testing Library
    dev-ui/                       # the V0 paste-and-draft UI; keep forever for debug
  tools/
    eval-runner/                  # CLI: pnpm eval --suite drafting
    fixture-gen/                  # synthesize from labeled CSV
    migration-shadow/              # CI shadow DB check
  docs/
    BusinessPlan_and_PRD_v2.md
    EXECUTION_PLAN.md             # this file
    decisions/                    # ADRs, numbered
    runbooks/                     # CWS submission, ebay-key rotation, incident
    specs/                        # one .md per slice; spec-then-dispatch
```

### Conventions that pay back 10x

- **One `CLAUDE.md` per package.** Each names: stack, conventions, where types live, how to run tests, what NOT to refactor.
- **Zod schemas in `packages/shared/contracts` are the only API truth.** API client, server validation, fixtures, tests all import from here. Renaming a field is a TS error in three packages.
- **No barrel `index.ts` re-exports** outside `packages/shared`. Agents follow real import paths.
- **One job per file** under `apps/api/src/jobs/` — trivially parallelizable across agents.
- **File names match domain nouns** (`drafts.ts`, not `draftsService.ts`).

---

## AI Subagent Parallelization (Worktrees)

Use `git worktree add ../wt-<slug> -b feat/<slug>` per agent. Once API contracts and Prisma schema are frozen (end of Week 5), 2-3 agents can run in parallel.

### 7 truly-independent task triples

1. **Stripe webhook + billing service + pause-subscription endpoint** — billing tables only.
2. **Templates settings page + `/api/v1/templates` GET/PUT + learned-edits list page** — UI/CRUD pair.
3. **eval-runner CLI + fixture generator + golden baseline GH Action** — tooling only.
4. **Listing-KB sync job + JSON normalizer + listings dashboard page** — listings domain.
5. **Audit log + GDPR `DELETE /users/me/data` + PII regex pre-pass + column-encryption helper** — privacy domain.
6. **SSE event stream + dashboard subscriber hook + Resend notification job** — both consume `drafts` events.
7. **Send queue claim/lease + idempotency middleware + rate-limit plugin** — `apps/api/src/plugins/`.

**NOT parallelizable:** anything touching Prisma migrations, RLS policy file, or `packages/shared/contracts`. Linearize those onto a "spine" branch you drive yourself.

**Merge cadence:** every 2-4 hours, rebase each worktree onto main, run full CI locally, merge. Daily integration day where you only merge and resolve. Avoid >24h-stale worktrees.

### Spec-then-dispatch template (200 words max, in `docs/specs/`)

```markdown
## Goal
[One sentence]

## Contracts touched
[List Zod schemas in packages/shared]

## Files allowed to edit
[Explicit file globs]

## Files forbidden to edit
[Explicit "do not touch" list — biggest single lever]

## Tests required
[Contract + behavior + RLS if applicable]

## Eval impact
[None / golden baseline change required]

## Done when
[Falsifiable checklist]
```

The "forbidden to edit" line stops agents from helpfully refactoring your shared types.

---

## CI Stack (set up Week 1)

- **`ci.yml`** (every push): pnpm install (cached) → typecheck → Biome lint → unit + contract tests (Vitest) → integration with Postgres testcontainers → RLS leak suite → build all apps. Required green to merge.
- **`eval.yml`** (on changes under `packages/prompts/**` or `services/drafting/**`): runs eval-runner against fixtures, posts JSON diff comment on PR, fails on regression. Cache Anthropic responses with prompt-hash key for PR speed; full 300-msg set runs nightly.
- **`db-migrate.yml`** (on `prisma/migrations/**`): spins shadow DB, applies migration, runs `prisma migrate diff --exit-code` against main.

Add Renovate (auto-merge patch only). Add Sentry release tracking in CI deploy step.

---

## Solo Founder Code Review (3 layers)

1. **Mechanical** (free, automatic): tsc, Biome, tests, eval. Agent iterates without you.
2. **Adversarial Claude review** in a fresh worktree/session: `gh pr diff | claude` with prompt: *"Review as a skeptical senior engineer. Find tests passing for the wrong reason; silent fallbacks; cross-tenant leak risk; new dependencies; anything not covered by the spec at docs/specs/<slug>.md."* Fresh session = no sycophancy from prior conversation.
3. **Founder eyes-on for 4 things only:** prompt template diffs, RLS policy diffs, Prisma migration diffs, new package.json dependencies. AI mistakes are catastrophic and rare here. Trust the loop everywhere else.

---

## Anti-Patterns to Refuse

### Build-order anti-patterns
1. Building Clerk/Stripe before Slice 3 works (PRD §23 puts them at Week 10 — keep them there).
2. Polishing the dashboard before validating the in-eBay overlay (overlay handles 70% of approvals).
3. Hand-rolling the embedding classifier as an early task. Until Slice 3, ship with one-line heuristic + Sonnet for everything; embeddings come when eval shows cost matters.
4. Building click-simulation send. PRD §14.6: closed-beta-only experimental. Tar pit. Slice 4's paste fallback is V1-sufficient.
5. Designing the analytics dashboard. PRD §14.4: single-number "drafts pending" V1; anything more is V1.5.
6. Auto-promotion of learned phrases. Cut to V1.5. Stop if you find yourself building consistency-ratio logic.
7. Custom brand voice / 30-day backfill / web push. All explicitly cut. Repeat the cuts when you feel the urge.
8. Treating eval harness as week-4 polish. Slice 1 logs token costs to stdout; harness is just `runEval.ts` over fixtures. Set up Day 1.

### AI-coding anti-patterns
1. **Tests passing for the wrong reason.** LLM hardcodes expected values or mocks the function under test. Mitigation: mutation testing on critical paths; spot-audit 3 random tests/week.
2. **Helpful-but-uninvited abstractions.** Agent extracts `BaseRepository`, adds `Result<T,E>` monad. Mitigation: spec includes "Files forbidden to edit" + "No new abstractions"; reject PR on new files outside spec.
3. **Silent fallbacks hiding failures.** Agent wraps Claude call in try/catch returning `{draft:""}`. Mitigation: lint rule banning bare `catch {}`; require explicit `flags`; alert on empty drafts in `llm_calls`.
4. **Dependency creep without security review.** Mitigation: CI fails on package.json change without checkbox in PR; weekly `pnpm audit` + Socket.dev.
5. **Architecture-by-AI for load-bearing decisions.** Agent picks Drizzle over Prisma mid-task. Mitigation: lock stack in root CLAUDE.md, "do not propose alternatives."
6. **Confident lies about runtime.** Agent claims MV3 service worker stays alive (it doesn't). Mitigation: every claim about MV3, eBay DOM, or Anthropic API verified with a runnable script before code.
7. **Prompt-injection blind spots.** Agent concatenates buyer message into system prompt. Mitigation: central `wrapBuyerMessage()` helper as the only allowed path; lint rule on raw `messages.body` reads in `services/drafting/`.
8. **Eval set contamination.** Same fixtures for prompt iteration and evaluation. Mitigation: hold out 60 fixtures named `*.holdout.json`, only loaded by `eval.yml`.
9. **Looks-shipped-but-isn't.** Agent says "all tests pass" but skipped one. Mitigation: CI greps fail on `.skip`/`.only`/`xit`; coverage threshold gate.
10. **Token-efficient laziness.** Long file → agent stubs sections with `// ... existing code`. Mitigation: pre-commit hook rejects files containing `// ... existing` or `/* unchanged */`.

---

## Honest Compression: 18 → 13 Weeks

Where the savings come from:

| Source | Weeks recovered |
|---|---|
| eBay Compat App filed Week 1 not Week 4-8 | 3-4 |
| Lawyer-drafted PP/ToS/DPA started Week 2 not Week 8 | 2-3 (overlap) |
| LLC+EIN+Stripe verification done Weeks 1-4 not Week 8-10 | 1-2 |
| Beta funnel warm before Week 14 (no recruiting scramble) | 1 |
| Email warming starts Week 8 not Week 11 | 0 (removes risk) |
| AI subagents in parallel for CRUD/dashboard pages, Weeks 5-11 | ~2 |
| **Net** | **~5 weeks** |

Hard floors that don't move:
- **Phase 0 (Week 1)** — your judgment, not Claude's
- **Send-path PoC GATE B (Week 6/8-9)** — eBay anti-bot debugging is runtime-only
- **CWS review (~Week 13-14)** — Google's queue does not compress
- **Beta iteration (Weeks 15-18)** — humans run on calendar time

If you compress further, it's by cutting scope, not going faster: drop the in-eBay overlay (would save 1-2 weeks but hurts the daily-use UX), drop SSE (poll every 15s instead — saves a few days), drop Power-tier multi-account from V1.

---

## The 12-Week Parallel Tracks

| Track | Cadence | Founder hrs/wk |
|---|---|---|
| Build (V0 then V1 slices) | Daily | 18-22 |
| YouTube (1 long + 1 Short) | Weekly | 3-4 |
| Newsletter "Reseller's AI Weekly" | Tuesday | 1 |
| Reddit / r/Flipping presence | 30 min/day | 3-4 |
| Beta sourcing + outreach | Wks 6-13 | 2-3 |
| Hand-labeling + eval expansion | Daily, off-keyboard | 1-2 |

Total: ~28-36 hrs/wk for the first 6 weeks, dropping to ~25 once V0 is frozen and audience is compounding.

---

## Decision Gates (don't skip)

| Gate | When | Pass criterion | Action if fail |
|---|---|---|---|
| **Phase 0 GATE A** | End of Week 2 (V0 Day 7-10) | ≥60% of your 300+ labeled messages automatable AND ≥70% of offline drafts score ≥4/5 | Kill the project before V1 build |
| **V0 Success** | 2026-05-24 (Day 21) | 7 consecutive business days using V0, ≥30 min/day saved, ≥60% drafts approved unedited | Re-spec V1 prompt strategy before building |
| **Slice 6 GATE B** | Week 8-9 | eBay Compat App OAuth flow working in test, sends delivering | Ship V1 with prepare-and-paste-only; defer Compat App to V1.5 |
| **CWS approval** | Week 13-14 | Approved | Distribute as unlisted CWS link to first 3 betas while resolving |
| **V1 DoD** | Week 17-18 | All v2 PRD §30 criteria met | Don't public-launch until met |

---

## What "Today" Looks Like

You can't ship a polished SaaS today. You can:

**Right now (today):**
1. Open developer.ebay.com — register account (~30 min).
2. Email Anthropic Trust Center for ZDR (~15 min).
3. Sign up for Wyoming LLC via Northwest Registered Agent (~30 min).
4. Pick your top 3 brand-name candidates and run USPTO TESS on them (~1 hr).

**Tonight or tomorrow morning (V0 Day 1):**
5. `mkdir ebay-msg-ai && cd ebay-msg-ai && git init && pnpm init`.
6. Build Slice 1: paste page → Fastify → Claude → see draft in browser. 4-8 hours of focused work.

**End of next week (Day 10):**
7. You're using your own AI message assistant on real eBay messages every day.

That's "shipping today." The proper SaaS lands at closed beta around 2026-08-09 (~13 weeks). Public launch around 2026-09-15 (~19 weeks).

---

## One-Liner Reminders

- Vertical slices, not horizontal layers
- V0 in 10 days; V1 in 13 weeks; both real timelines
- File eBay Compat App **today** — it's the single biggest schedule lever
- Multi-tenant + RLS from Day 1 of V1; never retrofit
- Zod contracts in `packages/shared` = single source of truth
- One CLAUDE.md per package + spec-then-dispatch = parallel AI subagents work
- Phase 0 GATE A is your kill switch; honor it
- Eval harness from Day 1; eval gate in CI; never regress silently
- Refuse helpful-but-uninvited AI refactors via "Files forbidden to edit"
- Don't believe "shipped my SaaS in 4 weeks with Claude" — different scope or didn't ship

---

*End of Execution Plan v1.0. Pair with PRD v2.0.*

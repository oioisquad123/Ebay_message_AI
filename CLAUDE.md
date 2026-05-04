# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**V0 complete — all 7 days landed (2026-05-03).** Full personal-tool-of-one shipped end-to-end: Chrome extension reads eBay Messages + listing pages → idempotent ingest → multi-tenant SQLite → AI drafting via OpenRouter (Claude Haiku 4.5 default) → React inbox with approve/edit/skip/regenerate/send flow → eval harness with classifier macro-F1 + factuality + flag-policy metrics.

**215 tests across 6 packages, all green.** Live eval baseline (8 cases, real Claude inference): 87.5% category accuracy, 0.95 macro-F1, 100% flag policy, 0.23¢/draft.

Authoritative docs:
- `BusinessPlan_and_PRD_v2.md` — authoritative spec (§§0-31). Read §0 ("What Changed From v1.0") before doing anything.
- `EXECUTION_PLAN.md` — execution-strategy companion: V0 (Days 1-10), V1 vertical slices (Weeks 4-13), parallel calendar tracks, anti-patterns.
- `BusinessPlan_and_PRD_eBay_AI_Message_Assistant.md` — v1.0, **superseded**. Several v1 decisions are explicitly reversed in v2. Do not cite v1 details.

## Project layout (V0 complete)

```
ebay-msg-ai/
  packages/
    shared/        @app/shared       Zod contracts (single source of truth)
    prompts/       @app/prompts      Prompt builder, PII scrubber, output filter,
                                     brand voice, message + listing fixtures, eval cases
  apps/
    api/           @app/api          Fastify + better-sqlite3 + openai SDK→OpenRouter
                                     POST /api/v1/dev/draft (paste-and-draft)
                                     POST /api/v1/ingest/messages (idempotent batch)
                                     POST /api/v1/ingest/listings (idempotent UPSERT)
                                     GET  /api/v1/extension/selectors (versioned)
                                     GET  /api/v1/messages?status=...&category=...&cursor=...
                                     GET  /api/v1/messages/:id
                                     POST /api/v1/messages/:id/draft
                                     POST /api/v1/messages/:id/regenerate
                                     POST /api/v1/messages/:id/approve (+ learned_edits)
                                     POST /api/v1/messages/:id/skip
                                     POST /api/v1/messages/:id/mark-sent
    extension/     @app/extension    MV3 Chrome ext: SW + content scripts (messages + listings)
                                     + popup + parseMessages + parseListing + API client
    dashboard/     @app/dashboard    React 19 + Vite 6 + Tailwind v4 + TanStack Query + wouter
                                     /, /messages/:id, /dev (paste page kept for fallback)
  tools/
    eval-runner/   @tools/eval-runner  CLI: classifier macro-F1 + factuality + flag-policy
                                       8 eval cases under packages/prompts/evals/cases/
```

V0 uses SQLite (`apps/api/data/v0.db`); V1 graduates to Postgres + pgvector + RLS. V0 hardcodes `userId="u-bayu"` per request; the column exists on every tenant table so contracts survive V0→V1 unchanged.

## Build, test, run commands

```sh
# Install (uses pnpm; corepack enable if needed)
pnpm install

# Run everything
pnpm test                              # vitest across all packages
pnpm typecheck                         # tsc --noEmit across all packages
pnpm -r build                          # produce dist/ where applicable

# Run a single package
pnpm --filter @app/api test
pnpm --filter @app/prompts test
pnpm --filter @app/dashboard test

# Dev servers (parallel)
pnpm dev                               # api on :3000 + dashboard on :5173
pnpm dev:api                           # api only
pnpm dev:ui                            # dashboard only

# Build the Chrome extension
pnpm --filter @app/extension build     # produces apps/extension/dist/
# Then chrome://extensions → Developer mode → Load unpacked → apps/extension/dist

# Run the eval harness (server must be up)
pnpm dev:api &                          # in one terminal
pnpm eval                               # in another — runs 8 cases, writes eval-report.json
# or with explicit absolute paths if cwd differs:
pnpm --filter @tools/eval-runner exec tsx src/run.ts \
  --cases "$PWD/packages/prompts/evals/cases" \
  --fixtures "$PWD/packages/prompts/fixtures" \
  --report eval-report.json

# Smoke-test the API (env loaded from apps/api/.env via Node 22 --env-file-if-exists)
pnpm --filter @app/api start
curl http://127.0.0.1:3000/api/v1/health
curl http://127.0.0.1:3000/api/v1/extension/selectors
```

Native module note: `better-sqlite3` requires a build step. `package.json` lists it under `pnpm.onlyBuiltDependencies` so `pnpm install` rebuilds the native binding automatically. If a fresh clone fails to start the API, run `pnpm rebuild better-sqlite3`.

## Authoritative reference sections (in v2 PRD)

| Topic | Section |
|---|---|
| What changed from v1 (read first) | §0 |
| V1 feature scope | §14 |
| Out of V1 scope | §15 |
| System architecture diagram | §17 |
| Locked tech stack | §18 |
| Data model (~24 tables, multi-tenant) | §19 |
| API spec | §20 |
| eBay policy + GDPR + EU AI Act Art. 50 | §21 |
| Token & cost optimization | §22 |
| 16-18-week roadmap with decision gates | §23 |
| Coding-agent guardrails | §26 |
| Threat model + tenant isolation | §27 |
| Phase 0 verification checklist (blocks Phase 1) | §28 |
| Eval harness spec | §29 |
| Definition of Done for V1 | §30 |

## Hard constraints — never violate

These are reversed-from-v1 or non-negotiable per v2. A request that contradicts any of these should be pushed back on, not implemented.

1. **Send path = eBay Compatible App + OAuth + Sell API.** Click-simulation is closed-beta-only fallback. Prepare-and-paste is the never-fail backup. Do **not** implement click-sim as the V1 default. (§0, §14.6)
2. **Manifest V3 only.** Service worker (terminates aggressively — design for it), content scripts, MAIN-world bridge, offscreen doc as needed. No background pages. Ingestion is content-script + MutationObserver, not "always-on poller". (§0, §14.2, §26)
3. **Never auto-send in V1.** Seller approves every draft.
4. **Multi-tenant from Day 1.** Postgres RLS on every tenant table + Prisma middleware enforcing `user_id` + a CI test that fails on cross-tenant leakage. Do not retrofit. (§26, §27)
5. **Per-user budget caps wired before first external user.** Atomic `UPDATE usage_counters … RETURNING` checked before every Claude call. (§26)
6. **Idempotency on every POST.** `Idempotency-Key` header; store + replay response. (§26)
7. **Send queue uses claim/lease.** Atomic claim, ~2-min lease, multi-tab safe. (§26)
8. **Selectors are data, not code.** Server-served and hot-patchable. CWS forbids remotely-hosted code, so the config payload is *data*, not JS. (§23, §26)
9. **Don't over-engineer V1.** One Fastify service, one Postgres, one React SPA. No microservices, no Kubernetes. (§26)
10. **Audit log table from D1.** Every approve/send/edit with `payload_hash`. (§26)
11. **Platform abstraction from D1.** `platform` enum on every tenant table; do not name tables `ebay_*`. V2 is Poshmark/Depop/Vinted. (§23, §26)
12. **PII scrubbing default-on.** Regex pre-pass before any Claude call; opt-out requires explicit warning. (§26)
13. **Prompt-injection defense from D1.** Delimited untrusted-content tags + system-prompt rule + output filter for forbidden phrases. (§26)
14. **Eval harness blocks deploy.** ≥80% on held-out set, factuality 100%, LLM-judge mean ≥4.0. No category drops >5 F1 points. (§29)
15. **Anthropic ZDR agreement before any EU seller.** File request Week 1. (§28)
16. **Encryption at rest** via libsodium secretbox column-level on `messages.body`, `drafts.draft_text/edited_text`, `buyer_memory.history_summary`. Per-tenant DEK wrapped by KMS. Wire keys in env from D1. (§18)

## Locked tech stack (do not suggest alternatives)

Per §18:

- Extension: MV3, vanilla JS or Preact, `webextension-polyfill`; Playwright for DOM-stability tests
- Backend: Node.js + **Fastify** (not Express)
- Job queue: **pg-boss** on existing Postgres (not Redis/BullMQ)
- DB: PostgreSQL (Neon or Supabase) + **pgvector** + RLS
- ORM: Prisma + tenant-scope middleware
- Frontend: React + Vite + TailwindCSS + TanStack Query
- LLM: Claude API; embeddings via Voyage `voyage-3` or OpenAI `text-embedding-3-small`
- Auth: Clerk or Supabase Auth — never custom
- Hosting: Railway/Render (backend), Vercel/Cloudflare Pages (dashboard)
- Email: Resend with SPF/DKIM/DMARC, ≥2-week warmup pre-launch
- Observability: Sentry with `beforeSend` PII scrubber, PostHog, pino → Better Stack or Axiom
- Payments: Stripe + Stripe Tax
- CI: GitHub Actions with shadow-database migration check

## Phase gating — what's allowed when

Per §23 (roadmap is now 16-18 weeks; v1's 12 was fiction):

| Phase | Weeks | Deliverable | Gate |
|---|---|---|---|
| 0 | 0-1 | Hand-label ≥300 messages; complete §28 verification | **Gate A**: ≥60% automatable AND ≥70% drafts ≥4. If <50%, **kill** |
| 1 | 2-3 | MV3 PoC + Fastify+Prisma+pg-boss+pgvector+RLS skeleton + prompt-builder pure function | Multi-tenancy enforced from first ingest endpoint |
| 2 | 4-5 | Classifier + drafting + eval in CI; founder dashboard | Eval ≥75%; factuality 100% |
| 3 | 6-7 | eBay Compat App OAuth + paste fallback | **Gate B**: OAuth flow on test account; paste fallback validated |
| 4 | 8 | Legal docs, CWS account, LLC, Stripe Tax, buffer | Eval at 150 messages |
| 5 | 9-12 | Memory capture (no auto-promotion), Clerk, Stripe trial, observability, **CWS submission** | Onboarding completable in <10 min by non-founder |
| 6 | 13-18 | PWA scaffold, beta with 3 → 8-12 sellers | DoD met (§30) |

If a request is for Phase 4+ functionality during Phase 1, push back. The roadmap is part-time-realistic; scope creep kills it.

## V1 scope cuts — deferred to V1.5, do not build

Per §23 even if asked:

1. Auto-promotion of learned phrases — capture only in V1
2. Custom brand voice — 3 presets only (Friendly, Professional, Casual)
3. Full 30-90 day backfill preview — last 200 / 7 days only
4. Full analytics dashboard — single "drafts pending" number
5. Browser push notifications — email-approve only
6. Full PWA — mobile-responsive only

## Skills tailored to this project

Two project-specific skills live in `~/.claude/skills/`, auto-discoverable by description:

- **`chrome-extension-mv3`** — MV3 service worker lifecycle, message passing, host permissions, click simulation, `externally_connectable`, alarm-driven polling. Phase 1 (Wk 2-3) and beyond.
- **`embeddings-classifier`** — cosine-similarity routing: exemplars, centroid vs top-k, two-check confidence, calibration via eval set, asymmetric error costs, post-classification policy layer. Phase 2 (Wk 4-5).

Other relevant existing skills (load on demand): `claude-api`, `database-schema-design`, `zod`, `idempotency-handling`, `api-rate-limiting`, `clerk-auth`, `payment-gateway-integration`, `tanstack-query`, `tanstack-table`, `tailwind-v4-shadcn`, `vitest-testing`, `playwright`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`.

## Definition of Done for V1

Per §30, V1 ships only when **all** are true:

- 3 non-founder sellers used it 14 consecutive days, ≥50 real drafts each
- ≥70% of drafts approved with ≤20% character edits
- Zero double-sends, zero cross-tenant leaks, zero eBay account warnings
- Onboarding completable end-to-end without founder assistance
- Stripe live-mode subscription created, charged, renewed once on a real card
- Eval harness ≥80% on a 200-message held-out set, run on every prompt change
- p95 draft latency <8s; backend uptime ≥99% over trailing 30 days
- Privacy Policy + ToS + DPA published; CWS listing live and approved
- eBay Compatible App approved (or prepare-and-paste validated as primary)
- Anthropic ZDR signed (if any EU sellers in beta)
- Founder hasn't touched the codebase for 7 consecutive days and nothing broke

Month-6 / 100-paying-users is a marketing milestone, not a product DoD.

## When to update this file

- Phase 1 lands → add real build/test/lint commands and project layout.
- Eval harness ships (Wk 4) → add the command to run it.
- CWS submission (Wk 12) → add load-unpacked + reload instructions for the extension.
- New PRD revision → re-derive the hard constraints from the new §0; supersede the table above.

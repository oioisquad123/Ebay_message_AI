# CLAUDE.md — @app/api

V0 backend: Fastify, better-sqlite3, OpenRouter (Claude Haiku 4.5 default).
One Fastify factory in `src/server.ts`, one schema in `src/schema.sql`, one
LLM wrapper in `src/llm.ts`, one route module per domain in `src/routes/`.
V1 swaps SQLite → Postgres + Prisma + RLS; tables already carry `user_id`
so contracts graduate unchanged.

## Stack

- Node 22 (`--env-file-if-exists=.env`, `--import tsx`)
- Fastify 5.2 + `@fastify/cors` 10
- better-sqlite3 11.7 (schema applied on every `openDb()`; WAL mode)
- `openai` 4.77 SDK pointed at OpenRouter (`baseURL` override in `llm.ts`)
- Zod 3.24 for request/response validation
- Vitest 3.2

## Where types live

`@app/shared` is the contract source. Routes parse with `*Schema.parse(...)`
and return `*Response`-typed values. Prompt construction + output filtering
come from `@app/prompts`. Locally defined types are internal helpers only
(e.g. `MessageRow` mirroring a SELECT shape). Never re-export shared types.

## How to run

```sh
# from repo root
pnpm --filter @app/api test
pnpm --filter @app/api typecheck
pnpm --filter @app/api dev    # tsx --watch on :3000
pnpm --filter @app/api start  # one-shot
```

Needs `apps/api/.env` with `OPENROUTER_API_KEY=...`. Override the model via
`OPENROUTER_MODEL`, the DB path via `SQLITE_PATH` (default `./data/v0.db`).
Run `pnpm rebuild better-sqlite3` if the native binding isn't built.

## Conventions

- One route module per file under `src/routes/` (`messages.ts`, `ingest.ts`,
  `ingestListings.ts`, `devDraft.ts`, `selectors.ts`). Each exports a
  `FastifyPluginAsync` and registers under `/api/v1/...`.
- Cross-route domain logic lives in `src/services/` (e.g. `drafting.ts` is
  reused by `messages.ts` and `devDraft.ts`).
- Tests live next to the file they cover. Route tests use
  `buildServer({ db: openDb(":memory:"), llmOptions: { client: stub } })`.
- Multi-table writes run inside a single `db.transaction`.
- `services/drafting.ts` is the only place that should READ `messages.body`;
  routes operate on `messages.pii_scrubbed_body`.
- `idempotency.ts` is called manually by routes (no Fastify plugin); the
  hash-and-record happens INSIDE the domain-write transaction.
- Update `PRICING_CENTS_PER_M` when swapping default models so audit
  numbers stay honest.

## Do NOT

- Do NOT add a state-mutating POST without `Idempotency-Key` handling — see
  `routes/ingest.ts` (per root CLAUDE.md #6).
- Do NOT bypass `V0_USER_ID` scoping. Every WHERE on a tenant table includes
  `user_id = ?` — V1's RLS only works if V0 already filtered (root #4).
- Do NOT auto-send. `/mark-sent` flips `drafts.status='sent'` only after
  explicit approve + paste-confirm (root #1, #3).
- Do NOT log raw `messages.body`, draft text, or prompt contents at info+.
- Do NOT call the LLM from a route handler directly — go through
  `services/drafting.ts` so `llm_calls` audit rows are written (root #10).
- Do NOT introduce a second DB or a job queue. V0 is one Fastify + one
  SQLite (root #9); pg-boss + Postgres are V1.
- Do NOT migrate schema in code outside `src/schema.sql` — the file is
  reapplied on every open and must stay idempotent.

## Tests

Vitest in-process. `db.test.ts` covers schema bootstrap; `idempotency.test.ts`
covers replay/conflict; `llm.test.ts` covers the OpenRouter wrapper with a
stub client; `routes/*.route.test.ts` covers HTTP behavior end-to-end through
`buildServer`. Add a route test per route plus a service-level test if it
delegates non-trivially. No live OpenRouter calls in CI — the eval harness
handles live drafting separately.

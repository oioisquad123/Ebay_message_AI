# eBay AI Message Assistant

Chrome extension + backend + dashboard SaaS that helps high-volume eBay sellers (V1 ICP: vintage clothing) handle inbound buyer messages with AI-drafted, listing-aware replies in their own voice.

**Status (2026-05-03):** **V0 complete — all 7 days landed.** Chrome extension reads eBay Messages + listing pages → idempotent ingest → multi-tenant SQLite → AI drafting via OpenRouter (Claude Haiku 4.5 default) → React inbox with approve/edit/skip/regenerate/send flow → eval harness with macro-F1 + factuality + flag-policy metrics. **215 tests across 6 packages, all green.** Live eval baseline: 87.5% category accuracy, 0.95 macro-F1, 0.23¢/draft. See `EXECUTION_PLAN.md` for the V0→V1 roadmap.

## Authoritative docs

- [`BusinessPlan_and_PRD_v2.md`](./BusinessPlan_and_PRD_v2.md) — product spec (§§0-31; read §0 first)
- [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) — V0 (10 days) + V1 (13 weeks) execution strategy
- [`CLAUDE.md`](./CLAUDE.md) — hard constraints + build commands for AI-assisted development

## Quick start

Requires Node 22+ and pnpm 10+ (`corepack enable && corepack prepare pnpm@latest --activate`).

```sh
git clone <this-repo> && cd ebay-msg-ai
pnpm install
pnpm test                              # 67 tests, all green
pnpm typecheck
```

### Run the V0 paste-and-draft loop

```sh
# 1. Set your Anthropic API key
echo 'ANTHROPIC_API_KEY=sk-ant-...' > apps/api/.env

# 2. Start the API + dashboard in parallel
pnpm dev
# API:       http://127.0.0.1:3000
# Dashboard: http://127.0.0.1:5173
```

Open `http://127.0.0.1:5173` and paste a buyer message + a listing JSON blob. Click **Generate draft**. You'll see the AI draft, confidence, category, used facts, flags, and cost (cents).

### Run only the API and curl it

```sh
pnpm dev:api
curl -X POST http://127.0.0.1:3000/api/v1/dev/draft \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "userId": "u-bayu",
      "buyerUsername": "vintage_collector_99",
      "body": "Hi! What is the chest measurement and do you ship to the UK?",
      "ebayItemId": "234567890123"
    },
    "listingKb": {
      "ebay_item_id": "234567890123",
      "title": "Vintage 90s Levi denim jacket size M",
      "size": "M",
      "measurements": { "chest": "22 in", "length": "26 in" },
      "shipping": { "domestic_days": "1-2", "intl_available": true, "intl_days": "7-14" }
    },
    "brandVoice": "friendly"
  }'
```

### Run the eval harness against your local API

With the API running (`pnpm dev:api`), in a second terminal:

```sh
pnpm eval
```

Runs all 8 eval cases against live OpenRouter, writes `eval-report.json`. Last live run: **87.5% category accuracy, 0.95 macro-F1, 100% flag policy, 1.83¢ total cost** for 8 cases.

### Load the Chrome extension (V0 Day 2 — content scripts for messages + listings)

```sh
# 1. Build the extension
pnpm --filter @app/extension build

# 2. Chrome → chrome://extensions
#    → toggle "Developer mode" (top right)
#    → click "Load unpacked"
#    → select /Users/bayuhidayat/Ebay_message_AI/apps/extension/dist
```

**Two content scripts auto-run:**
1. On `https://www.ebay.com/mesg/*` (your inbox) — extracts visible message threads on click of "Sync now" in the popup
2. On `https://www.ebay.com/itm/*` (any listing detail page) — auto-extracts the listing into `listings.kb_json` whenever you visit one

Both fetch DOM selector config from the API (`GET /api/v1/extension/selectors`) and POST to `/api/v1/ingest/messages` and `/api/v1/ingest/listings` respectively, with `Idempotency-Key`. The default selectors target `data-testid` attributes — **real eBay's DOM uses different selectors and you'll need to update them on first run**. Inspect the eBay page in DevTools, then update `apps/api/src/selectors/default.ts` (bump `version` to invalidate the cached config) and restart the API.

### The full V0 daily flow

1. Open eBay in Chrome with the extension loaded
2. Visit your `mesg/` inbox → extension's popup → **Sync now** → messages flow into SQLite
3. Visit each item page (`/itm/...`) → extension auto-captures listing context
4. Open the dashboard at http://127.0.0.1:5173 → see ingested messages in the inbox
5. Click a message → **Generate draft** (or it's already drafted) → review the AI's reply
6. Edit if needed → **Approve & send (copy + open eBay)** → text on clipboard, eBay messages page opens, paste, send manually, marked sent in dashboard
7. For complaints/refunds → **Skip & flag** → seller handles manually

### Test the ingest endpoint without Chrome

```sh
pnpm dev:api
curl -X POST http://127.0.0.1:3000/api/v1/ingest/messages \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: smoke-test-001' \
  -d '{
    "protocol_version": 1,
    "captured_at": "2026-05-03T12:00:00.000Z",
    "messages": [
      {
        "userId": "u-bayu",
        "buyerUsername": "vintage_collector_99",
        "body": "Hi! Will this fit me? US Medium.",
        "ebayItemId": "234567890123",
        "ebayMessageId": "msg-001"
      }
    ]
  }'
```

Re-run with the same `Idempotency-Key` → returns `replayed: true` (cached response, no new row). Run with a new key but the same `ebayMessageId` → returns `deduped: 1` (partial unique index catches it).

## Project layout

```
ebay-msg-ai/
  packages/
    shared/                 # Zod contracts (incl. ingest, selectors)
    prompts/                # prompt builder + PII scrubber + output filter + fixtures
  apps/
    api/                    # Fastify + better-sqlite3 + openai SDK → OpenRouter
                            #   POST /api/v1/dev/draft
                            #   POST /api/v1/ingest/messages (idempotent)
                            #   GET  /api/v1/extension/selectors (versioned)
    extension/              # MV3 Chrome extension: SW + content script + popup
    dashboard/              # React 19 + Vite + Tailwind v4 + TanStack Query
  tools/
    eval-runner/            # V0 stub; real harness V0 Day 7-10
  data/                     # local SQLite files (gitignored)
```

## What V0 does (and doesn't)

V0 is a **personal tool of one** — it runs locally on your machine, single-user, and lets you dogfood the assistant on your own real eBay messages while the SaaS infrastructure (eBay Compatible App approval, Anthropic ZDR, lawyer docs, LLC) processes in calendar parallel.

| V0 has | V0 deliberately skips |
|---|---|
| Paste-and-draft loop (`POST /api/v1/dev/draft`) | Auth, JWT, multi-tenancy, RLS |
| Anthropic prompt caching | Stripe, plans, trials, billing |
| `messages`, `drafts`, `listings`, `learned_edits`, `llm_calls` tables (SQLite) | pgvector embeddings classifier |
| Prompt-injection defense (untrusted-content tags) | Compatible App OAuth (V0 Day 6+) |
| PII scrubbing default-on (regex pre-pass) | Auto-promotion of learned phrases (V1.5) |
| Output policy filter (forbidden phrases) | Custom brand voice (V1.5) |
| 3 brand-voice presets (Friendly/Professional/Casual) | Right-rail in-eBay overlay (V0 Day 4+) |
| `llm_calls` audit trail with cost tracking | Email/web push (V1) |
| `userId` column on every tenant table (hardcoded `u-bayu` in V0; survives to V1) | Mobile PWA (V1.5) |

## Tests

```sh
pnpm test
```

Currently green: **215 tests across 6 packages.**

| Package | Tests | What it covers |
|---|---|---|
| `@app/shared` | 18 | Zod contracts (ingest batches, listing ingest, selectors, message lifecycle, approve/edit) |
| `@app/prompts` | 34 | Prompt builder, PII scrubber, output filter, brand voice |
| `@app/api` | 80 | DB schema + idempotency + 13 routes: dev draft, ingest messages, ingest listings, selectors, GET messages list/detail, draft/regenerate/approve/skip/mark-sent + drafting service |
| `@app/extension` | 35 | parseMessages + parseListing against fixture HTML (JSDOM), API client incl. ingestListings |
| `@app/dashboard` | 33 | Router shell, InboxPage, MessageDetailPage, DevDraftPage, mutation hooks with Idempotency-Key |
| `@tools/eval-runner` | 15 | Macro-F1 metrics, eval case schema, runEval CLI with mocked fetch |

## Hard constraints (do not violate)

See `CLAUDE.md` §"Hard constraints" for the canonical list. Key ones:

1. **Send path = eBay Compatible App + OAuth + Sell API** (closed-beta-only click-sim fallback). V0 ships prepare-and-paste only.
2. **Multi-tenant from Day 1** — every tenant table has `user_id`. V1 adds Postgres RLS + Prisma middleware.
3. **PII scrubbing default-on** before any Claude call.
4. **Prompt-injection defense from D1** — buyer messages wrapped in `<buyer_message_untrusted>` tags + system-prompt rule + output filter.
5. **`llm_calls` audit log from D1** — every Claude call logged with prompt hash, model, tokens, cost.
6. **No auto-send.** Seller approves every draft.

## License

Proprietary — all rights reserved (Bayu).

# CLAUDE.md — @app/extension

Manifest V3 Chrome extension: a service worker (`src/sw.ts`), two content
scripts (`src/content/index.ts` for Messages, `src/content/listing.ts` for
item pages), a popup (`src/popup/`), and a small library
(`src/lib/`: `api.ts`, `parseMessages.ts`, `parseListing.ts`, `uuid.ts`).
Built with `@crxjs/vite-plugin` against `manifest.config.ts`.

## Stack

- MV3 (`manifest_version: 3`), service-worker background, no background page
- Vite 6 + `@crxjs/vite-plugin` 2
- TypeScript 5.7 (ESM)
- `@types/chrome` 0.0.287 for the Chrome APIs
- Vitest 3.2 with jsdom for content-script + parser tests
- Sole runtime dep on workspace: `@app/shared` (for contracts + Zod)

## Where types live

`@app/shared/contracts` provides `IngestMessageBatch`, `IngestListingBatch`,
`SelectorConfig`, and the response types — all parsed at runtime via
`*Schema.parse(...)` after every `fetch` (see `src/lib/api.ts`). Local
types stay internal to the file that owns them (e.g. parser output shapes
in `parseMessages.ts`). The selector config is fetched from
`/api/v1/extension/selectors` and validated with `SelectorConfigSchema`.

## How to run

```sh
# from repo root
pnpm --filter @app/extension test
pnpm --filter @app/extension typecheck
pnpm --filter @app/extension build      # writes apps/extension/dist/
pnpm --filter @app/extension dev        # vite dev server (rare)
```

After a build, load unpacked at `chrome://extensions` → Developer mode →
Load unpacked → `apps/extension/dist`. Reload the extension AND the eBay
tab after every rebuild — content scripts don't hot-reload across
manifest changes. The API base URL persists in `chrome.storage.local` under
`apiBaseUrl`; default is `http://localhost:3000`.

## Conventions

- The SW is a thin coordinator: routes popup→content messages, sets the
  badge on a 5-min `chrome.alarms` wake-hint. No polling, no fetch, no
  module-level state — MV3 terminates SWs aggressively.
- Ingestion lives in the content script via `MutationObserver` with a 1s
  debounce. Triggered on DOM churn and on `{ type: "syncNow" }` from the
  popup (forwarded by the SW).
- One file per concern under `src/lib/`; tests are siblings.
- Selectors are fetched once per page load and cached in content-script
  module scope; bumping server-side `version` invalidates clients.
- Every POST sends a fresh `Idempotency-Key` from `uuidv4()`.
- HTML fixtures for parser tests live in `test/fixtures/`.

## Do NOT

- Do NOT keep state in SW module-level variables — it WILL be torn down
  (root #2). Persist via `chrome.storage.local` if it must survive.
- Do NOT add a polling loop in the SW or content script (root #2).
- Do NOT POST without an `Idempotency-Key` header (root #6).
- Do NOT store API keys, tokens, or PII in `chrome.storage.*`. Only the
  API base URL and cached `SelectorConfig` belong there.
- Do NOT hardcode CSS selectors. They come from the server config — CWS
  forbids remotely-hosted code, but the JSON config is data (root #8).
- Do NOT request `host_permissions` beyond eBay + the configured API base.
- Do NOT click-simulate the eBay send button. V0 is prepare-and-paste; V1
  uses Compatible App OAuth + Sell API (root #1).
- Do NOT inject into the page MAIN world unless required; parsers run in
  the isolated-world DOM.

## Tests

Vitest with `environment: jsdom`, includes `src/**/*.test.ts` and
`test/**/*.test.ts`. Parser tests load HTML fixtures and assert against the
extracted `IngestMessageBatch` / `IngestListingBatch`. The API client tests
use vitest's `vi.fn()` to stub `fetch`. Add a fixture under `test/fixtures/`
when supporting a new eBay DOM variant; add a parser test that locks the
extracted shape.

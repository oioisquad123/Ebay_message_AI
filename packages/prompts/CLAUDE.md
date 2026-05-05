# CLAUDE.md — @app/prompts

Pure functions that build the LLM prompt, scrub PII, filter forbidden output,
and resolve brand-voice fragments. Zero IO, zero network, no SDK imports —
the API package owns the actual Claude call. Also hosts the eval fixtures
(`fixtures/messages/`, `fixtures/listings/`) and case files
(`evals/cases/*.json`) consumed by `@tools/eval-runner`.

## Stack

- TypeScript 5.7 (ESM)
- Zod 3.24 (re-exported types from `@app/shared`)
- Vitest 3.2 with snapshot testing (`src/__snapshots__/`)
- No runtime deps beyond `@app/shared` and `zod`

## Where types live

`@app/shared` owns every input/output type. `buildDraftPrompt` takes a
`DraftRequest` and returns a `BuiltPrompt` (defined locally —
internal-to-this-package). `checkOutputPolicy` returns `DraftFlag[]` from
`@app/shared`. Do not redefine `DraftFlag`, `BrandVoicePreset`, `Category`,
`ListingKb`, etc. here.

## How to run

```sh
# from repo root
pnpm --filter @app/prompts test
pnpm --filter @app/prompts typecheck
```

Snapshots live under `src/__snapshots__/`. When prompt structure changes
intentionally, update them with `pnpm --filter @app/prompts test -u` and
review the diff before committing — every byte of the system prompt affects
prompt-cache hit rate downstream.

## Conventions

- One file per concern: `buildDraftPrompt.ts`, `scrubPii.ts`,
  `checkOutputPolicy.ts`, `brandVoice.ts`. Each has a sibling `*.test.ts`.
- `buildDraftPrompt` is pure: same `DraftRequest` in → same `BuiltPrompt`
  out. The 16-char `promptHash` is a SHA-256 of stable-stringified inputs.
- The `SYSTEM_PROMPT` constant is intentionally stable (cacheable). Per-
  request data goes in `cachedBlocks` (brand voice, listing KB) or
  `userMessage` (buyer body, history summary) — never inlined into the
  system string.
- `scrubPii` runs BEFORE wrap-into-untrusted-tags. Returns `{ scrubbed, hits }`.
- `checkOutputPolicy` lower-cases internally; rules are word-boundary aware.
- Eval fixtures (`fixtures/messages/*.json`, `fixtures/listings/*.json`) and
  cases (`evals/cases/*.json`) are checked-in test data — see eval-runner's
  CLAUDE.md for the contract.

## Do NOT

- Do NOT concatenate the buyer message into the system prompt. It must go
  inside `<buyer_message_untrusted>...</buyer_message_untrusted>` in the
  user turn (per root CLAUDE.md #13 — prompt-injection defense from D1).
- Do NOT call any LLM SDK from this package. The API package owns the
  network. Keep this package importable from a worker/edge runtime.
- Do NOT add fields to `BuiltPrompt` without considering cache impact —
  every byte that varies per-request must live in `userMessage`, not
  `systemPrompt` or `cachedBlocks`.
- Do NOT relax PII patterns to fix a fixture. If a regex over-redacts in
  practice, the seller still sees the original (per `scrubPii.ts` header
  note). False positives beat leaks (per root CLAUDE.md #12).
- Do NOT mutate `DraftRequest` inputs; treat them as readonly.
- Do NOT add brand-voice presets beyond the three the PRD locks (Friendly,
  Professional, Casual) — per root CLAUDE.md V1.5-cuts list, custom voices
  are explicitly deferred.

## Tests

Snapshot tests in `buildDraftPrompt.test.ts` lock the system prompt and
overall `BuiltPrompt` shape. `scrubPii.test.ts` and `checkOutputPolicy.test.ts`
are table-driven — add a row for every new pattern. Brand-voice fragments
have a small lookup test. Eval *cases* are NOT exercised here; they run
under `@tools/eval-runner`. When changing rules, run `pnpm test` plus the
eval harness against a live API to confirm no factuality regression.

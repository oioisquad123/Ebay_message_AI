# CLAUDE.md — @tools/eval-runner

CLI eval harness. Loads JSON cases from `packages/prompts/evals/cases/`,
calls the running API's `POST /api/v1/dev/draft`, scores each response
(macro-F1, factuality, flag-policy, ideal-excerpt overlap), writes
`eval-report.json`. Per root CLAUDE.md #14 this is a deploy gate.

## Stack

- TypeScript 5.7 (ESM)
- `tsx` 4.19 as the entry runner (no build step)
- Zod 3.24 (re-exported types from `@app/shared`)
- Vitest 3.2
- Workspace deps: `@app/shared` (contracts), `@app/prompts` (fixtures live
  under that package — referenced by path, not imported as code)

## Where types live

Eval-case + report shapes are Zod-defined locally in `src/schema.ts`
(tool-internal, not API). The runner reuses `@app/shared` for `Category`,
`DraftFlag`, `DraftRequest`, `DraftResponse`, and validates the API
response with `DraftResponseSchema`.

## How to run

```sh
# from repo root
pnpm --filter @tools/eval-runner test
pnpm --filter @tools/eval-runner typecheck

# eval against a running API (start it in a separate terminal)
pnpm dev:api &
pnpm eval

# explicit paths if cwd is unusual
pnpm --filter @tools/eval-runner exec tsx src/run.ts \
  --cases "$PWD/packages/prompts/evals/cases" \
  --fixtures "$PWD/packages/prompts/fixtures" \
  --report eval-report.json
```

Default API base is `http://127.0.0.1:3000`. The API must be running and
have `OPENROUTER_API_KEY` configured — this is a *live* eval that costs
real OpenRouter credits per case (~0.23¢/draft on Haiku 4.5).

## Conventions

- One file per concern: `run.ts` (CLI + orchestration), `metrics.ts`
  (pure macro-F1), `schema.ts` (Zod for cases/report); sibling tests.
- `runEval(opts)` is the testable surface — accepts injected `fetchImpl`,
  `log`, `errLog` so tests run without network or stdout noise.
- Exit codes are explicit: 0 clean, 1 regression, 2 API unreachable,
  3 schema/load error. Tests assert on these.
- Reports are JSON; metrics rounded to 4 decimals for diff-friendly output.
- Cases are atomic JSON files; filename is the case slug.

## Do NOT

- Do NOT write to `packages/prompts/fixtures/` or `evals/cases/` — they are
  versioned test data; runner is read-only.
- Do NOT hardcode API responses or fall back to a stub on connection
  failure. If the API is down, exit 2 and let CI fail loudly.
- Do NOT enable `--print-drafts` in CI — full draft text is noisy and may
  contain PII-shaped fixture data.
- Do NOT relax `DEFAULT_OPTS` thresholds (0.8 accuracy, 1.0 factuality) to
  pass a failing run; they are deploy gates (root #14).
- Do NOT call the LLM directly. Go through the API so `llm_calls` and
  `drafts` rows are written the same as in production (root #10).
- Do NOT score factuality by string-includes on the draft; use the model's
  `used_facts` array against case `must_use_facts`.
- Do NOT add a per-case retry loop; flakiness must surface so the prompt
  or fixture gets fixed.

## Tests

Vitest. `metrics.test.ts` covers macro-F1 edge cases. `schema.test.ts`
covers case-file parsing + default fills. `run.test.ts` drives `runEval`
with a stub `fetchImpl`, validates the `EvalReport`, and asserts exit
codes for regression / unreachable / load-error branches. Add a test
alongside any change to scoring or exit-code logic.

# CLAUDE.md — @app/shared

The single source of truth for cross-package contracts. Every Zod schema and
TypeScript type that crosses a package boundary lives here. Per
EXECUTION_PLAN §"Conventions that pay back 10x", renaming a field here should
break TypeScript in three other packages — that is the design.

## Stack

- TypeScript 5.7 (ESM, NodeNext)
- Zod 3.24 — runtime validation + type inference
- No runtime deps beyond zod; no build step (consumers import `./src/*.ts`)

## Where types live

Right here. Every contract is a Zod schema in `src/contracts/*.ts`, with a
matching `z.infer` type export. Files are domain-noun named:
`buyerMessage.ts`, `draft.ts`, `ingest.ts`, `ingestListing.ts`, `listingKb.ts`,
`messages.ts`, `selectors.ts`, `brandVoice.ts`, `category.ts`. The barrel
`src/contracts/index.ts` re-exports everything; root `src/index.ts` re-exports
the barrel and also exposes a namespaced `contracts.*` form. This is the only
package permitted to use barrel `index.ts` re-exports.

## How to run

```sh
# from repo root
pnpm --filter @app/shared test
pnpm --filter @app/shared typecheck
```

No dev server, no build. Consumers import directly from source via the
workspace alias `@app/shared` (or `@app/shared/contracts`).

## Conventions

- One file per domain noun. No `*Schema.ts` / `*Types.ts` suffix files.
- Every schema is exported alongside its `z.infer` type — both have the
  same root name (`DraftRequestSchema` + `DraftRequest`).
- Enums use `z.enum([...] as const)` and export both the schema and the
  string-union type.
- Default values live in the schema (`.default(...)`) so the same defaults
  apply to API validation, fixtures, and tests.
- `contracts.test.ts` round-trips representative payloads through every
  schema — add a case there when adding a contract.
- Don't introduce optional fields without a Zod default unless `null` is
  semantically meaningful; nullable + default null is preferred over
  `.optional()` for API stability.

## Do NOT

- Do NOT define API types in any other package. Per root CLAUDE.md the
  monorepo has one truth; this is it. If `apps/api` or `apps/dashboard`
  needs a shape, add it here.
- Do NOT add behavior. This package is contracts only — no fetch helpers,
  no formatters, no business logic. Those live in consumer packages.
- Do NOT depend on any workspace package. `@app/shared` sits at the bottom
  of the import graph; circular deps from here are an instant red flag.
- Do NOT break Zod inference by typing schemas as `ZodSchema<MyType>` or
  asserting their output type. Let `z.infer` do the work; if a type comes
  out wrong, the schema is wrong.
- Do NOT loosen a schema (`.passthrough()`, `.catchall(z.any())`, removing
  `.strict()`) without auditing every consumer — strictness is what catches
  cross-package drift early.
- Do NOT add `*.fixture.ts` here; fixtures live in `packages/prompts/fixtures/`
  (eval data) or per-app test directories (test data).

## Tests

Run with `pnpm --filter @app/shared test`. The single `contracts.test.ts`
exercises round-tripping (parse → infer → re-parse) and the explicit
defaults each schema applies. When adding a new schema, add a parse-success
test plus a parse-failure test for at least one required field. There are
no integration tests in this package — by design.

# CLAUDE.md — @app/dashboard

V0 React inbox: list messages, view a thread, generate / regenerate / edit /
approve / skip / mark-sent. Three routes (`/`, `/messages/:id`, `/dev`) in
`src/App.tsx`. `/dev` is the paste-and-draft debug fallback (kept forever
per EXECUTION_PLAN).

## Stack

- React 19 + ReactDOM 19 (StrictMode in `src/main.tsx`)
- Vite 6 with `@vitejs/plugin-react` and `@tailwindcss/vite`
- Tailwind CSS v4 (config-less; loaded via the Vite plugin)
- `@tanstack/react-query` 5.62 for server state
- `wouter` 3.9 for routing (no react-router)
- Vitest 3.2 + jsdom + `@testing-library/react` 16.1
- Sole workspace dep: `@app/shared` (for contract Zod schemas)

## Where types live

`@app/shared/contracts` is the only source for backend-facing types
(`MessageDetail`, `MessageListResponse`, `DraftSnapshot`,
`ApproveDraftResponse`, etc.). `src/lib/api.ts` validates every response with
`*Schema.safeParse(...)` and throws a structured `ApiError` on
non-2xx or schema mismatch. Component-local UI state types stay in the
component file. Don't redeclare backend shapes — import them.

## How to run

```sh
# from repo root
pnpm --filter @app/dashboard test
pnpm --filter @app/dashboard typecheck
pnpm --filter @app/dashboard dev      # :5173, proxies /api → :3000
pnpm --filter @app/dashboard build
```

`vite.config.ts` proxies `/api` to `http://localhost:3000`, so run the
API (`pnpm dev:api`) in parallel. Tailwind v4 has no `tailwind.config.js`;
add custom utilities via `@layer` in `src/index.css`. Tests run under
jsdom; `src/test-setup.ts` imports `@testing-library/jest-dom/vitest`.

## Conventions

- One route component per file in `src/routes/`, each with a sibling
  `*.test.tsx`.
- All server interaction goes through hooks in `src/lib/api.ts`:
  `useMessageList`, `useMessageDetail`, `useGenerateDraft`,
  `useRegenerateDraft`, `useApproveDraft`, `useSkipMessage`, `useMarkSent`.
  Components call hooks; they never call `fetch` directly.
- Every mutation generates a fresh `Idempotency-Key` via `crypto.randomUUID()`
  inside the hook. Components do not pass the key.
- Cache keys live in `queryKeys` (`api.ts`); invalidate via
  `queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) })` after
  mutations.
- `src/lib/format.ts` holds presentation helpers; Tailwind classes go
  inline (no CSS modules).

## Do NOT

- Do NOT define backend response types here. If a shape is missing, add it
  to `@app/shared/contracts`.
- Do NOT call `fetch` outside `src/lib/api.ts`. If behavior is missing, add
  a hook there.
- Do NOT bypass `useApproveDraft` / `useMarkSent` / `useSkipMessage` — you
  lose idempotency keys, validation, and cache invalidation.
- Do NOT auto-send. The UI never POSTs `/mark-sent` without an explicit
  user click after `/approve` (root #3).
- Do NOT introduce a state library (Redux, Zustand, Jotai). TanStack Query
  for server state, `useState`/`useReducer` for local UI.
- Do NOT swap wouter for another router (root #9 — don't over-engineer V0).
- Do NOT add `tailwind.config.js`; v4 reads `@theme` from CSS.
- Do NOT inline raw `messages.body` into URLs, analytics, or logs.

## Tests

Vitest + Testing Library. Component tests render under a fresh
`QueryClientProvider` and a `MemoryLocation` from wouter, stub `fetch`
with `vi.fn()`, and assert on rendered text + dispatched calls. Add a
test for any new user-visible interaction (button click → mutation +
invalidation). Snapshot tests are not used here — DOM assertions only.

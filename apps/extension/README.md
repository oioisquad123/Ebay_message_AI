# @app/extension — V0 Dev

MV3 Chrome extension for the eBay AI Message Assistant. Personal-tool-of-one
paste-and-draft companion.

## Build

```sh
pnpm --filter @app/extension build
```

This produces `apps/extension/dist/` with the manifest, service worker,
content script, and popup bundled.

## Load unpacked into Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select `/Users/bayuhidayat/Ebay_message_AI/apps/extension/dist`

The extension is now installed. Pin it from the toolbar puzzle-piece icon.

## Switching the API base URL

The extension reads `apiBaseUrl` from `chrome.storage.local`. Default is
`http://localhost:3000`. To change:

1. Open the extension's service worker DevTools from `chrome://extensions`
2. Run: `chrome.storage.local.set({ apiBaseUrl: "https://your-host" })`
3. Reload the extension

The popup footer always shows the current URL.

## Test

```sh
pnpm --filter @app/extension test
pnpm --filter @app/extension typecheck
```

## V0 limitations

- The fixture HTML at `test/fixtures/ebay-mesg-page.html` uses
  `data-testid` attributes for stability. Real eBay's DOM uses opaque
  classnames that drift; if the extension stops extracting on a real page,
  the fix is to update the `SelectorConfig` served by
  `/api/v1/extension/selectors` (selectors are data, not code — CLAUDE.md #8).
- The popup shows a single sync stat from the most recent sync. No history.
- `userId` is hardcoded to `"u-bayu"`. Multi-tenant rewiring lands V1.
- Send path is paste-and-draft only. No Sell-API integration in V0.

## Architecture (V0)

```
src/
  sw.ts              service worker — thin router; alarms wake-hint badge only
  content/index.ts   on eBay Messages: bootstraps selectors, MutationObserver,
                     handles syncNow → POST /api/v1/ingest/messages
  popup/             pure-DOM popup; "Sync now" button + last-sync stats
  lib/
    parseMessages.ts pure function: Document + SelectorConfig → BuyerMessage[]
    api.ts           getSelectors / ingestMessages with Idempotency-Key header
    uuid.ts          v4 generator with crypto.randomUUID fallback
```

Per CLAUDE.md #2, the service worker is intentionally thin — MV3 terminates
SWs aggressively, so all real work happens in the content script. There is
no background polling loop; ingestion is event-driven (MutationObserver
plus the popup's Sync button).

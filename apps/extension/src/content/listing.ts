/**
 * Content script — runs on eBay listing detail pages (`*.ebay.com/itm/*`).
 *
 * Per CLAUDE.md #2 (MV3 service worker terminates aggressively): all extraction
 * and POSTing happens here in the content-script context, not the SW.
 *
 * Per the spec, listing pages do NOT mutate like the messages list, so this
 * script is one-shot on `document_idle` — no MutationObserver. Server dedupe
 * (the `(user_id, ebay_item_id)` UNIQUE constraint) makes a fresh per-load
 * UUID safe; if Bayu reloads the same page we just hit the idempotency cache.
 *
 * Failure mode: log loudly, abort silently. The user sees nothing on this
 * page; the popup can later expose status if needed.
 */

import type {
  IngestListingBatch,
  SelectorConfig,
} from "@app/shared/contracts";
import { createApiClient, readApiBaseUrl } from "../lib/api.js";
import { parseListing } from "../lib/parseListing.js";
import { uuidv4 } from "../lib/uuid.js";

const TAG = "[ebay-ai-ext-listing]";
const SELECTOR_CACHE_KEY = "selectorConfig";

console.log(TAG, "loaded on", location.href);

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    const cfg = await loadSelectors();
    console.log(TAG, "selectors v" + cfg.version, "loaded");

    const { listingKb, warnings } = parseListing(
      document,
      cfg,
      location.href,
    );
    if (warnings.length > 0) {
      console.warn(TAG, "parse warnings:", warnings);
    }
    if (!listingKb) {
      console.log(TAG, "no listing extracted; aborting silently");
      return;
    }
    console.log(TAG, "extracted listing:", listingKb);

    const batch: IngestListingBatch = {
      protocol_version: 1,
      captured_at: new Date().toISOString(),
      selector_config_version: cfg.version,
      listings: [
        {
          userId: "u-bayu",
          sourceUrl: location.href,
          listingKb,
        },
      ],
    };

    const baseUrl = await readApiBaseUrl();
    const api = createApiClient(baseUrl);
    const idemKey = uuidv4();
    const response = await api.ingestListings(batch, idemKey);
    console.log(TAG, "ingest ok:", response);
  } catch (err) {
    console.error(TAG, "bootstrap failed:", err);
  }
}

/**
 * Try the API first, fall back to chrome.storage cache. Mirrors the messages
 * content script but without writing the cache here — the messages script
 * already keeps it warm. We only read it as a fallback.
 */
async function loadSelectors(): Promise<SelectorConfig> {
  try {
    const baseUrl = await readApiBaseUrl();
    const api = createApiClient(baseUrl);
    const fresh = await api.getSelectors();
    chrome.storage.local.set({ [SELECTOR_CACHE_KEY]: fresh });
    return fresh;
  } catch (err) {
    console.warn(TAG, "selector fetch failed, trying cache:", err);
    const cached = await readCachedSelectors();
    if (cached) return cached;
    throw err;
  }
}

async function readCachedSelectors(): Promise<SelectorConfig | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([SELECTOR_CACHE_KEY], (items) => {
      const v = items?.[SELECTOR_CACHE_KEY];
      if (v && typeof v === "object") {
        resolve(v as SelectorConfig);
      } else {
        resolve(null);
      }
    });
  });
}

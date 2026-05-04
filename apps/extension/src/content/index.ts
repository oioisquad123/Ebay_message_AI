/**
 * Content script — runs on eBay Messages pages.
 *
 * Per CLAUDE.md #2: ingestion is content-script + MutationObserver, NOT a
 * background poller. The SW is just a router. All extraction, batching,
 * and POSTing happens here.
 *
 * Design:
 *   1. On page load, fetch & cache the SelectorConfig.
 *   2. Wire up a MutationObserver that debounces re-extraction on DOM churn.
 *   3. Listen for `{ type: "syncNow" }` from the SW (forwarded from popup),
 *      extract messages, POST them with a fresh Idempotency-Key.
 *
 * No long-running loops; the observer is event-driven.
 */

import type { IngestMessageBatch, SelectorConfig } from "@app/shared/contracts";
import { createApiClient, readApiBaseUrl } from "../lib/api.js";
import { parseMessages } from "../lib/parseMessages.js";
import { uuidv4 } from "../lib/uuid.js";

const TAG = "[ebay-ai-ext content]";
const SELECTOR_CACHE_KEY = "selectorConfig";
const DEBOUNCE_MS = 1000;

let cachedSelectors: SelectorConfig | null = null;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

console.log(TAG, "loaded on", location.href);

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    cachedSelectors = await loadSelectors();
    console.log(TAG, "selectors v" + cachedSelectors.version, "loaded");
    setupObserver();
  } catch (err) {
    console.error(TAG, "bootstrap failed:", err);
  }
}

async function loadSelectors(): Promise<SelectorConfig> {
  // Try cache first — selectors are data, refresh is best-effort.
  const cached = await readCachedSelectors();
  // Always try the network; fall back to cache.
  try {
    const baseUrl = await readApiBaseUrl();
    const api = createApiClient(baseUrl);
    const fresh = await api.getSelectors();
    chrome.storage.local.set({ [SELECTOR_CACHE_KEY]: fresh });
    return fresh;
  } catch (err) {
    console.warn(TAG, "selector fetch failed, using cache:", err);
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

function setupObserver(): void {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const result = extractNow();
      console.log(
        TAG,
        "observer re-extract:",
        result.messages.length,
        "msgs,",
        result.warnings.length,
        "warnings",
      );
    }, DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  console.log(TAG, "MutationObserver attached");
}

function extractNow(): { messages: IngestMessageBatch["messages"]; warnings: string[] } {
  if (!cachedSelectors) {
    return { messages: [], warnings: ["selectors not yet loaded"] };
  }
  const { messages, warnings } = parseMessages(document, cachedSelectors);
  return { messages, warnings };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object" || !("type" in msg)) return false;

  if (msg.type === "syncNow") {
    void handleSyncNow().then(sendResponse).catch((err) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return true; // async sendResponse
  }

  return false;
});

async function handleSyncNow(): Promise<unknown> {
  console.log(TAG, "syncNow received");
  if (!cachedSelectors) {
    try {
      cachedSelectors = await loadSelectors();
    } catch (err) {
      return {
        ok: false,
        error: `could not load selectors: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const { messages, warnings } = extractNow();
  console.log(TAG, "extracted", messages.length, "messages,", warnings.length, "warnings");
  if (warnings.length > 0) console.warn(TAG, "warnings:", warnings);

  if (messages.length === 0) {
    return { ok: true, response: null, warnings, note: "no messages found" };
  }

  const batch: IngestMessageBatch = {
    protocol_version: 1,
    captured_at: new Date().toISOString(),
    selector_config_version: cachedSelectors.version,
    messages,
  };

  try {
    const baseUrl = await readApiBaseUrl();
    const api = createApiClient(baseUrl);
    const idemKey = uuidv4();
    const response = await api.ingestMessages(batch, idemKey);
    console.log(TAG, "ingest ok:", response);
    return { ok: true, response, warnings };
  } catch (err) {
    console.error(TAG, "ingest failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

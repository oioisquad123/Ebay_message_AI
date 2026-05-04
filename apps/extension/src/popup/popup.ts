/**
 * Popup script — pure DOM, no framework. Sends `syncNow` to the SW and
 * renders the response. Stays under ~150 lines on purpose; popups should
 * boot instantly.
 */

import { DEFAULT_API_BASE_URL } from "../lib/api.js";

const TAG = "[ebay-ai-ext popup]";

const pill = document.getElementById("state-pill") as HTMLSpanElement;
const btn = document.getElementById("sync-btn") as HTMLButtonElement;
const stats = document.getElementById("stats") as HTMLDivElement;
const apiUrlEl = document.getElementById("api-url") as HTMLSpanElement;
const extLink = document.getElementById("ext-link") as HTMLAnchorElement;

type State = "loading" | "idle" | "syncing" | "error";

function setState(s: State, label?: string): void {
  pill.dataset.state = s;
  pill.textContent = label ?? s;
}

function renderResult(payload: unknown): void {
  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    (payload as { ok: unknown }).ok === true
  ) {
    const resp = (payload as { response?: unknown }).response;
    if (resp && typeof resp === "object") {
      const r = resp as {
        inserted?: number;
        deduped?: number;
        skipped?: number;
      };
      stats.classList.remove("error");
      stats.textContent = `inserted: ${r.inserted ?? 0} • deduped: ${r.deduped ?? 0} • skipped: ${r.skipped ?? 0}`;
    } else {
      stats.classList.remove("error");
      const note = (payload as { note?: string }).note;
      stats.textContent = note ?? "Sync completed (no messages found).";
    }
    setState("idle");
  } else {
    const err =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "unknown error";
    stats.classList.add("error");
    stats.textContent = "Error: " + err;
    setState("error");
  }
}

btn.addEventListener("click", () => {
  setState("syncing");
  stats.classList.remove("error");
  stats.textContent = "Syncing…";
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: "syncNow" }, (response) => {
    btn.disabled = false;
    if (chrome.runtime.lastError) {
      stats.classList.add("error");
      stats.textContent = "Error: " + chrome.runtime.lastError.message;
      setState("error");
      return;
    }
    console.log(TAG, "syncNow response:", response);
    renderResult(response);
  });
});

extLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions" });
});

(async function init(): Promise<void> {
  try {
    const items = await new Promise<{ apiBaseUrl?: string }>((resolve) => {
      chrome.storage.local.get(["apiBaseUrl"], (i) => resolve(i ?? {}));
    });
    apiUrlEl.textContent = items.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    setState("idle");
  } catch (err) {
    console.warn(TAG, "init failed:", err);
    apiUrlEl.textContent = DEFAULT_API_BASE_URL;
    setState("idle");
  }
})();

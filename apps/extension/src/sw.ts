/**
 * MV3 service worker — thin coordinator only. Per CLAUDE.md #2, the SW
 * terminates aggressively, so we MUST NOT keep state in module-level
 * variables and MUST NOT run polling loops. All real work happens in the
 * content script; the SW just routes messages and lights the badge.
 */

import { DEFAULT_API_BASE_URL } from "./lib/api.js";

const TAG = "[ebay-ai-ext sw]";

chrome.runtime.onInstalled.addListener(async () => {
  console.log(TAG, "onInstalled");

  // Default the API base URL once if absent. Don't clobber a user override.
  chrome.storage.local.get(["apiBaseUrl"], (items) => {
    if (!items?.apiBaseUrl) {
      chrome.storage.local.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
      console.log(TAG, "set default apiBaseUrl =", DEFAULT_API_BASE_URL);
    }
  });

  // Register a 5-min wake hint. The handler does nothing heavy — it only
  // sets a badge if an eBay messages tab is open. No polling, no fetch.
  try {
    await chrome.alarms.create("wake-hint", { periodInMinutes: 5 });
  } catch (err) {
    console.warn(TAG, "alarm create failed:", err);
  }
});

chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "wake-hint") return;
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://www.ebay.com/mesg/*", "https://mesg.ebay.com/*"],
    });
    if (tabs.length > 0) {
      chrome.action.setBadgeText({ text: String(tabs.length) });
      chrome.action.setBadgeBackgroundColor({ color: "#0654ba" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    console.warn(TAG, "wake-hint badge update failed:", err);
  }
});

/**
 * Route popup → active tab content script. The popup sends
 *   { type: "syncNow" }
 * and gets back whatever the content script returns.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object" || !("type" in msg)) {
    return false;
  }

  if (msg.type === "syncNow") {
    forwardSyncNow(sendResponse);
    return true; // keep sendResponse alive for async reply
  }

  return false;
});

async function forwardSyncNow(
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      sendResponse({ ok: false, error: "no active tab" });
      return;
    }
    if (
      !tab.url ||
      !(tab.url.startsWith("https://www.ebay.com/mesg") ||
        tab.url.startsWith("https://mesg.ebay.com"))
    ) {
      sendResponse({
        ok: false,
        error: "active tab is not an eBay Messages page",
      });
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "syncNow" });
    sendResponse(response);
  } catch (err) {
    console.warn(TAG, "syncNow forward failed:", err);
    sendResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import type { SelectorConfig } from "@app/shared/contracts";
import { parseMessages, selectorMatch } from "./parseMessages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  "../../test/fixtures/ebay-mesg-page.html",
);

/**
 * Selector config matching the data-testid attributes used by the fixture.
 * In production this comes from /api/v1/extension/selectors. We replicate
 * it here to keep the test independent of the API package.
 */
const FIXTURE_SELECTORS: SelectorConfig = {
  version: 1,
  page_match: ["https://www.ebay.com/mesg/*"],
  selectors: {
    message_list_container: {
      primary: '[data-testid="message-list"]',
      fallbacks: [],
    },
    message_thread_row: {
      primary: '[data-testid="message-thread"]',
      fallbacks: [],
    },
    message_body: {
      primary: '[data-testid="message-body"]',
      fallbacks: [],
    },
    buyer_username: {
      primary: '[data-testid="buyer-username"]',
      fallbacks: [],
    },
    item_id: {
      primary: '[data-testid="message-thread"]',
      attribute: "data-item-id",
      fallbacks: [],
    },
    timestamp: {
      primary: '[data-testid="timestamp"]',
      attribute: "datetime",
      fallbacks: [],
    },
    message_id: {
      primary: '[data-testid="message-thread"]',
      attribute: "data-message-id",
      fallbacks: [],
    },
  },
  debug_notes: {},
};

let fixtureHtml: string;
beforeAll(() => {
  fixtureHtml = readFileSync(FIXTURE_PATH, "utf8");
});

function loadFixture(html: string = fixtureHtml): Document {
  return new JSDOM(html).window.document;
}

describe("parseMessages — happy path with fixture", () => {
  it("extracts exactly 3 messages", () => {
    const doc = loadFixture();
    const { messages, warnings } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it("extracts the correct buyerUsernames", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages.map((m) => m.buyerUsername)).toEqual([
      "vintage_collector_99",
      "denimfan_82",
      "picky_buyer_42",
    ]);
  });

  it("extracts ebayMessageId from data-message-id attribute", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages.map((m) => m.ebayMessageId)).toEqual([
      "msg-2026-05-03-001",
      "msg-2026-05-02-014",
      "msg-2026-05-01-007",
    ]);
  });

  it("extracts ebayItemId from data-item-id attribute", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages.map((m) => m.ebayItemId)).toEqual([
      "234567890123",
      "234567890456",
      "234567890789",
    ]);
  });

  it("extracts message body text and normalizes whitespace", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages[0]?.body).toBe(
      "Hi! Will this fit me? I'm a US Medium and I've been burned by vintage sizing before. What's the actual chest measurement?",
    );
    expect(messages[1]?.body).toBe(
      "Do you ship to Australia? And how long does it usually take?",
    );
    expect(messages[2]?.body).toBe(
      "Could you do $25 instead of $35? Combined shipping with the jacket I bought last week?",
    );
  });

  it("parses timestamps as ISO strings", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages[0]?.receivedAt).toBe("2026-05-03T10:30:00.000Z");
    expect(messages[1]?.receivedAt).toBe("2026-05-02T14:00:00.000Z");
    expect(messages[2]?.receivedAt).toBe("2026-05-01T08:15:00.000Z");
  });

  it("hardcodes userId to u-bayu (V0 personal-tool)", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    for (const m of messages) {
      expect(m.userId).toBe("u-bayu");
    }
  });

  it("does NOT include header or footer content", () => {
    const doc = loadFixture();
    const { messages } = parseMessages(doc, FIXTURE_SELECTORS);
    for (const m of messages) {
      expect(m.body).not.toContain("eBay nav stuff");
      expect(m.body).not.toContain("eBay footer");
      expect(m.buyerUsername).not.toContain("eBay nav");
      expect(m.buyerUsername).not.toContain("eBay footer");
    }
  });
});

describe("parseMessages — degenerate inputs", () => {
  it("returns empty + warning when message_list_container is absent", () => {
    const doc = loadFixture("<!doctype html><html><body><div></div></body></html>");
    const { messages, warnings } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages).toEqual([]);
    expect(warnings).toContain("no message list container found");
  });

  it("returns empty + warning when container is present but has no thread rows", () => {
    const doc = loadFixture(
      '<!doctype html><html><body><section data-testid="message-list"></section></body></html>',
    );
    const { messages, warnings } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages).toEqual([]);
    expect(warnings.some((w) => w.includes("no message thread rows"))).toBe(true);
  });

  it("skips a row with missing body and emits a warning", () => {
    // Mutate a copy of the fixture to remove one body
    const broken = fixtureHtml.replace(
      /<p data-testid="message-body">[\s\S]*?<\/p>/,
      "<p data-testid=\"message-body\"></p>",
    );
    const doc = loadFixture(broken);
    const { messages, warnings } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages).toHaveLength(2);
    expect(
      warnings.some((w) => w.includes("missing or empty message body")),
    ).toBe(true);
  });

  it("skips a row with missing buyer username and emits a warning", () => {
    const broken = fixtureHtml.replace(
      /<span data-testid="buyer-username">[^<]*<\/span>/,
      '<span data-testid="buyer-username"></span>',
    );
    const doc = loadFixture(broken);
    const { messages, warnings } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages).toHaveLength(2);
    expect(
      warnings.some((w) => w.includes("missing or empty buyer username")),
    ).toBe(true);
  });

  it("returns empty + warning for a totally empty fixture", () => {
    const doc = loadFixture("<!doctype html><html><body></body></html>");
    const { messages, warnings } = parseMessages(doc, FIXTURE_SELECTORS);
    expect(messages).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("selectorMatch", () => {
  it("returns the primary match when present", () => {
    const doc = loadFixture(
      '<!doctype html><html><body><div class="primary">A</div></body></html>',
    );
    const el = selectorMatch(doc, { primary: ".primary" });
    expect(el?.textContent).toBe("A");
  });

  it("falls back through the fallbacks list", () => {
    const doc = loadFixture(
      '<!doctype html><html><body><div class="fb">A</div></body></html>',
    );
    const el = selectorMatch(doc, {
      primary: ".missing",
      fallbacks: [".also-missing", ".fb"],
    });
    expect(el?.textContent).toBe("A");
  });

  it("returns null when nothing matches", () => {
    const doc = loadFixture("<!doctype html><html><body></body></html>");
    const el = selectorMatch(doc, { primary: ".missing", fallbacks: [".also"] });
    expect(el).toBeNull();
  });
});

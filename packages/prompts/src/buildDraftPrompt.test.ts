import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  type DraftRequest,
  DraftRequestSchema,
  ListingKbSchema,
} from "@app/shared";
import { buildDraftPrompt } from "./buildDraftPrompt.js";

const FIXTURES_DIR = join(__dirname, "..", "fixtures");

function loadMessageFixture(id: string): {
  body: string;
  ebayItemId: string;
  buyerUsername: string;
} {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "messages", `${id}.json`), "utf8"),
  );
  return {
    body: raw.body,
    ebayItemId: raw.ebayItemId,
    buyerUsername: raw.buyerUsername,
  };
}

function loadListingFixture(id: string) {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "listings", `${id}.json`), "utf8"),
  );
  return ListingKbSchema.parse(raw);
}

function makeRequest(overrides?: Partial<DraftRequest>): DraftRequest {
  const msg = loadMessageFixture("sizing-01");
  const listing = loadListingFixture("vint-501-jacket-001");
  const base: DraftRequest = DraftRequestSchema.parse({
    message: {
      userId: "u-bayu",
      buyerUsername: msg.buyerUsername,
      body: msg.body,
      ebayItemId: msg.ebayItemId,
    },
    listingKb: listing,
    brandVoice: "friendly",
  });
  return { ...base, ...overrides };
}

describe("buildDraftPrompt", () => {
  test("snapshot: builds a stable prompt for the sizing-01 fixture", () => {
    const built = buildDraftPrompt(makeRequest());
    expect(built).toMatchSnapshot();
  });

  test("wraps the buyer body in untrusted-content delimiters", () => {
    const built = buildDraftPrompt(makeRequest());
    expect(built.userMessage).toContain("<buyer_message_untrusted>");
    expect(built.userMessage).toContain("</buyer_message_untrusted>");
    // Body content present between the tags.
    expect(built.userMessage).toMatch(
      /<buyer_message_untrusted>[\s\S]*Levi's jacket[\s\S]*<\/buyer_message_untrusted>/,
    );
  });

  test("system prompt warns the model that untrusted content is data, not instructions", () => {
    const built = buildDraftPrompt(makeRequest());
    expect(built.systemPrompt.toLowerCase()).toContain("data, not instructions");
  });

  test("system prompt forbids off-platform contact and payment redirection", () => {
    const built = buildDraftPrompt(makeRequest());
    const sp = built.systemPrompt.toLowerCase();
    expect(sp).toMatch(/paypal|venmo/);
    expect(sp).toMatch(/off eBay|off-platform|off ebay/i);
  });

  test("system prompt instructs JSON output with the required fields", () => {
    const built = buildDraftPrompt(makeRequest());
    const sp = built.systemPrompt;
    expect(sp).toMatch(/"draft"/);
    expect(sp).toMatch(/"confidence"/);
    expect(sp).toMatch(/"category"/);
    expect(sp).toMatch(/"used_facts"/);
    expect(sp).toMatch(/"flags"/);
  });

  test("system prompt instructs 'let me check' fallback for missing facts", () => {
    const built = buildDraftPrompt(makeRequest());
    expect(built.systemPrompt.toLowerCase()).toContain("let me check");
  });

  test("changing brandVoice produces a different promptHash", () => {
    const a = buildDraftPrompt(makeRequest({ brandVoice: "friendly" }));
    const b = buildDraftPrompt(makeRequest({ brandVoice: "professional" }));
    expect(a.promptHash).not.toBe(b.promptHash);
  });

  test("changing listingKb produces a different promptHash", () => {
    const listingA = loadListingFixture("vint-501-jacket-001");
    const listingB = loadListingFixture("vint-band-tee-014");
    const a = buildDraftPrompt(makeRequest({ listingKb: listingA }));
    const b = buildDraftPrompt(makeRequest({ listingKb: listingB }));
    expect(a.promptHash).not.toBe(b.promptHash);
  });

  test("listing KB block is included as a cache breakpoint when provided", () => {
    const built = buildDraftPrompt(makeRequest());
    const listingBlock = built.cachedBlocks.find((b) =>
      b.content.includes("<listing_kb>"),
    );
    expect(listingBlock).toBeDefined();
    expect(listingBlock?.isCacheBreakpoint).toBe(true);
  });

  test("omits listing KB block when not provided", () => {
    const req = makeRequest();
    const reqNoKb: DraftRequest = {
      ...req,
      listingKb: undefined,
    };
    const built = buildDraftPrompt(reqNoKb);
    expect(built.cachedBlocks.some((b) => b.content.includes("<listing_kb>"))).toBe(
      false,
    );
    // Brand voice block still present.
    expect(built.cachedBlocks.length).toBe(1);
  });

  test("buyerHistorySummary is in user turn, NOT in cached blocks", () => {
    const req = makeRequest({
      buyerHistorySummary:
        "Buyer has bought 3 items in the past 90 days; prefers expedited shipping.",
    });
    const built = buildDraftPrompt(req);
    expect(built.userMessage).toContain("<buyer_history>");
    expect(built.userMessage).toContain("expedited shipping");
    for (const block of built.cachedBlocks) {
      expect(block.content).not.toContain("<buyer_history>");
    }
  });

  test("PII in buyer body is scrubbed before wrapping", () => {
    const req = makeRequest();
    const piiReq: DraftRequest = {
      ...req,
      message: {
        ...req.message,
        body: "Email me at buyer@example.com or call 555-123-4567 about the jacket.",
      },
    };
    const built = buildDraftPrompt(piiReq);
    expect(built.userMessage).not.toContain("buyer@example.com");
    expect(built.userMessage).not.toContain("555-123-4567");
    expect(built.userMessage).toContain("[email]");
    expect(built.userMessage).toContain("[phone]");
  });

  test("promptHash is deterministic for identical inputs", () => {
    const a = buildDraftPrompt(makeRequest());
    const b = buildDraftPrompt(makeRequest());
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.promptHash).toHaveLength(16);
  });
});

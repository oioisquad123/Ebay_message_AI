import { describe, expect, test } from "vitest";
import {
  BrandVoicePresetEnum,
  BuyerMessageSchema,
  CategoryEnum,
  DraftRequestSchema,
  DraftResponseSchema,
  FLAGGED_CATEGORIES,
  IngestMessageBatchSchema,
  IngestResponseSchema,
  ListingKbSchema,
  LlmDraftOutputSchema,
  SelectorConfigSchema,
} from "./index.js";

describe("contracts", () => {
  test("CategoryEnum includes 9 categories per PRD §14.3", () => {
    expect(CategoryEnum.options.length).toBe(9);
  });

  test("flagged categories are returns and complaints", () => {
    expect(FLAGGED_CATEGORIES.has("returns_refunds")).toBe(true);
    expect(FLAGGED_CATEGORIES.has("complaint_dispute")).toBe(true);
    expect(FLAGGED_CATEGORIES.has("sizing_measurements")).toBe(false);
  });

  test("BrandVoicePresetEnum has 3 presets per PRD §14.1 V1", () => {
    expect(BrandVoicePresetEnum.options).toEqual([
      "friendly",
      "professional",
      "casual",
    ]);
  });

  test("BuyerMessageSchema requires userId from D1", () => {
    const result = BuyerMessageSchema.safeParse({
      buyerUsername: "buyer123",
      body: "Will this fit me?",
    });
    expect(result.success).toBe(false);
  });

  test("BuyerMessageSchema accepts a valid message", () => {
    const result = BuyerMessageSchema.safeParse({
      userId: "u-bayu",
      buyerUsername: "buyer123",
      body: "Will this fit me? I'm a US Medium.",
      ebayItemId: "1234567890",
    });
    expect(result.success).toBe(true);
  });

  test("ListingKbSchema accepts vintage-clothing-shaped data", () => {
    const result = ListingKbSchema.safeParse({
      ebay_item_id: "1234567890",
      title: "Vintage Levi's 501 Denim Jacket M",
      condition: "Good — light wear",
      brand: "Levi's",
      size: "M",
      measurements: { chest: "44in", length: "26in" },
      shipping: { domestic_days: "2-3", intl_available: false },
      returns: { accepted: true, window_days: 30, who_pays: "buyer" },
    });
    expect(result.success).toBe(true);
  });

  test("DraftRequestSchema defaults brandVoice to friendly", () => {
    const result = DraftRequestSchema.parse({
      message: {
        userId: "u-bayu",
        buyerUsername: "buyer123",
        body: "Will this fit?",
      },
    });
    expect(result.brandVoice).toBe("friendly");
  });

  test("LlmDraftOutputSchema validates structured Claude output", () => {
    const result = LlmDraftOutputSchema.safeParse({
      draft: "Hi! This jacket measures 44in chest. Should fit a US Medium.",
      confidence: 0.86,
      category: "sizing_measurements",
      used_facts: ["listing.size", "listing.measurements.chest"],
      flags: [],
    });
    expect(result.success).toBe(true);
  });

  test("IngestMessageBatchSchema requires protocol_version, captured_at, ≥1 messages", () => {
    const ok = IngestMessageBatchSchema.safeParse({
      protocol_version: 1,
      captured_at: "2026-05-04T08:00:00.000Z",
      messages: [
        {
          userId: "u-bayu",
          buyerUsername: "buyer123",
          body: "Will this fit?",
          ebayMessageId: "m-1",
        },
      ],
    });
    expect(ok.success).toBe(true);

    const empty = IngestMessageBatchSchema.safeParse({
      protocol_version: 1,
      captured_at: "2026-05-04T08:00:00.000Z",
      messages: [],
    });
    expect(empty.success).toBe(false);

    const wrongProtocol = IngestMessageBatchSchema.safeParse({
      protocol_version: 2,
      captured_at: "2026-05-04T08:00:00.000Z",
      messages: [
        { userId: "u", buyerUsername: "b", body: "hi" },
      ],
    });
    expect(wrongProtocol.success).toBe(false);
  });

  test("IngestResponseSchema validates a typical insert+dedupe payload", () => {
    const result = IngestResponseSchema.safeParse({
      inserted: 2,
      deduped: 1,
      skipped: 0,
      results: [
        { ebay_message_id: "m-1", status: "inserted", message_id: "row-1" },
        { ebay_message_id: "m-2", status: "inserted", message_id: "row-2" },
        { ebay_message_id: "m-3", status: "deduped", message_id: null },
      ],
      idempotency_key: "abc-123",
      replayed: false,
    });
    expect(result.success).toBe(true);
  });

  test("IngestListingBatchSchema accepts a vintage clothing listing", async () => {
    const { IngestListingBatchSchema } = await import("./ingestListing.js");
    const ok = IngestListingBatchSchema.safeParse({
      protocol_version: 1,
      captured_at: "2026-05-04T08:00:00.000Z",
      listings: [
        {
          userId: "u-bayu",
          sourceUrl: "https://www.ebay.com/itm/234567890123",
          listingKb: {
            ebay_item_id: "234567890123",
            title: "Vintage 90s Levi's 501 Jacket",
            size: "M",
            measurements: { chest: "22 in", length: "26 in" },
          },
        },
      ],
    });
    expect(ok.success).toBe(true);

    const empty = IngestListingBatchSchema.safeParse({
      protocol_version: 1,
      captured_at: "2026-05-04T08:00:00.000Z",
      listings: [],
    });
    expect(empty.success).toBe(false);
  });

  test("SelectorConfigSchema accepts an extended config with listing_selectors", () => {
    const result = SelectorConfigSchema.safeParse({
      version: 2,
      page_match: ["https://www.ebay.com/mesg/*"],
      selectors: {
        message_list_container: { primary: "[data-testid='message-list']" },
        message_thread_row: { primary: "[data-testid='message-thread']" },
        message_body: { primary: "[data-testid='message-body']" },
        buyer_username: { primary: "[data-testid='buyer-username']" },
      },
      listing_page_match: ["https://www.ebay.com/itm/*"],
      listing_selectors: {
        title: { primary: "[data-testid='listing-title']" },
        price: { primary: "[data-testid='listing-price']" },
        item_id: {
          primary: "[data-testid='listing-page']",
          attribute: "data-item-id",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test("SelectorConfigSchema accepts a minimal default config", () => {
    const result = SelectorConfigSchema.safeParse({
      version: 1,
      page_match: ["https://www.ebay.com/mesg/*"],
      selectors: {
        message_list_container: { primary: "[data-testid='message-list']" },
        message_thread_row: { primary: "[data-testid='message-thread']" },
        message_body: { primary: "[data-testid='message-body']" },
        buyer_username: { primary: "[data-testid='buyer-username']" },
      },
    });
    expect(result.success).toBe(true);
  });

  test("MessageStatusEnum has the V0 lifecycle states", async () => {
    const { MessageStatusEnum } = await import("./messages.js");
    expect(MessageStatusEnum.options).toEqual([
      "no_draft",
      "drafted",
      "approved",
      "sent",
      "skipped",
    ]);
  });

  test("MessageListQuerySchema coerces limit string to int and defaults to 50", async () => {
    const { MessageListQuerySchema } = await import("./messages.js");
    const r = MessageListQuerySchema.parse({ limit: "10" });
    expect(r.limit).toBe(10);
    const d = MessageListQuerySchema.parse({});
    expect(d.limit).toBe(50);
  });

  test("ApproveDraftRequestSchema accepts both bare-approve and edit-and-approve", async () => {
    const { ApproveDraftRequestSchema } = await import("./messages.js");
    expect(ApproveDraftRequestSchema.safeParse({}).success).toBe(true);
    expect(
      ApproveDraftRequestSchema.safeParse({ editedText: "Hi! Updated text." })
        .success,
    ).toBe(true);
  });

  test("MessageDetailSchema accepts a fully-populated detail with draft", async () => {
    const { MessageDetailSchema } = await import("./messages.js");
    const r = MessageDetailSchema.safeParse({
      message: {
        id: "m-1",
        user_id: "u-bayu",
        buyer_username: "vintage_collector_99",
        body: "Will this fit?",
        pii_scrubbed_body: "Will this fit?",
        ebay_item_id: "234567890123",
        ebay_message_id: "msg-001",
        thread_id: null,
        category: "sizing_measurements",
        received_at: "2026-05-03T10:30:00.000Z",
      },
      listing: {
        ebay_item_id: "234567890123",
        title: "Vintage 90s Levi 501 Jacket M",
        kb_json: { ebay_item_id: "234567890123", title: "..." },
      },
      draft: {
        id: "d-1",
        version: 1,
        draft_text: "Hi! It measures 44 inches.",
        edited_text: null,
        category: "sizing_measurements",
        confidence: 0.95,
        used_facts: ["listing.measurements.chest"],
        flags: [],
        model: "anthropic/claude-haiku-4-5",
        status: "drafted",
        generated_at: "2026-05-03T10:31:00.000Z",
        approved_at: null,
        sent_at: null,
        skipped_at: null,
        cost_cents: 0.18,
      },
      status: "drafted",
      buyer_history_count: 0,
    });
    expect(r.success).toBe(true);
  });

  test("DraftResponseSchema requires telemetry fields", () => {
    const result = DraftResponseSchema.safeParse({
      draft: "Hi!",
      confidence: 0.9,
      category: "generic_greeting",
      used_facts: [],
      flags: [],
      model: "claude-sonnet-4-7",
      tokens_in: 1234,
      tokens_out: 56,
      cache_read_tokens: 800,
      cost_cents: 0.65,
      generated_at: "2026-05-04T08:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

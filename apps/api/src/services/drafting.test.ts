import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mock @app/prompts BEFORE the helper imports it transitively.
vi.mock("@app/prompts", () => ({
  buildDraftPrompt: vi.fn((input: { message: { body: string } }) => ({
    systemPrompt: "SYSTEM",
    cachedBlocks: [{ content: "VOICE", isCacheBreakpoint: true }],
    userMessage: `BUYER: ${input.message.body}`,
    promptHash: "hash-1",
  })),
  scrubPii: vi.fn((text: string) => ({
    scrubbed: text,
    redactionCount: 0,
  })),
  checkOutputPolicy: vi.fn(() => []),
  getBrandVoiceFragment: vi.fn(() => "fragment"),
}));

const { openDb, closeDb } = await import("../db.js");
const { buildDraftForMessage } = await import("./drafting.js");
const { V0_USER_ID } = await import("../constants.js");

interface MockResponse {
  draft: string;
  category: string;
  confidence?: number;
  used_facts?: string[];
  flags?: string[];
}

function makeMockClient(responses: MockResponse[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(async () => {
          const r = responses[Math.min(i, responses.length - 1)]!;
          i += 1;
          return {
            id: `gen-${i}`,
            model: "anthropic/claude-haiku-4-5",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    draft: r.draft,
                    confidence: r.confidence ?? 0.9,
                    category: r.category,
                    used_facts: r.used_facts ?? [],
                    flags: r.flags ?? [],
                  }),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 100,
              total_tokens: 1100,
            },
          };
        }),
      },
    },
  };
}

interface InsertMessageArgs {
  body: string;
  pii: string;
  ebayItemId?: string;
  buyerUsername?: string;
}

function insertTestMessage(
  db: ReturnType<typeof openDb>,
  args: InsertMessageArgs,
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO messages (id, user_id, buyer_username, body, pii_scrubbed_body,
                           ebay_item_id, ebay_message_id, thread_id, category,
                           received_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
  ).run(
    id,
    V0_USER_ID,
    args.buyerUsername ?? "test_buyer",
    args.body,
    args.pii,
    args.ebayItemId ?? null,
    new Date().toISOString(),
  );
  return id;
}

function insertTestListing(
  db: ReturnType<typeof openDb>,
  ebayItemId: string,
  kb: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT INTO listings (id, user_id, ebay_item_id, kb_json, last_synced_at)
       VALUES (?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    V0_USER_ID,
    ebayItemId,
    JSON.stringify({ ebay_item_id: ebayItemId, ...kb }),
    new Date().toISOString(),
  );
}

describe("buildDraftForMessage", () => {
  it("uses pii_scrubbed_body (NOT raw body) when calling the LLM", async () => {
    const db = openDb(":memory:");
    const messageId = insertTestMessage(db, {
      body: "Email me at buyer@example.com please",
      pii: "Email me at [email] please",
    });
    const client = makeMockClient([
      { draft: "Hi! Thanks for the message.", category: "generic_greeting" },
    ]);

    await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });

    expect(client.chat.completions.create).toHaveBeenCalledOnce();
    const sent = client.chat.completions.create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = sent.messages[1]!.content;
    expect(userMessage).toContain("[email]");
    expect(userMessage).not.toContain("buyer@example.com");

    closeDb(db);
  });

  it("looks up listing if ebay_item_id is set and grounds the prompt", async () => {
    const db = openDb(":memory:");
    insertTestListing(db, "item-XYZ", { title: "Vintage Levi's 501" });
    const messageId = insertTestMessage(db, {
      body: "What size is this?",
      pii: "What size is this?",
      ebayItemId: "item-XYZ",
    });
    const client = makeMockClient([
      { draft: "Size 32!", category: "sizing_measurements" },
    ]);

    const snapshot = await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });
    expect(snapshot.draft_text).toBe("Size 32!");

    // Confirm the persisted llm_calls row has the right pricing row.
    const calls = db.prepare(`SELECT * FROM llm_calls`).all() as Array<{
      message_id: string;
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message_id).toBe(messageId);

    closeDb(db);
  });

  it("falls through gracefully when no listing exists", async () => {
    const db = openDb(":memory:");
    const messageId = insertTestMessage(db, {
      body: "Generic question",
      pii: "Generic question",
      ebayItemId: "item-MISSING",
    });
    const client = makeMockClient([
      { draft: "Hi there!", category: "generic_greeting" },
    ]);

    const snapshot = await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });
    expect(snapshot.draft_text).toBe("Hi there!");
    expect(snapshot.version).toBe(1);

    closeDb(db);
  });

  it("increments version on subsequent calls", async () => {
    const db = openDb(":memory:");
    const messageId = insertTestMessage(db, {
      body: "Hi",
      pii: "Hi",
    });
    const client = makeMockClient([
      { draft: "v1 draft", category: "generic_greeting" },
      { draft: "v2 draft", category: "generic_greeting" },
      { draft: "v3 draft", category: "generic_greeting" },
    ]);

    const v1 = await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });
    const v2 = await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });
    const v3 = await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v3.version).toBe(3);

    const draftsCount = db
      .prepare(`SELECT COUNT(*) AS c FROM drafts WHERE message_id = ?`)
      .get(messageId) as { c: number };
    expect(draftsCount.c).toBe(3);

    closeDb(db);
  });

  it("backfills messages.category from the model output", async () => {
    const db = openDb(":memory:");
    const messageId = insertTestMessage(db, {
      body: "How big is it?",
      pii: "How big is it?",
    });
    const client = makeMockClient([
      { draft: "Size large", category: "sizing_measurements" },
    ]);

    await buildDraftForMessage({
      db,
      messageId,
      llmOptions: { client },
    });

    const messageRow = db
      .prepare(`SELECT category FROM messages WHERE id = ?`)
      .get(messageId) as { category: string };
    expect(messageRow.category).toBe("sizing_measurements");

    closeDb(db);
  });

  it("throws MessageNotFoundError when the message does not exist", async () => {
    const db = openDb(":memory:");
    const client = makeMockClient([
      { draft: "x", category: "generic_greeting" },
    ]);
    await expect(
      buildDraftForMessage({
        db,
        messageId: "does-not-exist",
        llmOptions: { client },
      }),
    ).rejects.toThrow(/message not found/);
    closeDb(db);
  });

  describe("V0 Day 9 — tiered routing", () => {
    it("routes a sizing question to Haiku", async () => {
      const db = openDb(":memory:");
      const messageId = insertTestMessage(db, {
        body: "What's the chest measurement? US Medium fit?",
        pii: "What's the chest measurement? US Medium fit?",
      });
      const client = makeMockClient([
        { draft: "22 inches across.", category: "sizing_measurements" },
      ]);
      await buildDraftForMessage({ db, messageId, llmOptions: { client } });
      const sentModel = client.chat.completions.create.mock.calls[0]?.[0]?.model;
      expect(sentModel).toBe("anthropic/claude-haiku-4-5");
      closeDb(db);
    });

    it("routes an offer/negotiation message to Sonnet", async () => {
      const db = openDb(":memory:");
      const messageId = insertTestMessage(db, {
        body: "Would you take $80? Best offer? Drop the price?",
        pii: "Would you take $80? Best offer? Drop the price?",
      });
      const client = makeMockClient([
        { draft: "Thanks for the offer.", category: "offer_negotiation" },
      ]);
      await buildDraftForMessage({ db, messageId, llmOptions: { client } });
      const sentModel = client.chat.completions.create.mock.calls[0]?.[0]?.model;
      expect(sentModel).toBe("anthropic/claude-sonnet-4-5");
      closeDb(db);
    });

    it("routes unknown text to Sonnet (default-up for safety)", async () => {
      const db = openDb(":memory:");
      const messageId = insertTestMessage(db, {
        body: "Random unrelated text with no triggers.",
        pii: "Random unrelated text with no triggers.",
      });
      const client = makeMockClient([
        { draft: "Got it.", category: "other_unclear" },
      ]);
      await buildDraftForMessage({ db, messageId, llmOptions: { client } });
      const sentModel = client.chat.completions.create.mock.calls[0]?.[0]?.model;
      expect(sentModel).toBe("anthropic/claude-sonnet-4-5");
      closeDb(db);
    });

    it("respects explicit modelOverride (caller wins over routing)", async () => {
      const db = openDb(":memory:");
      const messageId = insertTestMessage(db, {
        body: "Would you take $80? Best offer?",
        pii: "Would you take $80? Best offer?",
      });
      const client = makeMockClient([
        { draft: "Thanks.", category: "offer_negotiation" },
      ]);
      await buildDraftForMessage({
        db,
        messageId,
        llmOptions: {
          client,
          modelOverride: "google/gemini-2.5-flash",
        },
      });
      const sentModel = client.chat.completions.create.mock.calls[0]?.[0]?.model;
      expect(sentModel).toBe("google/gemini-2.5-flash");
      closeDb(db);
    });
  });
});

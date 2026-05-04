import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DraftRequest } from "@app/shared";

// Mock @app/prompts before any module resolves it.
vi.mock("@app/prompts", () => ({
  buildDraftPrompt: vi.fn((input: DraftRequest) => ({
    systemPrompt: "SYSTEM",
    cachedBlocks: [{ content: "VOICE", isCacheBreakpoint: true }],
    userMessage: `BUYER: ${input.message.body}`,
    promptHash: "hash-1",
  })),
  scrubPii: vi.fn((text: string) => ({
    // Pretend we redacted any "@" in the body so the test can verify routing.
    scrubbed: text.replace(/\S+@\S+/g, "[email]"),
    redactionCount: text.includes("@") ? 1 : 0,
  })),
  checkOutputPolicy: vi.fn(() => []),
  getBrandVoiceFragment: vi.fn(() => "fragment"),
}));

const { buildServer } = await import("./server.js");
const { openDb, closeDb } = await import("./db.js");

function makeMockClient(text: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: "gen-test",
          model: "anthropic/claude-haiku-4-5",
          choices: [
            {
              message: { content: text },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 100,
            total_tokens: 1100,
          },
        }),
      },
    },
  };
}

const validBody = {
  message: {
    userId: "u-bayu",
    buyerUsername: "test_buyer",
    body: "Hi, please email me at buyer@example.com about size",
    ebayItemId: "item-123",
  },
  brandVoice: "friendly",
};

describe("POST /api/v1/dev/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 422 with Zod issues on a malformed body", async () => {
    const db = openDb(":memory:");
    const server = await buildServer({ db });

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/dev/draft",
      payload: { message: { buyerUsername: "x" } }, // missing body, userId
    });

    expect(res.statusCode).toBe(422);
    const json = res.json();
    expect(json.error).toBe("validation_error");
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);

    await server.close();
    closeDb(db);
  });

  it("returns 201, persists messages + drafts + llm_calls on success", async () => {
    const db = openDb(":memory:");
    const llmClient = makeMockClient(
      JSON.stringify({
        draft: "Hi! It's a size large.",
        confidence: 0.92,
        category: "sizing_measurements",
        used_facts: ["listing.size"],
        flags: [],
      }),
    );
    const app = await buildServer({
      db,
      llmOptions: { client: llmClient },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/dev/draft",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.draft).toContain("size large");
    expect(body.category).toBe("sizing_measurements");
    expect(body.tokens_in).toBe(1000);
    // V0 OpenRouter path doesn't surface cache reads — V1 (direct Anthropic) will.
    expect(body.cache_read_tokens).toBe(0);
    expect(body.cost_cents).toBeGreaterThan(0);

    // Persisted rows.
    const messageRow = db
      .prepare(`SELECT * FROM messages WHERE buyer_username = ?`)
      .get("test_buyer") as
      | {
          user_id: string;
          body: string;
          pii_scrubbed_body: string;
          ebay_item_id: string;
        }
      | undefined;
    expect(messageRow).toBeDefined();
    expect(messageRow?.user_id).toBe("u-bayu");
    expect(messageRow?.body).toContain("buyer@example.com"); // raw retained
    expect(messageRow?.pii_scrubbed_body).toContain("[email]"); // scrubbed
    expect(messageRow?.pii_scrubbed_body).not.toContain("buyer@example.com");
    expect(messageRow?.ebay_item_id).toBe("item-123");

    const draftCount = db
      .prepare(`SELECT COUNT(*) AS c FROM drafts`)
      .get() as { c: number };
    expect(draftCount.c).toBe(1);

    const callRow = db.prepare(`SELECT * FROM llm_calls`).get() as {
      tokens_in: number;
      tokens_out: number;
      cache_read_tokens: number;
      cache_hit: number;
      cost_cents: number;
      latency_ms: number;
    };
    expect(callRow.tokens_in).toBe(1000);
    expect(callRow.tokens_out).toBe(100);
    // V0 OpenRouter path: no cache reads surfaced; cache_hit=0 follows.
    expect(callRow.cache_read_tokens).toBe(0);
    expect(callRow.cache_hit).toBe(0);
    expect(callRow.cost_cents).toBeGreaterThan(0);
    expect(callRow.latency_ms).toBeGreaterThanOrEqual(0);

    // The mocked OpenRouter call must have been issued exactly once. The
    // user message (messages[1]) carries the scrubbed body — the original
    // buyer email must NOT have left the process.
    expect(llmClient.chat.completions.create).toHaveBeenCalledOnce();
    const sent = llmClient.chat.completions.create.mock.calls[0]?.[0];
    expect(sent.messages[1].role).toBe("user");
    expect(sent.messages[1].content).toContain("[email]");
    expect(sent.messages[1].content).not.toContain("buyer@example.com");

    await app.close();
    closeDb(db);
  });

  it("GET /api/v1/health returns ok", async () => {
    const db = openDb(":memory:");
    const server = await buildServer({ db });
    const res = await server.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await server.close();
    closeDb(db);
  });
});

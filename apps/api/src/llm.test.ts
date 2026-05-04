import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DraftRequest } from "@app/shared";

// Mock @app/prompts BEFORE importing llm.ts so the module picks up our stubs.
vi.mock("@app/prompts", () => ({
  buildDraftPrompt: vi.fn((input: DraftRequest) => ({
    systemPrompt: "SYSTEM PROMPT",
    cachedBlocks: [
      { content: "BRAND VOICE FRAGMENT", isCacheBreakpoint: true },
      { content: "LISTING KB BLOCK", isCacheBreakpoint: true },
    ],
    userMessage: `BUYER: ${input.message.body}`,
    promptHash: "test-prompt-hash-v1",
  })),
  scrubPii: vi.fn((text: string) => ({
    scrubbed: text,
    redactionCount: 0,
  })),
  checkOutputPolicy: vi.fn(() => []),
  getBrandVoiceFragment: vi.fn(() => "fragment"),
}));

const { computeCostCents, generateDraft } = await import("./llm.js");

const fixtureRequest: DraftRequest = {
  message: {
    userId: "u-bayu",
    buyerUsername: "test_buyer",
    body: "What size is this jacket?",
  },
  brandVoice: "friendly",
};

function makeMockClient(args: {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  reportedCostUsd?: number;
  model?: string;
}) {
  const create = vi.fn().mockResolvedValue({
    id: "gen-test",
    model: args.model ?? "anthropic/claude-haiku-4-5",
    choices: [
      {
        message: { content: args.text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: args.promptTokens ?? 1000,
      completion_tokens: args.completionTokens ?? 100,
      total_tokens: (args.promptTokens ?? 1000) + (args.completionTokens ?? 100),
      ...(args.reportedCostUsd !== undefined ? { cost: args.reportedCostUsd } : {}),
    },
  });
  return { chat: { completions: { create } } };
}

describe("computeCostCents", () => {
  it("computes Haiku 4.5 cost correctly via the table", () => {
    // Haiku 4.5: 100 cents/M in, 500 cents/M out
    // 1000 * 100/1e6 = 0.1 cent
    // 100  * 500/1e6 = 0.05 cent
    // total = 0.15 cents
    const cost = computeCostCents("anthropic/claude-haiku-4-5", 1000, 100);
    expect(cost).toBeCloseTo(0.15, 4);
  });

  it("computes Sonnet 4.5 cost correctly", () => {
    // Sonnet 4.5: 300 cents/M in, 1500 cents/M out
    // 1000 * 300/1e6 = 0.3
    // 100 * 1500/1e6 = 0.15
    // total = 0.45
    const cost = computeCostCents("anthropic/claude-sonnet-4-5", 1000, 100);
    expect(cost).toBeCloseTo(0.45, 4);
  });

  it("aliases family substrings (Haiku) to the canonical price", () => {
    const canonical = computeCostCents("anthropic/claude-haiku-4-5", 1000, 100);
    const dated = computeCostCents("anthropic/claude-4.5-haiku-20251001", 1000, 100);
    expect(dated).toBe(canonical);
  });

  it("uses OpenRouter-reported cost when provided (USD → cents)", () => {
    // 0.000124 USD = 0.0124 cents
    const cost = computeCostCents("anything", 9999, 9999, 0.000124);
    expect(cost).toBeCloseTo(0.0124, 4);
  });

  it("falls back to Haiku pricing for unknown models", () => {
    const haiku = computeCostCents("anthropic/claude-haiku-4-5", 1000, 100);
    const unknown = computeCostCents("vendor/totally-new-model-9000", 1000, 100);
    expect(unknown).toBe(haiku);
  });
});

describe("generateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid DraftResponse for a happy-path model output", async () => {
    const client = makeMockClient({
      text: JSON.stringify({
        draft: "Hi! It measures 22 inches across the chest.",
        confidence: 0.9,
        category: "sizing_measurements",
        used_facts: ["listing.measurements.chest"],
        flags: [],
      }),
    });

    const out = await generateDraft(fixtureRequest, { client });

    expect(out.draft).toContain("22 inches");
    expect(out.confidence).toBe(0.9);
    expect(out.category).toBe("sizing_measurements");
    expect(out.used_facts).toEqual(["listing.measurements.chest"]);
    expect(out.flags).toEqual([]);
    expect(out.model).toBe("anthropic/claude-haiku-4-5");
    expect(out.tokens_in).toBe(1000);
    expect(out.tokens_out).toBe(100);
    expect(out.cache_read_tokens).toBe(0);
    expect(out.cost_cents).toBeCloseTo(0.15, 4);
    expect(out.generated_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(client.chat.completions.create).toHaveBeenCalledOnce();
  });

  it("sends a single concatenated system message + user turn", async () => {
    const client = makeMockClient({
      text: JSON.stringify({
        draft: "ok",
        confidence: 0.5,
        category: "generic_greeting",
        used_facts: [],
        flags: [],
      }),
    });

    await generateDraft(fixtureRequest, { client });

    const call = client.chat.completions.create.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.messages).toHaveLength(2);
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[0].content).toContain("SYSTEM PROMPT");
    expect(call.messages[0].content).toContain("BRAND VOICE FRAGMENT");
    expect(call.messages[0].content).toContain("LISTING KB BLOCK");
    expect(call.messages[1].role).toBe("user");
    expect(call.messages[1].content).toContain("BUYER:");
    expect(call.max_tokens).toBe(800);
    expect(call.response_format).toEqual({ type: "json_object" });
  });

  it("uses OpenRouter-reported cost when present", async () => {
    const client = makeMockClient({
      text: JSON.stringify({
        draft: "ok",
        confidence: 0.5,
        category: "generic_greeting",
        used_facts: [],
        flags: [],
      }),
      reportedCostUsd: 0.000124,
    });

    const out = await generateDraft(fixtureRequest, { client });
    expect(out.cost_cents).toBeCloseTo(0.0124, 4);
  });

  it("returns the empty-draft fallback when the model output is unparseable", async () => {
    const client = makeMockClient({
      text: "not json at all, just prose",
    });

    const out = await generateDraft(fixtureRequest, { client });

    expect(out.draft).toBe("");
    expect(out.flags).toEqual(
      expect.arrayContaining(["model_error", "empty_draft"]),
    );
    expect(out.confidence).toBe(0);
    expect(out.category).toBe("other_unclear");
    expect(out.tokens_in).toBe(1000);
  });

  it("returns the empty-draft fallback when JSON does not match the schema", async () => {
    const client = makeMockClient({
      text: JSON.stringify({
        draft: "ok",
        confidence: 1.5, // out of range
        category: "sizing_measurements",
        used_facts: [],
        flags: [],
      }),
    });

    const out = await generateDraft(fixtureRequest, { client });

    expect(out.flags).toEqual(
      expect.arrayContaining(["model_error", "empty_draft"]),
    );
  });

  it("merges checkOutputPolicy flags into the response", async () => {
    const promptsModule = await import("@app/prompts");
    (promptsModule.checkOutputPolicy as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      "forbidden_phrase_money",
    ]);

    const client = makeMockClient({
      text: JSON.stringify({
        draft: "Send me $50 via PayPal",
        confidence: 0.7,
        category: "offer_negotiation",
        used_facts: [],
        flags: [],
      }),
    });

    const out = await generateDraft(fixtureRequest, { client });
    expect(out.flags).toContain("forbidden_phrase_money");
  });

  it("strips ```json fences before parsing", async () => {
    const client = makeMockClient({
      text:
        "```json\n" +
        JSON.stringify({
          draft: "fenced",
          confidence: 0.8,
          category: "shipping_timeline",
          used_facts: [],
          flags: [],
        }) +
        "\n```",
    });

    const out = await generateDraft(fixtureRequest, { client });
    expect(out.draft).toBe("fenced");
    expect(out.category).toBe("shipping_timeline");
  });

  it("flags an empty draft string even if JSON parses cleanly", async () => {
    const client = makeMockClient({
      text: JSON.stringify({
        draft: "",
        confidence: 0.9,
        category: "generic_greeting",
        used_facts: [],
        flags: [],
      }),
    });

    const out = await generateDraft(fixtureRequest, { client });
    expect(out.flags).toContain("empty_draft");
  });

  it("respects modelOverride and prices accordingly", async () => {
    const client = makeMockClient({
      text: JSON.stringify({
        draft: "ok",
        confidence: 0.5,
        category: "generic_greeting",
        used_facts: [],
        flags: [],
      }),
      model: "google/gemini-2.5-flash",
    });

    const out = await generateDraft(fixtureRequest, {
      client,
      modelOverride: "google/gemini-2.5-flash",
    });

    expect(out.model).toBe("google/gemini-2.5-flash");
    // Gemini 2.5 Flash: 7.5 cents/M in, 30 cents/M out
    // 1000 * 7.5/1e6 = 0.0075 + 100 * 30/1e6 = 0.003 = 0.0105 cents
    expect(out.cost_cents).toBeCloseTo(0.0105, 4);

    const call = client.chat.completions.create.mock.calls[0]?.[0];
    expect(call.model).toBe("google/gemini-2.5-flash");
  });
});

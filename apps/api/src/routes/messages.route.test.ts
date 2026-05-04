import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("@app/prompts", () => ({
  buildDraftPrompt: vi.fn((input: { message: { body: string } }) => ({
    systemPrompt: "SYSTEM",
    cachedBlocks: [{ content: "VOICE", isCacheBreakpoint: true }],
    userMessage: `BUYER: ${input.message.body}`,
    promptHash: "hash-1",
  })),
  scrubPii: vi.fn((text: string) => ({ scrubbed: text, redactionCount: 0 })),
  checkOutputPolicy: vi.fn(() => []),
  getBrandVoiceFragment: vi.fn(() => "fragment"),
}));

const { buildServer } = await import("../server.js");
const { openDb, closeDb } = await import("../db.js");
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

interface InsertArgs {
  body?: string;
  pii?: string;
  ebayItemId?: string | null;
  ebayMessageId?: string | null;
  buyerUsername?: string;
  receivedAt?: string;
}

function insertMessage(
  db: ReturnType<typeof openDb>,
  args: InsertArgs = {},
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO messages (id, user_id, buyer_username, body, pii_scrubbed_body,
                           ebay_item_id, ebay_message_id, thread_id, category,
                           received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
  ).run(
    id,
    V0_USER_ID,
    args.buyerUsername ?? "buyer_one",
    args.body ?? "Hi, what size is this?",
    args.pii ?? args.body ?? "Hi, what size is this?",
    args.ebayItemId ?? null,
    args.ebayMessageId ?? null,
    args.receivedAt ?? new Date().toISOString(),
  );
  return id;
}

function insertListing(
  db: ReturnType<typeof openDb>,
  ebayItemId: string,
  kb: Record<string, unknown> = {},
): void {
  db.prepare(
    `INSERT INTO listings (id, user_id, ebay_item_id, kb_json, last_synced_at)
       VALUES (?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    V0_USER_ID,
    ebayItemId,
    JSON.stringify({
      ebay_item_id: ebayItemId,
      title: "Vintage Item",
      ...kb,
    }),
    new Date().toISOString(),
  );
}

describe("GET /api/v1/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty data when there are no messages", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });
    const res = await app.inject({ method: "GET", url: "/api/v1/messages" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(body.next_cursor).toBeNull();
    expect(body.has_more).toBe(false);
    expect(body.total_pending).toBe(0);
    await app.close();
    closeDb(db);
  });

  it("returns 3 ingested messages sorted by received_at DESC", async () => {
    const db = openDb(":memory:");
    insertMessage(db, {
      receivedAt: "2026-05-01T10:00:00.000Z",
      buyerUsername: "buyer_a",
    });
    insertMessage(db, {
      receivedAt: "2026-05-03T10:00:00.000Z",
      buyerUsername: "buyer_c",
    });
    insertMessage(db, {
      receivedAt: "2026-05-02T10:00:00.000Z",
      buyerUsername: "buyer_b",
    });
    const app = await buildServer({ db });

    const res = await app.inject({ method: "GET", url: "/api/v1/messages" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].buyer_username).toBe("buyer_c"); // newest
    expect(body.data[1].buyer_username).toBe("buyer_b");
    expect(body.data[2].buyer_username).toBe("buyer_a");
    expect(body.data.every((d: { status: string }) => d.status === "no_draft")).toBe(true);
    expect(body.total_pending).toBe(3);
    await app.close();
    closeDb(db);
  });

  it("status filter works (no_draft, drafted)", async () => {
    const db = openDb(":memory:");
    const id1 = insertMessage(db, { buyerUsername: "buyer_drafted" });
    insertMessage(db, { buyerUsername: "buyer_nodraft" });

    // Insert a drafted-status drafts row for id1.
    db.prepare(
      `INSERT INTO drafts (id, message_id, version, draft_text, category,
                           confidence, used_facts, flags, model, prompt_hash,
                           generated_at, status)
         VALUES (?, ?, 1, 'hi', 'generic_greeting', 0.9, '[]', '[]',
                 'm', 'h', ?, 'drafted')`,
    ).run(randomUUID(), id1, new Date().toISOString());

    const app = await buildServer({ db });
    const draftedRes = await app.inject({
      method: "GET",
      url: "/api/v1/messages?status=drafted",
    });
    expect(draftedRes.json().data).toHaveLength(1);
    expect(draftedRes.json().data[0].buyer_username).toBe("buyer_drafted");

    const noDraftRes = await app.inject({
      method: "GET",
      url: "/api/v1/messages?status=no_draft",
    });
    expect(noDraftRes.json().data).toHaveLength(1);
    expect(noDraftRes.json().data[0].buyer_username).toBe("buyer_nodraft");

    await app.close();
    closeDb(db);
  });

  it("paginates with limit=2 and a cursor that walks the page", async () => {
    const db = openDb(":memory:");
    const dates = [
      "2026-05-01T10:00:00.000Z",
      "2026-05-02T10:00:00.000Z",
      "2026-05-03T10:00:00.000Z",
      "2026-05-04T10:00:00.000Z",
      "2026-05-05T10:00:00.000Z",
    ];
    for (let i = 0; i < dates.length; i++) {
      insertMessage(db, {
        receivedAt: dates[i]!,
        buyerUsername: `buyer_${i}`,
      });
    }
    const app = await buildServer({ db });

    const page1 = await app.inject({
      method: "GET",
      url: "/api/v1/messages?limit=2",
    });
    const body1 = page1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.has_more).toBe(true);
    expect(body1.next_cursor).toBeTypeOf("string");

    const page2 = await app.inject({
      method: "GET",
      url: `/api/v1/messages?limit=2&cursor=${encodeURIComponent(body1.next_cursor)}`,
    });
    const body2 = page2.json();
    expect(body2.data).toHaveLength(2);
    // Pages don't overlap.
    const seen = new Set([
      ...body1.data.map((d: { id: string }) => d.id),
      ...body2.data.map((d: { id: string }) => d.id),
    ]);
    expect(seen.size).toBe(4);

    const page3 = await app.inject({
      method: "GET",
      url: `/api/v1/messages?limit=2&cursor=${encodeURIComponent(body2.next_cursor)}`,
    });
    const body3 = page3.json();
    expect(body3.data).toHaveLength(1);
    expect(body3.has_more).toBe(false);
    expect(body3.next_cursor).toBeNull();

    await app.close();
    closeDb(db);
  });
});

describe("GET /api/v1/messages/:id", () => {
  it("returns 404 when not found", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages/no-such-id",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    closeDb(db);
  });

  it("returns detail with associated listing and no draft", async () => {
    const db = openDb(":memory:");
    insertListing(db, "item-1", { title: "Levi's 501" });
    const id = insertMessage(db, { ebayItemId: "item-1" });
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message.id).toBe(id);
    expect(body.listing.ebay_item_id).toBe("item-1");
    expect(body.listing.title).toBe("Levi's 501");
    expect(body.listing.kb_json).toBeTypeOf("object");
    expect(body.draft).toBeNull();
    expect(body.status).toBe("no_draft");
    expect(body.buyer_history_count).toBe(0);
    await app.close();
    closeDb(db);
  });
});

describe("POST /api/v1/messages/:id/draft", () => {
  it("creates a draft, status flips to 'drafted', detail GET returns it", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "Hi! Thanks for reaching out.", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    const draftRes = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-draft-1" },
    });
    expect(draftRes.statusCode).toBe(201);
    const draftBody = draftRes.json();
    expect(draftBody.ok).toBe(true);
    expect(draftBody.draft.draft_text).toContain("Thanks for reaching out");
    expect(draftBody.draft.version).toBe(1);
    expect(draftBody.draft.status).toBe("drafted");

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().draft).not.toBeNull();
    expect(detailRes.json().status).toBe("drafted");

    await app.close();
    closeDb(db);
  });

  it("is no-op when a draft already exists (does not double-charge LLM)", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "first", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    // First call creates the draft.
    const r1 = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-1" },
    });
    expect(r1.statusCode).toBe(201);

    // Second call with a DIFFERENT idempotency key should still no-op
    // (existing draft) and NOT call the LLM again.
    const r2 = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-2" },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().draft.draft_text).toBe("first");

    expect(client.chat.completions.create).toHaveBeenCalledOnce();
    await app.close();
    closeDb(db);
  });

  it("returns 404 when message id does not exist", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({
      db,
      llmOptions: { client: makeMockClient([{ draft: "x", category: "generic_greeting" }]) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/missing/draft",
      headers: { "Idempotency-Key": "k-x" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    closeDb(db);
  });
});

describe("POST /api/v1/messages/:id/regenerate", () => {
  it("creates a new version with version=2", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "v1", category: "generic_greeting" },
      { draft: "v2 different", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    const r1 = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d-1" },
    });
    expect(r1.json().draft.version).toBe(1);

    const r2 = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/regenerate`,
      headers: { "Idempotency-Key": "k-r-1" },
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.json().draft.version).toBe(2);
    expect(r2.json().draft.draft_text).toBe("v2 different");

    await app.close();
    closeDb(db);
  });
});

describe("POST /api/v1/messages/:id/approve", () => {
  it("no edits → status='approved', learned_edit_captured=false", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "Hi there!", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-a" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.draft.status).toBe("approved");
    expect(body.draft.approved_at).toBeTypeOf("string");
    expect(body.learned_edit_captured).toBe(false);

    const learnedCount = db
      .prepare(`SELECT COUNT(*) AS c FROM learned_edits`)
      .get() as { c: number };
    expect(learnedCount.c).toBe(0);

    await app.close();
    closeDb(db);
  });

  it("editedText differs from draft_text → captures learned_edits", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "Hi there!", category: "sizing_measurements" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-a" },
      payload: { editedText: "Hey! Thanks for asking!" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.draft.status).toBe("approved");
    expect(body.draft.edited_text).toBe("Hey! Thanks for asking!");
    expect(body.learned_edit_captured).toBe(true);

    const learnedRows = db
      .prepare(`SELECT * FROM learned_edits`)
      .all() as Array<{
        user_id: string;
        category: string;
        original_phrase: string;
        preferred_phrase: string;
        observation_count: number;
      }>;
    expect(learnedRows).toHaveLength(1);
    expect(learnedRows[0]!.user_id).toBe(V0_USER_ID);
    expect(learnedRows[0]!.category).toBe("sizing_measurements");
    expect(learnedRows[0]!.original_phrase).toBe("Hi there!");
    expect(learnedRows[0]!.preferred_phrase).toBe("Hey! Thanks for asking!");
    expect(learnedRows[0]!.observation_count).toBe(1);

    await app.close();
    closeDb(db);
  });

  it("returns 409 when no draft exists", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const app = await buildServer({ db });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-a" },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("no_draft_to_approve");
    await app.close();
    closeDb(db);
  });

  it("returns 409 when status is already 'sent'", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "x", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-a" },
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/mark-sent`,
      headers: { "Idempotency-Key": "k-s" },
      payload: {},
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-a-2" },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("draft_status_not_approvable");

    await app.close();
    closeDb(db);
  });
});

describe("POST /api/v1/messages/:id/skip", () => {
  it("works on a no_draft message (creates sentinel draft row)", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/skip`,
      headers: { "Idempotency-Key": "k-skip" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, status: "skipped" });

    const draftRow = db
      .prepare(
        `SELECT status, skipped_at, model FROM drafts WHERE message_id = ?`,
      )
      .get(id) as { status: string; skipped_at: string; model: string };
    expect(draftRow.status).toBe("skipped");
    expect(draftRow.skipped_at).toBeTypeOf("string");
    expect(draftRow.model).toBe("sentinel");

    await app.close();
    closeDb(db);
  });

  it("works on a drafted message (marks the existing draft skipped)", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "x", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/skip`,
      headers: { "Idempotency-Key": "k-skip" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const draftRow = db
      .prepare(`SELECT status, model FROM drafts WHERE message_id = ?`)
      .get(id) as { status: string; model: string };
    expect(draftRow.status).toBe("skipped");
    expect(draftRow.model).toBe("anthropic/claude-haiku-4-5"); // not sentinel

    await app.close();
    closeDb(db);
  });
});

describe("POST /api/v1/messages/:id/mark-sent", () => {
  it("flips an approved draft to sent with send_method='paste'", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "x", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-a" },
      payload: {},
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/mark-sent`,
      headers: { "Idempotency-Key": "k-s" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().sent_at).toBeTypeOf("string");

    const draftRow = db
      .prepare(
        `SELECT status, sent_at, send_method FROM drafts WHERE message_id = ?`,
      )
      .get(id) as { status: string; sent_at: string; send_method: string };
    expect(draftRow.status).toBe("sent");
    expect(draftRow.sent_at).toBeTypeOf("string");
    expect(draftRow.send_method).toBe("paste");

    await app.close();
    closeDb(db);
  });

  it("returns 409 when status is 'drafted' (not approved)", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "x", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/mark-sent`,
      headers: { "Idempotency-Key": "k-s" },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("draft_not_approved");

    await app.close();
    closeDb(db);
  });
});

describe("Idempotency on mutating message routes", () => {
  it.each([
    ["draft", "POST"],
    ["regenerate", "POST"],
    ["approve", "POST"],
    ["skip", "POST"],
    ["mark-sent", "POST"],
  ])("rejects missing Idempotency-Key on /%s with 400", async (suffix) => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const app = await buildServer({
      db,
      llmOptions: {
        client: makeMockClient([
          { draft: "x", category: "generic_greeting" },
        ]),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/${suffix}`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "missing_idempotency_key" });
    await app.close();
    closeDb(db);
  });

  it("replays cached response on key reuse with same body (approve)", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "x", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-d" },
    });

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-replay" },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/approve`,
      headers: { "Idempotency-Key": "k-replay" },
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(firstBody);

    // Critically: even though /approve was called twice, learned_edits
    // should still be empty (no edits in either call) and we shouldn't
    // have double-applied any updates.
    const draftCount = db
      .prepare(`SELECT COUNT(*) AS c FROM drafts WHERE message_id = ?`)
      .get(id) as { c: number };
    expect(draftCount.c).toBe(1);

    await app.close();
    closeDb(db);
  });

  it("replays cached response on /draft key reuse without double-charging LLM", async () => {
    const db = openDb(":memory:");
    const id = insertMessage(db);
    const client = makeMockClient([
      { draft: "first", category: "generic_greeting" },
    ]);
    const app = await buildServer({ db, llmOptions: { client } });

    const r1 = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-replay" },
    });
    const r2 = await app.inject({
      method: "POST",
      url: `/api/v1/messages/${id}/draft`,
      headers: { "Idempotency-Key": "k-replay" },
    });

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r2.json()).toEqual(r1.json());
    expect(client.chat.completions.create).toHaveBeenCalledOnce();

    await app.close();
    closeDb(db);
  });
});

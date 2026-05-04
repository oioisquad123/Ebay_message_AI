import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { closeDb, openDb } from "../db.js";

function batch(messages: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    protocol_version: 1,
    captured_at: "2026-05-03T12:00:00.000Z",
    messages,
  };
}

const baseMsg = {
  userId: "u-bayu",
  buyerUsername: "vintage_collector_99",
  body: "Hi! Will this fit me?",
  ebayItemId: "234567890123",
  ebayMessageId: "msg-2026-05-03-001",
  threadId: "t-1",
  receivedAt: "2026-05-03T10:30:00.000Z",
};

describe("POST /api/v1/ingest/messages", () => {
  it("returns 400 when Idempotency-Key header is missing", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      payload: batch([baseMsg]),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "missing_idempotency_key" });

    await app.close();
    closeDb(db);
  });

  it("returns 422 with Zod issues on a malformed body", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-1" },
      payload: { protocol_version: 1, messages: [] }, // missing captured_at + empty
    });

    expect(res.statusCode).toBe(422);
    const json = res.json();
    expect(json.error).toBe("validation_error");
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);

    await app.close();
    closeDb(db);
  });

  it("happy path: 201 with inserted=3, deduped=0, persists 3 rows", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-happy-1" },
      payload: batch([
        { ...baseMsg, ebayMessageId: "m-1" },
        { ...baseMsg, ebayMessageId: "m-2", buyerUsername: "denimfan_82" },
        { ...baseMsg, ebayMessageId: "m-3", buyerUsername: "picky_buyer_42" },
      ]),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.inserted).toBe(3);
    expect(body.deduped).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.replayed).toBe(false);
    expect(body.idempotency_key).toBe("k-happy-1");
    expect(body.results).toHaveLength(3);
    for (const r of body.results) {
      expect(r.status).toBe("inserted");
      expect(r.message_id).toBeTypeOf("string");
    }

    const count = db.prepare(`SELECT COUNT(*) AS c FROM messages`).get() as {
      c: number;
    };
    expect(count.c).toBe(3);

    await app.close();
    closeDb(db);
  });

  it("idempotent replay: same body + same key → second call returns replayed=true with no extra rows", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });
    const payload = batch([{ ...baseMsg, ebayMessageId: "m-replay-1" }]);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-replay" },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().replayed).toBe(false);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-replay" },
      payload,
    });
    expect(second.statusCode).toBe(201);
    const body = second.json();
    expect(body.replayed).toBe(true);
    expect(body.inserted).toBe(1); // echo of original count
    expect(body.results).toHaveLength(1);

    const count = db.prepare(`SELECT COUNT(*) AS c FROM messages`).get() as {
      c: number;
    };
    expect(count.c).toBe(1);

    await app.close();
    closeDb(db);
  });

  it("idempotency conflict: same key + different body → 409", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-conflict" },
      payload: batch([{ ...baseMsg, ebayMessageId: "m-original" }]),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-conflict" },
      payload: batch([
        { ...baseMsg, ebayMessageId: "m-different", body: "Totally other" },
      ]),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "idempotency_key_reuse" });

    await app.close();
    closeDb(db);
  });

  it("dedupes ebayMessageId across batches with different keys", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    // Batch 1: m-1, m-2 — both new.
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-batch-1" },
      payload: batch([
        { ...baseMsg, ebayMessageId: "m-1" },
        { ...baseMsg, ebayMessageId: "m-2", buyerUsername: "denimfan_82" },
      ]),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().inserted).toBe(2);

    // Batch 2: m-1 (dupe) + m-9 (new) — new key so no idempotency hit.
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-batch-2" },
      payload: batch([
        { ...baseMsg, ebayMessageId: "m-1" },
        { ...baseMsg, ebayMessageId: "m-9", buyerUsername: "new_buyer" },
      ]),
    });
    expect(second.statusCode).toBe(201);
    const body = second.json();
    expect(body.inserted).toBe(1);
    expect(body.deduped).toBe(1);
    expect(body.results.find((r: { ebay_message_id: string }) => r.ebay_message_id === "m-1")
      .status).toBe("deduped");
    expect(body.results.find((r: { ebay_message_id: string }) => r.ebay_message_id === "m-9")
      .status).toBe("inserted");

    const count = db.prepare(`SELECT COUNT(*) AS c FROM messages`).get() as {
      c: number;
    };
    expect(count.c).toBe(3); // m-1, m-2, m-9 — never 4

    await app.close();
    closeDb(db);
  });

  it("PII scrubbing: pii_scrubbed_body differs from body when PII is present", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const dirtyBody =
      "Email me at buyer@example.com or call (415) 555-2671 about size";

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/messages",
      headers: { "Idempotency-Key": "k-pii" },
      payload: batch([
        {
          ...baseMsg,
          ebayMessageId: "m-pii-1",
          body: dirtyBody,
        },
      ]),
    });
    expect(res.statusCode).toBe(201);

    const row = db
      .prepare(`SELECT body, pii_scrubbed_body FROM messages WHERE ebay_message_id = ?`)
      .get("m-pii-1") as { body: string; pii_scrubbed_body: string };

    expect(row.body).toBe(dirtyBody); // raw retained
    expect(row.pii_scrubbed_body).not.toBe(dirtyBody);
    expect(row.pii_scrubbed_body).toContain("[email]");
    expect(row.pii_scrubbed_body).not.toContain("buyer@example.com");

    await app.close();
    closeDb(db);
  });
});

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "./db.js";

describe("openDb", () => {
  it("applies schema to an in-memory database", () => {
    const db = openDb(":memory:");
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "messages",
        "listings",
        "drafts",
        "learned_edits",
        "llm_calls",
      ]),
    );
    closeDb(db);
  });

  it("inserts a message + draft + llm_call row chain", () => {
    const db = openDb(":memory:");
    const messageId = randomUUID();
    const draftId = randomUUID();

    db.prepare(
      `INSERT INTO messages (id, user_id, buyer_username, body, pii_scrubbed_body)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(messageId, "u-bayu", "test_buyer", "raw body", "scrubbed body");

    db.prepare(
      `INSERT INTO drafts (
        id, message_id, draft_text, category, confidence, used_facts,
        flags, model, prompt_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      draftId,
      messageId,
      "draft text",
      "sizing_measurements",
      0.9,
      "[]",
      "[]",
      "claude-sonnet-4-5",
      "hash:1",
    );

    db.prepare(
      `INSERT INTO llm_calls (
        id, user_id, message_id, draft_id, model, prompt_hash,
        tokens_in, tokens_out, cost_cents, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      "u-bayu",
      messageId,
      draftId,
      "claude-sonnet-4-5",
      "hash:1",
      1000,
      100,
      0.45,
      1234,
    );

    const draft = db
      .prepare(`SELECT * FROM drafts WHERE id = ?`)
      .get(draftId) as { message_id: string; version: number };
    expect(draft.message_id).toBe(messageId);
    expect(draft.version).toBe(1);

    const calls = db
      .prepare(`SELECT COUNT(*) AS c FROM llm_calls WHERE message_id = ?`)
      .get(messageId) as { c: number };
    expect(calls.c).toBe(1);

    closeDb(db);
  });

  it("enforces the listings UNIQUE(user_id, ebay_item_id) constraint", () => {
    const db = openDb(":memory:");
    db.prepare(
      `INSERT INTO listings (id, user_id, ebay_item_id, kb_json) VALUES (?, ?, ?, ?)`,
    ).run(randomUUID(), "u-bayu", "item-1", "{}");

    expect(() =>
      db
        .prepare(
          `INSERT INTO listings (id, user_id, ebay_item_id, kb_json) VALUES (?, ?, ?, ?)`,
        )
        .run(randomUUID(), "u-bayu", "item-1", "{}"),
    ).toThrow(/UNIQUE/i);

    closeDb(db);
  });

  it("foreign key drafts.message_id references messages.id", () => {
    const db = openDb(":memory:");
    expect(() =>
      db
        .prepare(
          `INSERT INTO drafts (
            id, message_id, draft_text, category, confidence, used_facts,
            flags, model, prompt_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          "no-such-message",
          "draft",
          "other_unclear",
          0.5,
          "[]",
          "[]",
          "claude-sonnet-4-5",
          "hash",
        ),
    ).toThrow(/FOREIGN KEY/i);
    closeDb(db);
  });
});

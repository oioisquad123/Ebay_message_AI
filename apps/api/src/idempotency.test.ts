import { describe, expect, it } from "vitest";
import { closeDb, openDb } from "./db.js";
import {
  IdempotencyConflictError,
  hashRequest,
  lookupIdempotent,
  recordIdempotent,
} from "./idempotency.js";

describe("hashRequest", () => {
  it("is stable across object key order", () => {
    const a = hashRequest({ a: 1, b: 2, c: { x: 1, y: 2 } });
    const b = hashRequest({ c: { y: 2, x: 1 }, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("differs on value change", () => {
    const a = hashRequest({ a: 1 });
    const b = hashRequest({ a: 2 });
    expect(a).not.toBe(b);
  });

  it("returns 32 hex chars", () => {
    expect(hashRequest({ x: "y" })).toMatch(/^[0-9a-f]{32}$/);
  });

  it("treats arrays as ordered (not sorted)", () => {
    expect(hashRequest([1, 2, 3])).not.toBe(hashRequest([3, 2, 1]));
  });

  it("handles primitives", () => {
    expect(hashRequest(null)).toMatch(/^[0-9a-f]{32}$/);
    expect(hashRequest("foo")).not.toBe(hashRequest("bar"));
    expect(hashRequest(true)).not.toBe(hashRequest(false));
  });
});

describe("lookupIdempotent / recordIdempotent", () => {
  it("returns null when nothing stored", () => {
    const db = openDb(":memory:");
    const hit = lookupIdempotent({
      db,
      userId: "u-bayu",
      key: "k-1",
      requestHash: "h-1",
    });
    expect(hit).toBeNull();
    closeDb(db);
  });

  it("round-trips status + body when hash matches", () => {
    const db = openDb(":memory:");
    recordIdempotent({
      db,
      userId: "u-bayu",
      key: "k-1",
      requestHash: "h-1",
      status: 201,
      body: { hello: "world", n: 3 },
    });

    const hit = lookupIdempotent({
      db,
      userId: "u-bayu",
      key: "k-1",
      requestHash: "h-1",
    });
    expect(hit).not.toBeNull();
    expect(hit?.status).toBe(201);
    expect(hit?.body).toEqual({ hello: "world", n: 3 });
    closeDb(db);
  });

  it("isolates by user_id", () => {
    const db = openDb(":memory:");
    recordIdempotent({
      db,
      userId: "u-bayu",
      key: "k-1",
      requestHash: "h-1",
      status: 201,
      body: { mine: true },
    });

    const otherUser = lookupIdempotent({
      db,
      userId: "u-someone-else",
      key: "k-1",
      requestHash: "h-1",
    });
    expect(otherUser).toBeNull();
    closeDb(db);
  });

  it("throws IdempotencyConflictError when key reused with a different request_hash", () => {
    const db = openDb(":memory:");
    recordIdempotent({
      db,
      userId: "u-bayu",
      key: "k-1",
      requestHash: "h-original",
      status: 201,
      body: { v: 1 },
    });

    expect(() =>
      lookupIdempotent({
        db,
        userId: "u-bayu",
        key: "k-1",
        requestHash: "h-different",
      }),
    ).toThrow(IdempotencyConflictError);
    closeDb(db);
  });

  it("UNIQUE(user_id, key) prevents accidental double-record", () => {
    const db = openDb(":memory:");
    recordIdempotent({
      db,
      userId: "u-bayu",
      key: "k-1",
      requestHash: "h-1",
      status: 201,
      body: { v: 1 },
    });
    expect(() =>
      recordIdempotent({
        db,
        userId: "u-bayu",
        key: "k-1",
        requestHash: "h-1",
        status: 201,
        body: { v: 1 },
      }),
    ).toThrow(/UNIQUE/i);
    closeDb(db);
  });
});

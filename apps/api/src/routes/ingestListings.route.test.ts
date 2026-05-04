import { describe, expect, it } from "vitest";
import { IngestListingResponseSchema } from "@app/shared";
import { buildServer } from "../server.js";
import { closeDb, openDb } from "../db.js";

function batch(
  listings: Array<Record<string, unknown>>,
  capturedAt = "2026-05-03T12:00:00.000Z",
): Record<string, unknown> {
  return {
    protocol_version: 1,
    captured_at: capturedAt,
    listings,
  };
}

const baseListingKb = {
  ebay_item_id: "234567890123",
  title: "Vintage 90s Levi's 501 Denim Jacket Size M",
  condition: "Pre-owned — Good",
  brand: "Levi's",
  size: "M",
  color: "Mid-blue wash",
};

const baseItem = {
  userId: "u-bayu",
  sourceUrl: "https://www.ebay.com/itm/234567890123",
  listingKb: baseListingKb,
};

describe("POST /api/v1/ingest/listings", () => {
  it("returns 400 when Idempotency-Key header is missing", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      payload: batch([baseItem]),
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
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-1" },
      // Missing captured_at + empty listings array
      payload: { protocol_version: 1, listings: [] },
    });

    expect(res.statusCode).toBe(422);
    const json = res.json();
    expect(json.error).toBe("validation_error");
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);

    await app.close();
    closeDb(db);
  });

  it("happy path: 201 with inserted=2, updated=0, skipped=0, persists 2 rows", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-happy" },
      payload: batch([
        { ...baseItem, listingKb: { ...baseListingKb, ebay_item_id: "L-1" } },
        {
          ...baseItem,
          listingKb: {
            ...baseListingKb,
            ebay_item_id: "L-2",
            title: "Other listing",
          },
        },
      ]),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.inserted).toBe(2);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.replayed).toBe(false);
    expect(body.idempotency_key).toBe("k-happy");
    expect(body.results).toHaveLength(2);
    for (const r of body.results) {
      expect(r.status).toBe("inserted");
      expect(r.listing_id).toBeTypeOf("string");
    }

    // Body validates against the canonical Zod contract.
    expect(IngestListingResponseSchema.safeParse(body).success).toBe(true);

    const count = db.prepare(`SELECT COUNT(*) AS c FROM listings`).get() as {
      c: number;
    };
    expect(count.c).toBe(2);

    await app.close();
    closeDb(db);
  });

  it("idempotent replay: same key + same body → replayed=true, no extra rows", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });
    const payload = batch([
      { ...baseItem, listingKb: { ...baseListingKb, ebay_item_id: "L-replay" } },
    ]);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-replay" },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().replayed).toBe(false);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-replay" },
      payload,
    });
    expect(second.statusCode).toBe(201);
    const body = second.json();
    expect(body.replayed).toBe(true);
    expect(body.inserted).toBe(1); // echo of the original counters
    expect(body.results).toHaveLength(1);

    const count = db.prepare(`SELECT COUNT(*) AS c FROM listings`).get() as {
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
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-conflict" },
      payload: batch([
        { ...baseItem, listingKb: { ...baseListingKb, ebay_item_id: "L-A" } },
      ]),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-conflict" },
      payload: batch([
        {
          ...baseItem,
          listingKb: {
            ...baseListingKb,
            ebay_item_id: "L-B",
            title: "Totally different",
          },
        },
      ]),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "idempotency_key_reuse" });

    await app.close();
    closeDb(db);
  });

  it("re-ingest same ebay_item_id with new key + updated kb_json → updated=1, kb_json refreshed", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-first" },
      payload: batch(
        [
          {
            ...baseItem,
            listingKb: {
              ...baseListingKb,
              ebay_item_id: "L-upd",
              title: "Old title",
            },
          },
        ],
        "2026-05-03T10:00:00.000Z",
      ),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().inserted).toBe(1);

    const originalRow = db
      .prepare(
        `SELECT id, kb_json, last_synced_at FROM listings WHERE ebay_item_id = ?`,
      )
      .get("L-upd") as { id: string; kb_json: string; last_synced_at: string };

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/listings",
      headers: { "Idempotency-Key": "k-second" },
      payload: batch(
        [
          {
            ...baseItem,
            listingKb: {
              ...baseListingKb,
              ebay_item_id: "L-upd",
              title: "New title",
              color: "Charcoal",
            },
          },
        ],
        "2026-05-03T13:00:00.000Z",
      ),
    });
    expect(second.statusCode).toBe(201);
    const body = second.json();
    expect(body.inserted).toBe(0);
    expect(body.updated).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.results[0].status).toBe("updated");
    expect(body.results[0].listing_id).toBe(originalRow.id); // primary key preserved
    expect(IngestListingResponseSchema.safeParse(body).success).toBe(true);

    const count = db.prepare(`SELECT COUNT(*) AS c FROM listings`).get() as {
      c: number;
    };
    expect(count.c).toBe(1); // still one row, just refreshed

    const updatedRow = db
      .prepare(
        `SELECT kb_json, last_synced_at FROM listings WHERE ebay_item_id = ?`,
      )
      .get("L-upd") as { kb_json: string; last_synced_at: string };
    const kb = JSON.parse(updatedRow.kb_json) as Record<string, unknown>;
    expect(kb.title).toBe("New title");
    expect(kb.color).toBe("Charcoal");
    expect(updatedRow.last_synced_at).toBe("2026-05-03T13:00:00.000Z");
    expect(updatedRow.last_synced_at).not.toBe(originalRow.last_synced_at);

    await app.close();
    closeDb(db);
  });
});

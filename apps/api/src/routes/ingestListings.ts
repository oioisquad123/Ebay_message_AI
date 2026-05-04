/**
 * POST /api/v1/ingest/listings — V0 Day 3.
 *
 * The extension scrapes an eBay listing detail page, packages each into a
 * `listing_kb` per the PRD §19 schema, and POSTs the batch here. The API:
 *   1. Requires `Idempotency-Key` header (CLAUDE.md #6: every POST is
 *      idempotent; missing header is a client bug, so 400 immediately).
 *   2. Validates against IngestListingBatchSchema.
 *   3. Standard idempotency lookup: same key + same body → cached replay
 *      with `replayed: true`; same key + different body → 409.
 *   4. UPSERTs into `listings` keyed on UNIQUE(user_id, ebay_item_id) so
 *      re-scraping a listing refreshes its kb_json + last_synced_at. We
 *      need to know whether each row was inserted vs. updated, and the
 *      cleanest read of that signal in better-sqlite3 (which doesn't
 *      surface RETURNING for ON CONFLICT) is a SELECT-then-branch inside
 *      the same transaction. SQLite serializes writes per-connection so
 *      the SELECT sees a consistent snapshot.
 *   5. The whole batch (writes + idempotency cache row) lives in one
 *      transaction so we never observe "wrote listings, didn't cache the
 *      response" or vice versa.
 */
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import {
  IngestListingBatchSchema,
  type IngestListingBatch,
  type IngestListingResponse,
  type IngestListingResult,
} from "@app/shared";
import type { DB } from "../db.js";
import { V0_USER_ID } from "../constants.js";
import {
  hashRequest,
  IdempotencyConflictError,
  lookupIdempotent,
  recordIdempotent,
} from "../idempotency.js";

export interface IngestListingsRouteOptions {
  db: DB;
}

export const ingestListingsRoute: FastifyPluginAsync<
  IngestListingsRouteOptions
> = async (fastify, opts) => {
  // Look up an existing listing row's id by (user_id, ebay_item_id). When
  // present we know the UPSERT will update; absent → it'll insert.
  const findExistingListingId = opts.db.prepare<[string, string]>(`
    SELECT id FROM listings
     WHERE user_id = ? AND ebay_item_id = ?
  `);

  // SQLite UPSERT: insert new row, or refresh kb_json + last_synced_at on the
  // existing one. The schema's UNIQUE(user_id, ebay_item_id) drives the conflict.
  const upsertListing = opts.db.prepare(`
    INSERT INTO listings (id, user_id, ebay_item_id, kb_json, last_synced_at)
    VALUES (@id, @user_id, @ebay_item_id, @kb_json, @last_synced_at)
    ON CONFLICT(user_id, ebay_item_id) DO UPDATE SET
      kb_json = excluded.kb_json,
      last_synced_at = excluded.last_synced_at
  `);

  fastify.post("/api/v1/ingest/listings", async (request, reply) => {
    // 1. Idempotency-Key required.
    const idempotencyKey = readIdempotencyKey(request.headers);
    if (!idempotencyKey) {
      return reply.code(400).send({ error: "missing_idempotency_key" });
    }

    // 2. Validate body — 422 with Zod issues (mirrors ingestMessages / devDraft).
    const parsed = IngestListingBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: "validation_error",
        issues: parsed.error.issues,
      });
    }
    const batch: IngestListingBatch = parsed.data;

    // 3. Idempotency replay / conflict.
    const requestHash = hashRequest(request.body);
    try {
      const hit = lookupIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: idempotencyKey,
        requestHash,
      });
      if (hit) {
        // Replay: flip `replayed` to true so callers can distinguish from
        // the original 201. The cached body recorded `replayed: false`.
        const replayBody =
          typeof hit.body === "object" && hit.body !== null
            ? { ...(hit.body as Record<string, unknown>), replayed: true }
            : hit.body;
        return reply.code(hit.status).send(replayBody);
      }
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return reply.code(409).send({ error: "idempotency_key_reuse" });
      }
      throw err;
    }

    // 4 + 5. UPSERT each listing and persist the response in one transaction.
    const results: IngestListingResult[] = [];
    let inserted = 0;
    let updated = 0;
    const skipped = 0; // V0: every well-formed listing UPSERTs; reserved for future filters.

    const lastSyncedAt = batch.captured_at;

    const writeAll = opts.db.transaction(() => {
      for (const item of batch.listings) {
        const ebayItemId = item.listingKb.ebay_item_id;
        const kbJson = JSON.stringify(item.listingKb);

        const existing = findExistingListingId.get(V0_USER_ID, ebayItemId) as
          | { id: string }
          | undefined;

        if (existing) {
          upsertListing.run({
            id: existing.id, // ignored on UPDATE branch but required by named-param API
            user_id: V0_USER_ID,
            ebay_item_id: ebayItemId,
            kb_json: kbJson,
            last_synced_at: lastSyncedAt,
          });
          updated += 1;
          results.push({
            ebay_item_id: ebayItemId,
            status: "updated",
            listing_id: existing.id,
          });
        } else {
          const newId = randomUUID();
          upsertListing.run({
            id: newId,
            user_id: V0_USER_ID,
            ebay_item_id: ebayItemId,
            kb_json: kbJson,
            last_synced_at: lastSyncedAt,
          });
          inserted += 1;
          results.push({
            ebay_item_id: ebayItemId,
            status: "inserted",
            listing_id: newId,
          });
        }
      }

      const responseBody: IngestListingResponse = {
        inserted,
        updated,
        skipped,
        results,
        idempotency_key: idempotencyKey,
        replayed: false,
      };

      recordIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: idempotencyKey,
        requestHash,
        status: 201,
        body: responseBody,
      });

      return responseBody;
    });

    const responseBody = writeAll();
    return reply.code(201).send(responseBody);
  });
};

/**
 * Header name lookup is case-insensitive on the wire and Fastify lowercases
 * keys, but accept either spelling defensively (mirrors ingestMessages).
 */
function readIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers["idempotency-key"] ?? headers["Idempotency-Key"];
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  if (typeof raw === "string") return raw.trim() || null;
  return null;
}

/**
 * POST /api/v1/ingest/messages — V0 Day 2.
 *
 * The Chrome extension batches up everything it scraped from
 * mesg.ebay.com and POSTs it here. The API:
 *   1. Requires `Idempotency-Key` header (CLAUDE.md #6: every POST is
 *      idempotent; V0 makes it required to keep semantics simple).
 *   2. Validates the body against IngestMessageBatchSchema.
 *   3. Looks up (user, key) — if seen with the same body, replays the
 *      cached response with `replayed: true`. If seen with a different
 *      body, returns 409 — that's a buggy client.
 *   4. Otherwise: PII-scrubs each body, INSERT OR IGNOREs into messages
 *      (the partial unique index on (user_id, ebay_message_id) catches
 *      dupes), then persists the response next to the writes in one
 *      transaction so we never observe "writes happened, idempotency
 *      cache didn't" or vice versa.
 */
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import {
  IngestMessageBatchSchema,
  type IngestMessageBatch,
  type IngestMessageResult,
  type IngestResponse,
} from "@app/shared";
import { scrubPii } from "@app/prompts";
import type { DB } from "../db.js";
import { V0_USER_ID } from "../constants.js";
import {
  hashRequest,
  IdempotencyConflictError,
  lookupIdempotent,
  recordIdempotent,
} from "../idempotency.js";

export interface IngestRouteOptions {
  db: DB;
}

export const ingestRoute: FastifyPluginAsync<IngestRouteOptions> = async (
  fastify,
  opts,
) => {
  const insertMessage = opts.db.prepare(`
    INSERT OR IGNORE INTO messages (
      id, user_id, buyer_username, body, pii_scrubbed_body,
      ebay_item_id, ebay_message_id, thread_id, category, received_at
    ) VALUES (
      @id, @user_id, @buyer_username, @body, @pii_scrubbed_body,
      @ebay_item_id, @ebay_message_id, @thread_id, @category, @received_at
    )
  `);

  // For dedupes (INSERT OR IGNORE returned 0 changes) we need to fetch the
  // existing row id to put in the result envelope. Only meaningful when
  // ebay_message_id is present — that's where the partial unique index lives.
  const findExistingMessageId = opts.db.prepare<[string, string]>(`
    SELECT id FROM messages
     WHERE user_id = ? AND ebay_message_id = ?
  `);

  fastify.post("/api/v1/ingest/messages", async (request, reply) => {
    // 1. Idempotency-Key required.
    const idempotencyKey = readIdempotencyKey(request.headers);
    if (!idempotencyKey) {
      return reply.code(400).send({ error: "missing_idempotency_key" });
    }

    // 2. Validate body. 422 with Zod issue tree on failure (mirrors devDraft).
    const parsed = IngestMessageBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: "validation_error",
        issues: parsed.error.issues,
      });
    }
    const batch: IngestMessageBatch = parsed.data;

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
        // Replay: rebuild the body with replayed=true. The cached body
        // would say replayed=false (it was the original response), so we
        // flip the flag here so callers can tell.
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

    // 4 + 5. Process the batch and persist the idempotency cache row in
    //       a single transaction.
    const results: IngestMessageResult[] = [];
    let inserted = 0;
    let deduped = 0;
    let skipped = 0;

    const writeAll = opts.db.transaction(() => {
      for (const msg of batch.messages) {
        const { scrubbed: scrubbedBody } = scrubPii(msg.body);
        const newId = randomUUID();
        const ebayMessageId = msg.ebayMessageId ?? null;
        const receivedAt = msg.receivedAt ?? new Date().toISOString();

        const runResult = insertMessage.run({
          id: newId,
          user_id: V0_USER_ID,
          buyer_username: msg.buyerUsername,
          body: msg.body,
          pii_scrubbed_body: scrubbedBody,
          ebay_item_id: msg.ebayItemId ?? null,
          ebay_message_id: ebayMessageId,
          thread_id: msg.threadId ?? null,
          category: null,
          received_at: receivedAt,
        });

        if (runResult.changes === 1) {
          inserted += 1;
          results.push({
            ebay_message_id: ebayMessageId,
            status: "inserted",
            message_id: newId,
          });
        } else {
          // INSERT OR IGNORE returned 0 changes → row was a dupe on the
          // partial unique index (only fires when ebay_message_id is set).
          if (ebayMessageId) {
            const existing = findExistingMessageId.get(
              V0_USER_ID,
              ebayMessageId,
            ) as { id: string } | undefined;
            deduped += 1;
            results.push({
              ebay_message_id: ebayMessageId,
              status: "deduped",
              message_id: existing?.id ?? null,
            });
          } else {
            // No ebay_message_id and the unique constraint can't fire — if
            // changes=0 here something else swallowed the insert. Treat as
            // "skipped" so we don't lie about either inserted or deduped.
            skipped += 1;
            results.push({
              ebay_message_id: null,
              status: "skipped",
              message_id: null,
            });
          }
        }
      }

      const responseBody: IngestResponse = {
        inserted,
        deduped,
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
 * Header name lookup is case-insensitive on the wire and Fastify
 * lowercases keys, but we accept either spelling defensively.
 */
function readIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers["idempotency-key"] ?? headers["Idempotency-Key"];
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  if (typeof raw === "string") return raw.trim() || null;
  return null;
}

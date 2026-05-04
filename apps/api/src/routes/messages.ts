/**
 * V0 Days 4-5-6 message inbox + lifecycle.
 *
 *   GET  /api/v1/messages                    list (filtered, cursor-paginated)
 *   GET  /api/v1/messages/:id                detail (message + listing + latest draft)
 *   POST /api/v1/messages/:id/draft          generate first draft (no-op if already exists)
 *   POST /api/v1/messages/:id/regenerate     always create a new version
 *   POST /api/v1/messages/:id/approve        approve latest, optionally with edits
 *   POST /api/v1/messages/:id/skip           mark needs-human (no draft to ship)
 *   POST /api/v1/messages/:id/mark-sent      V0 prepare-and-paste send confirm
 *
 * Per CLAUDE.md:
 *   #1  No auto-send — even V0 only flips drafts.status='sent' after explicit
 *       /approve THEN /mark-sent. The route never sends to eBay itself.
 *   #4  Multi-tenant from D1: every WHERE clause includes user_id = V0_USER_ID.
 *   #6  Idempotency-Key required on every mutating POST.
 *   #10 Audit log on every LLM call (handled by services/drafting.ts).
 *   #12 PII scrubbing default-on (services/drafting reuses messages.pii_scrubbed_body).
 *
 *   V1.5 cuts: learned_edits stores the (full draft, full edited text) pair
 *   verbatim — phrase-mining + auto-promotion is V1.5, NOT V0.
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import {
  ApproveDraftRequestSchema,
  type ApproveDraftResponse,
  type DraftSnapshot,
  type MessageDetail,
  type MessageListItem,
  type MessageListResponse,
  MessageListQuerySchema,
  MarkSentRequestSchema,
  type MarkSentResponse,
  type RegenerateResponse,
  type SkipMessageResponse,
} from "@app/shared";
import type { DB } from "../db.js";
import { V0_USER_ID } from "../constants.js";
import {
  hashRequest,
  IdempotencyConflictError,
  lookupIdempotent,
  recordIdempotent,
} from "../idempotency.js";
import {
  buildDraftForMessage,
  draftRowToSnapshot,
  getDraftCostCents,
  getLatestDraftRow,
  getListingForMessage,
  getMessageById,
  MessageNotFoundError,
} from "../services/drafting.js";
import type { GenerateDraftOptions } from "../llm.js";

export interface MessagesRouteOptions {
  db: DB;
  /** Tests inject a mocked OpenAI-shaped client through here. */
  llmOptions?: GenerateDraftOptions;
}

const BODY_PREVIEW_LENGTH = 120;

function readIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers["idempotency-key"] ?? headers["Idempotency-Key"];
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  if (typeof raw === "string") return raw.trim() || null;
  return null;
}

/**
 * Shared idempotency wrapper for the 6 mutating message routes. The
 * mutation response schemas don't carry a `replayed` flag — V0 just
 * returns the cached body verbatim on replay (idempotent by nature).
 *
 * Returns:
 *   - "missing"  → caller should 400.
 *   - "conflict" → caller should 409.
 *   - { hit: ...} when the request was a successful replay; caller sends it.
 *   - { proceed: { key, hash } } when this is a new request; caller mutates,
 *     then calls `recordIdempotent` with the response inside the same tx.
 */
type IdempotencyGate =
  | { kind: "missing" }
  | { kind: "conflict" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "proceed"; key: string; requestHash: string };

function gateIdempotency(
  db: DB,
  request: FastifyRequest,
): IdempotencyGate {
  const key = readIdempotencyKey(request.headers);
  if (!key) return { kind: "missing" };
  const requestHash = hashRequest(request.body ?? {});
  try {
    const hit = lookupIdempotent({
      db,
      userId: V0_USER_ID,
      key,
      requestHash,
    });
    if (hit) {
      return { kind: "replay", status: hit.status, body: hit.body };
    }
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      return { kind: "conflict" };
    }
    throw err;
  }
  return { kind: "proceed", key, requestHash };
}

interface MessageDetailRow {
  id: string;
  user_id: string;
  buyer_username: string;
  body: string;
  pii_scrubbed_body: string;
  ebay_item_id: string | null;
  ebay_message_id: string | null;
  thread_id: string | null;
  category: string | null;
  received_at: string;
}

interface MessageListRow {
  id: string;
  buyer_username: string;
  body: string;
  ebay_item_id: string | null;
  ebay_message_id: string | null;
  category: string | null;
  received_at: string;
  draft_id: string | null;
  draft_status: string | null;
  draft_confidence: number | null;
  draft_flags: string | null;
  draft_approved_at: string | null;
  draft_sent_at: string | null;
  draft_skipped_at: string | null;
}

function bodyPreview(body: string): string {
  if (body.length <= BODY_PREVIEW_LENGTH) return body;
  return body.slice(0, BODY_PREVIEW_LENGTH);
}

function rowToListItem(row: MessageListRow): MessageListItem {
  // Status mapping: when no drafts row → 'no_draft'; otherwise the draft's
  // own status field directly. The lifecycle is owned by the latest draft.
  const status = (row.draft_id ? row.draft_status : "no_draft") as
    | MessageListItem["status"];
  let flags: MessageListItem["draft_flags"] = [];
  if (row.draft_flags) {
    try {
      flags = JSON.parse(row.draft_flags) as MessageListItem["draft_flags"];
    } catch {
      flags = [];
    }
  }
  return {
    id: row.id,
    buyer_username: row.buyer_username,
    ebay_item_id: row.ebay_item_id,
    ebay_message_id: row.ebay_message_id,
    body_preview: bodyPreview(row.body),
    category: row.category as MessageListItem["category"],
    status,
    draft_id: row.draft_id,
    draft_confidence: row.draft_confidence,
    draft_flags: flags,
    received_at: row.received_at,
    approved_at: row.draft_approved_at,
    sent_at: row.draft_sent_at,
    skipped_at: row.draft_skipped_at,
  };
}

/**
 * SQL builder for the list endpoint. We JOIN messages with the latest draft
 * via a subquery (max(version) per message_id) so each row gets at most one
 * draft companion. Filter clauses are added conditionally; cursor is a
 * `${received_at}|${id}` pair compared lexicographically (received_at is
 * ISO-8601 so plain string ordering matches chronological ordering).
 */
function buildListQuery(args: {
  status?: string;
  category?: string;
  cursor?: string;
  limit: number;
}): { sql: string; params: unknown[] } {
  const where: string[] = ["m.user_id = ?"];
  const params: unknown[] = [V0_USER_ID];

  if (args.category) {
    where.push("m.category = ?");
    params.push(args.category);
  }
  if (args.status) {
    if (args.status === "no_draft") {
      where.push("d.id IS NULL");
    } else {
      where.push("d.status = ?");
      params.push(args.status);
    }
  }
  if (args.cursor) {
    // Cursor = "<received_at>|<id>". Strict descending order means we want
    // rows STRICTLY older than the cursor: (received_at < c.t) OR
    // (received_at = c.t AND id < c.id). Both columns indexed on (user_id,
    // received_at desc), id is PK.
    const sep = args.cursor.lastIndexOf("|");
    const cursorReceivedAt = sep === -1 ? args.cursor : args.cursor.slice(0, sep);
    const cursorId = sep === -1 ? "" : args.cursor.slice(sep + 1);
    where.push(
      "(m.received_at < ? OR (m.received_at = ? AND m.id < ?))",
    );
    params.push(cursorReceivedAt, cursorReceivedAt, cursorId);
  }

  // Subquery picks the max-version draft per message; the LEFT JOIN keeps
  // messages that have no draft yet (status='no_draft' in the response).
  const sql = `
    SELECT m.id, m.buyer_username, m.body, m.ebay_item_id, m.ebay_message_id,
           m.category, m.received_at,
           d.id AS draft_id, d.status AS draft_status,
           d.confidence AS draft_confidence, d.flags AS draft_flags,
           d.approved_at AS draft_approved_at, d.sent_at AS draft_sent_at,
           d.skipped_at AS draft_skipped_at
      FROM messages m
      LEFT JOIN (
        SELECT d1.*
          FROM drafts d1
          JOIN (
            SELECT message_id, MAX(version) AS max_version
              FROM drafts
             GROUP BY message_id
          ) latest
            ON latest.message_id = d1.message_id
           AND latest.max_version = d1.version
      ) d ON d.message_id = m.id
     WHERE ${where.join(" AND ")}
     ORDER BY m.received_at DESC, m.id DESC
     LIMIT ?
  `;
  // Fetch limit+1 so we can detect has_more without a count query.
  params.push(args.limit + 1);
  return { sql, params };
}

export const messagesRoute: FastifyPluginAsync<MessagesRouteOptions> = async (
  fastify,
  opts,
) => {
  // ----------------------------------------------------------------- LIST
  fastify.get("/api/v1/messages", async (request, reply) => {
    const parsed = MessageListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(422).send({
        error: "validation_error",
        issues: parsed.error.issues,
      });
    }
    const q = parsed.data;

    const built = buildListQuery({
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.cursor ? { cursor: q.cursor } : {}),
      limit: q.limit,
    });
    const rows = opts.db.prepare(built.sql).all(...built.params) as MessageListRow[];

    const hasMore = rows.length > q.limit;
    const pageRows = hasMore ? rows.slice(0, q.limit) : rows;
    const data = pageRows.map(rowToListItem);

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!;
      nextCursor = `${last.received_at}|${last.id}`;
    }

    // Cheap on V0 dataset; surfaces the inbox-pending counter for the dashboard.
    const totalPendingRow = opts.db
      .prepare<[string]>(
        `SELECT COUNT(*) AS c FROM messages m
          LEFT JOIN (
            SELECT d1.*
              FROM drafts d1
              JOIN (
                SELECT message_id, MAX(version) AS max_version
                  FROM drafts
                 GROUP BY message_id
              ) latest
                ON latest.message_id = d1.message_id
               AND latest.max_version = d1.version
          ) d ON d.message_id = m.id
          WHERE m.user_id = ?
            AND (d.id IS NULL OR d.status = 'drafted')`,
      )
      .get(V0_USER_ID) as { c: number };

    const response: MessageListResponse = {
      data,
      next_cursor: nextCursor,
      has_more: hasMore,
      total_pending: totalPendingRow.c,
    };
    return reply.code(200).send(response);
  });

  // ----------------------------------------------------------------- DETAIL
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/messages/:id",
    async (request, reply) => {
      const messageId = request.params.id;
      const message = getMessageById(opts.db, messageId) as
        | MessageDetailRow
        | null;
      if (!message) {
        return reply.code(404).send({ error: "message_not_found" });
      }

      let listing: MessageDetail["listing"] = null;
      if (message.ebay_item_id) {
        const lr = getListingForMessage(opts.db, message.ebay_item_id);
        if (lr) {
          let kbJson: unknown;
          try {
            kbJson = JSON.parse(lr.kb_json);
          } catch {
            kbJson = null;
          }
          const titleFromKb =
            kbJson &&
            typeof kbJson === "object" &&
            "title" in (kbJson as Record<string, unknown>) &&
            typeof (kbJson as Record<string, unknown>).title === "string"
              ? ((kbJson as Record<string, unknown>).title as string)
              : undefined;
          listing = {
            ebay_item_id: lr.ebay_item_id,
            ...(titleFromKb !== undefined ? { title: titleFromKb } : {}),
            kb_json: kbJson,
          };
        }
      }

      let draft: DraftSnapshot | null = null;
      const latestDraft = getLatestDraftRow(opts.db, messageId);
      if (latestDraft) {
        const cost = getDraftCostCents(opts.db, latestDraft.id);
        draft = draftRowToSnapshot(latestDraft, cost);
      }

      const status = (
        latestDraft ? latestDraft.status : "no_draft"
      ) as MessageDetail["status"];

      const buyerHistoryRow = opts.db
        .prepare<[string, string, string]>(
          `SELECT COUNT(*) AS c FROM messages
            WHERE user_id = ? AND buyer_username = ? AND id != ?`,
        )
        .get(V0_USER_ID, message.buyer_username, messageId) as { c: number };

      const detail: MessageDetail = {
        message: {
          id: message.id,
          user_id: message.user_id,
          buyer_username: message.buyer_username,
          body: message.body,
          pii_scrubbed_body: message.pii_scrubbed_body,
          ebay_item_id: message.ebay_item_id,
          ebay_message_id: message.ebay_message_id,
          thread_id: message.thread_id,
          category: message.category as MessageDetail["message"]["category"],
          received_at: message.received_at,
        },
        listing,
        draft,
        status,
        buyer_history_count: buyerHistoryRow.c,
      };
      return reply.code(200).send(detail);
    },
  );

  // ---------------------------------------------------------- POST /draft
  fastify.post<{ Params: { id: string } }>(
    "/api/v1/messages/:id/draft",
    async (request, reply) => {
      const gate = gateIdempotency(opts.db, request);
      if (gate.kind === "missing") {
        return reply.code(400).send({ error: "missing_idempotency_key" });
      }
      if (gate.kind === "conflict") {
        return reply.code(409).send({ error: "idempotency_key_reuse" });
      }
      if (gate.kind === "replay") {
        return reply.code(gate.status).send(gate.body);
      }

      const messageId = request.params.id;
      const existing = getMessageById(opts.db, messageId);
      if (!existing) {
        return reply.code(404).send({ error: "message_not_found" });
      }

      // If a draft already exists, return it without spending tokens.
      const existingDraft = getLatestDraftRow(opts.db, messageId);
      if (existingDraft) {
        const cost = getDraftCostCents(opts.db, existingDraft.id);
        const responseBody: RegenerateResponse = {
          ok: true,
          draft: draftRowToSnapshot(existingDraft, cost),
        };
        recordIdempotent({
          db: opts.db,
          userId: V0_USER_ID,
          key: gate.key,
          requestHash: gate.requestHash,
          status: 200,
          body: responseBody,
        });
        return reply.code(200).send(responseBody);
      }

      // No existing draft → build one. Errors propagate as 500 by default;
      // we surface a 502 for upstream LLM failures (mirrors devDraft).
      let snapshot: DraftSnapshot;
      try {
        snapshot = await buildDraftForMessage({
          db: opts.db,
          messageId,
          ...(opts.llmOptions ? { llmOptions: opts.llmOptions } : {}),
        });
      } catch (err) {
        if (err instanceof MessageNotFoundError) {
          return reply.code(404).send({ error: "message_not_found" });
        }
        request.log.error({ err }, "buildDraftForMessage threw");
        return reply.code(502).send({
          error: "upstream_error",
          message: err instanceof Error ? err.message : "unknown",
        });
      }
      const responseBody: RegenerateResponse = { ok: true, draft: snapshot };
      recordIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: gate.key,
        requestHash: gate.requestHash,
        status: 201,
        body: responseBody,
      });
      return reply.code(201).send(responseBody);
    },
  );

  // ----------------------------------------------------- POST /regenerate
  fastify.post<{ Params: { id: string } }>(
    "/api/v1/messages/:id/regenerate",
    async (request, reply) => {
      const gate = gateIdempotency(opts.db, request);
      if (gate.kind === "missing") {
        return reply.code(400).send({ error: "missing_idempotency_key" });
      }
      if (gate.kind === "conflict") {
        return reply.code(409).send({ error: "idempotency_key_reuse" });
      }
      if (gate.kind === "replay") {
        return reply.code(gate.status).send(gate.body);
      }

      const messageId = request.params.id;
      const existing = getMessageById(opts.db, messageId);
      if (!existing) {
        return reply.code(404).send({ error: "message_not_found" });
      }

      let snapshot: DraftSnapshot;
      try {
        snapshot = await buildDraftForMessage({
          db: opts.db,
          messageId,
          ...(opts.llmOptions ? { llmOptions: opts.llmOptions } : {}),
        });
      } catch (err) {
        if (err instanceof MessageNotFoundError) {
          return reply.code(404).send({ error: "message_not_found" });
        }
        request.log.error({ err }, "buildDraftForMessage threw (regenerate)");
        return reply.code(502).send({
          error: "upstream_error",
          message: err instanceof Error ? err.message : "unknown",
        });
      }
      const responseBody: RegenerateResponse = { ok: true, draft: snapshot };
      recordIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: gate.key,
        requestHash: gate.requestHash,
        status: 201,
        body: responseBody,
      });
      return reply.code(201).send(responseBody);
    },
  );

  // -------------------------------------------------------- POST /approve
  fastify.post<{ Params: { id: string } }>(
    "/api/v1/messages/:id/approve",
    async (request, reply) => {
      const gate = gateIdempotency(opts.db, request);
      if (gate.kind === "missing") {
        return reply.code(400).send({ error: "missing_idempotency_key" });
      }
      if (gate.kind === "conflict") {
        return reply.code(409).send({ error: "idempotency_key_reuse" });
      }
      if (gate.kind === "replay") {
        return reply.code(gate.status).send(gate.body);
      }

      const parsed = ApproveDraftRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(422).send({
          error: "validation_error",
          issues: parsed.error.issues,
        });
      }
      const editedText = parsed.data.editedText;

      const messageId = request.params.id;
      const message = getMessageById(opts.db, messageId);
      if (!message) {
        return reply.code(404).send({ error: "message_not_found" });
      }
      const draftRow = getLatestDraftRow(opts.db, messageId);
      if (!draftRow) {
        return reply.code(409).send({ error: "no_draft_to_approve" });
      }
      if (draftRow.status === "sent" || draftRow.status === "skipped") {
        return reply.code(409).send({ error: "draft_status_not_approvable" });
      }

      const learnedEditCaptured =
        typeof editedText === "string" && editedText !== draftRow.draft_text;

      const approvedAt = new Date().toISOString();
      const updateDraft = opts.db.prepare(`
        UPDATE drafts
           SET status = 'approved',
               approved_at = ?,
               edited_text = ?
         WHERE id = ?
      `);
      const insertLearnedEdit = opts.db.prepare(`
        INSERT INTO learned_edits (
          id, user_id, category, original_phrase, preferred_phrase,
          observation_count
        ) VALUES (?, ?, ?, ?, ?, 1)
      `);

      const tx = opts.db.transaction(() => {
        updateDraft.run(
          approvedAt,
          editedText ?? null,
          draftRow.id,
        );
        if (learnedEditCaptured) {
          insertLearnedEdit.run(
            randomUUID(),
            V0_USER_ID,
            draftRow.category,
            draftRow.draft_text,
            editedText,
          );
        }
      });
      tx();

      const refreshed = getLatestDraftRow(opts.db, messageId)!;
      const cost = getDraftCostCents(opts.db, refreshed.id);
      const snapshot = draftRowToSnapshot(refreshed, cost);

      const responseBody: ApproveDraftResponse = {
        ok: true,
        draft: snapshot,
        learned_edit_captured: learnedEditCaptured,
      };
      recordIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: gate.key,
        requestHash: gate.requestHash,
        status: 200,
        body: responseBody,
      });
      return reply.code(200).send(responseBody);
    },
  );

  // ------------------------------------------------------------ POST /skip
  fastify.post<{ Params: { id: string } }>(
    "/api/v1/messages/:id/skip",
    async (request, reply) => {
      const gate = gateIdempotency(opts.db, request);
      if (gate.kind === "missing") {
        return reply.code(400).send({ error: "missing_idempotency_key" });
      }
      if (gate.kind === "conflict") {
        return reply.code(409).send({ error: "idempotency_key_reuse" });
      }
      if (gate.kind === "replay") {
        return reply.code(gate.status).send(gate.body);
      }

      const messageId = request.params.id;
      const message = getMessageById(opts.db, messageId);
      if (!message) {
        return reply.code(404).send({ error: "message_not_found" });
      }

      const draftRow = getLatestDraftRow(opts.db, messageId);
      const skippedAt = new Date().toISOString();

      const insertSentinel = opts.db.prepare(`
        INSERT INTO drafts (
          id, message_id, version, draft_text, category, confidence,
          used_facts, flags, model, prompt_hash, generated_at, status,
          skipped_at
        ) VALUES (
          @id, @message_id, @version, '', 'other_unclear', 0,
          '[]', '[]', 'sentinel', @prompt_hash, @generated_at, 'skipped',
          @skipped_at
        )
      `);
      const updateExisting = opts.db.prepare(`
        UPDATE drafts SET status = 'skipped', skipped_at = ? WHERE id = ?
      `);

      const tx = opts.db.transaction(() => {
        if (!draftRow) {
          // No draft exists yet — insert a sentinel skipped row so status
          // transitions stay uniform (every message ends with a draft row).
          insertSentinel.run({
            id: randomUUID(),
            message_id: messageId,
            version: 1,
            prompt_hash: `sentinel:${messageId}`,
            generated_at: skippedAt,
            skipped_at: skippedAt,
          });
        } else {
          updateExisting.run(skippedAt, draftRow.id);
        }
      });
      tx();

      const responseBody: SkipMessageResponse = {
        ok: true,
        status: "skipped",
      };
      recordIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: gate.key,
        requestHash: gate.requestHash,
        status: 200,
        body: responseBody,
      });
      return reply.code(200).send(responseBody);
    },
  );

  // ------------------------------------------------------ POST /mark-sent
  fastify.post<{ Params: { id: string } }>(
    "/api/v1/messages/:id/mark-sent",
    async (request, reply) => {
      const gate = gateIdempotency(opts.db, request);
      if (gate.kind === "missing") {
        return reply.code(400).send({ error: "missing_idempotency_key" });
      }
      if (gate.kind === "conflict") {
        return reply.code(409).send({ error: "idempotency_key_reuse" });
      }
      if (gate.kind === "replay") {
        return reply.code(gate.status).send(gate.body);
      }

      const parsed = MarkSentRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(422).send({
          error: "validation_error",
          issues: parsed.error.issues,
        });
      }
      const sendMethod = parsed.data.send_method;

      const messageId = request.params.id;
      const message = getMessageById(opts.db, messageId);
      if (!message) {
        return reply.code(404).send({ error: "message_not_found" });
      }
      const draftRow = getLatestDraftRow(opts.db, messageId);
      if (!draftRow) {
        return reply.code(409).send({ error: "no_draft_to_send" });
      }
      // CLAUDE.md #1: never auto-send. mark-sent only flips an *approved*
      // draft to sent. Drafted/sent/skipped all 409.
      if (draftRow.status !== "approved") {
        return reply.code(409).send({ error: "draft_not_approved" });
      }

      const sentAt = new Date().toISOString();
      opts.db
        .prepare(
          `UPDATE drafts SET status = 'sent', sent_at = ?, send_method = ? WHERE id = ?`,
        )
        .run(sentAt, sendMethod, draftRow.id);

      const responseBody: MarkSentResponse = {
        ok: true,
        sent_at: sentAt,
      };
      recordIdempotent({
        db: opts.db,
        userId: V0_USER_ID,
        key: gate.key,
        requestHash: gate.requestHash,
        status: 200,
        body: responseBody,
      });
      return reply.code(200).send(responseBody);
    },
  );
};


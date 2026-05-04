/**
 * POST /api/v1/dev/draft — V0's only meaningful endpoint.
 *
 * The day-1 paste-and-draft loop (EXECUTION_PLAN.md V0 Day 1):
 *   1. Validate body against DraftRequestSchema (Zod).
 *   2. PII-scrub the buyer body before any Claude call (CLAUDE.md #12).
 *   3. Insert messages row with both raw + scrubbed bodies.
 *   4. Call Claude.
 *   5. Persist drafts + llm_calls in a single transaction (CLAUDE.md #10).
 *   6. Return DraftResponse.
 *
 * Multi-tenant from D1 (CLAUDE.md #4): every row carries user_id. V0
 * hardcodes "u-bayu" — V1 pulls from the auth context.
 */
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import {
  DraftRequestSchema,
  type DraftRequest,
  type DraftResponse,
} from "@app/shared";
import { scrubPii } from "@app/prompts";
import { generateDraft, type GenerateDraftOptions } from "../llm.js";
import type { DB } from "../db.js";
import { V0_USER_ID } from "../constants.js";

export interface DevDraftRouteOptions {
  db: DB;
  /** For tests: inject a mocked Anthropic-shaped client. */
  llmOptions?: GenerateDraftOptions;
}

interface PreparedStatements {
  insertMessage: ReturnType<DB["prepare"]>;
  insertDraft: ReturnType<DB["prepare"]>;
  insertLlmCall: ReturnType<DB["prepare"]>;
}

function prepareStatements(db: DB): PreparedStatements {
  return {
    insertMessage: db.prepare(`
      INSERT INTO messages (
        id, user_id, buyer_username, body, pii_scrubbed_body,
        ebay_item_id, ebay_message_id, thread_id, category, received_at
      ) VALUES (
        @id, @user_id, @buyer_username, @body, @pii_scrubbed_body,
        @ebay_item_id, @ebay_message_id, @thread_id, @category, @received_at
      )
    `),
    insertDraft: db.prepare(`
      INSERT INTO drafts (
        id, message_id, version, draft_text, category, confidence,
        used_facts, flags, model, prompt_hash, generated_at
      ) VALUES (
        @id, @message_id, 1, @draft_text, @category, @confidence,
        @used_facts, @flags, @model, @prompt_hash, @generated_at
      )
    `),
    insertLlmCall: db.prepare(`
      INSERT INTO llm_calls (
        id, user_id, message_id, draft_id, model, prompt_hash,
        tokens_in, tokens_out, cache_read_tokens, cost_cents,
        cache_hit, latency_ms
      ) VALUES (
        @id, @user_id, @message_id, @draft_id, @model, @prompt_hash,
        @tokens_in, @tokens_out, @cache_read_tokens, @cost_cents,
        @cache_hit, @latency_ms
      )
    `),
  };
}

export const devDraftRoute: FastifyPluginAsync<DevDraftRouteOptions> = async (
  fastify,
  opts,
) => {
  const stmts = prepareStatements(opts.db);

  fastify.post("/api/v1/dev/draft", async (request, reply) => {
    // 1. Validate. Reply 422 with the same Zod issue tree the dashboard
    //    will eventually surface — keeps error envelopes stable.
    const parsed = DraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: "validation_error",
        issues: parsed.error.issues,
      });
    }
    const draftRequest: DraftRequest = parsed.data;

    // 2. PII-scrub before persist + before LLM. Default-on per CLAUDE.md #12.
    const { scrubbed: scrubbedBody } = scrubPii(draftRequest.message.body);

    // The DraftRequest forwarded into Claude must use the scrubbed body —
    // the original buyer text never leaves this process.
    const scrubbedRequest: DraftRequest = {
      ...draftRequest,
      message: {
        ...draftRequest.message,
        // Force the multi-tenant userId to the V0 constant. The body the
        // model sees is the scrubbed one.
        userId: V0_USER_ID,
        body: scrubbedBody,
      },
    };

    const messageId = randomUUID();
    const receivedAt =
      draftRequest.message.receivedAt ?? new Date().toISOString();

    // 3. Insert the message row first — even if Claude blows up we keep
    //    the buyer message for retry.
    stmts.insertMessage.run({
      id: messageId,
      user_id: V0_USER_ID,
      buyer_username: draftRequest.message.buyerUsername,
      body: draftRequest.message.body,
      pii_scrubbed_body: scrubbedBody,
      ebay_item_id: draftRequest.message.ebayItemId ?? null,
      ebay_message_id: draftRequest.message.ebayMessageId ?? null,
      thread_id: draftRequest.message.threadId ?? null,
      category: null,
      received_at: receivedAt,
    });

    // 4. Call Claude. Track wall-clock for the llm_calls row.
    const startedAt = Date.now();
    let draftResponse: DraftResponse;
    try {
      draftResponse = await generateDraft(scrubbedRequest, opts.llmOptions);
    } catch (err) {
      request.log.error({ err }, "generateDraft threw");
      return reply.code(502).send({
        error: "upstream_error",
        message: err instanceof Error ? err.message : "unknown",
      });
    }
    const latencyMs = Date.now() - startedAt;

    // 5. Persist drafts + llm_calls atomically. If either insert fails we
    //    don't want a half-written audit trail.
    const draftId = randomUUID();
    const llmCallId = randomUUID();
    // The prompt hash that should match the audit row — recomputed by
    // buildDraftPrompt inside generateDraft. We don't get it back from
    // generateDraft today (DraftResponse doesn't carry it); when the
    // prompts package matures we'll thread it through. For V0, hash the
    // model + scrubbed body as a coarse correlator.
    const promptHash = `${draftResponse.model}:${messageId}`;

    const persist = opts.db.transaction(() => {
      stmts.insertDraft.run({
        id: draftId,
        message_id: messageId,
        draft_text: draftResponse.draft,
        category: draftResponse.category,
        confidence: draftResponse.confidence,
        used_facts: JSON.stringify(draftResponse.used_facts),
        flags: JSON.stringify(draftResponse.flags),
        model: draftResponse.model,
        prompt_hash: promptHash,
        generated_at: draftResponse.generated_at,
      });
      stmts.insertLlmCall.run({
        id: llmCallId,
        user_id: V0_USER_ID,
        message_id: messageId,
        draft_id: draftId,
        model: draftResponse.model,
        prompt_hash: promptHash,
        tokens_in: draftResponse.tokens_in,
        tokens_out: draftResponse.tokens_out,
        cache_read_tokens: draftResponse.cache_read_tokens,
        cost_cents: draftResponse.cost_cents,
        cache_hit: draftResponse.cache_read_tokens > 0 ? 1 : 0,
        latency_ms: latencyMs,
      });
    });
    persist();

    return reply.code(201).send(draftResponse);
  });
};

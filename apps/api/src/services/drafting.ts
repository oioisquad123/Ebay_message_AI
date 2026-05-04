/**
 * Shared "build a draft for an existing message row" helper.
 *
 * Pulled out of /dev/draft (which still owns the create-message-and-draft-
 * in-one-shot path) so the V0 Days 4-5 routes (POST /draft, /regenerate)
 * can reuse the same flow:
 *
 *   1. Look up the message (404 if missing — V0 scopes by V0_USER_ID).
 *   2. Look up the matching listing for `listingKb` grounding (optional).
 *   3. Compute the next version number (max existing + 1).
 *   4. Call generateDraft using the message's already-PII-scrubbed body.
 *   5. Persist drafts + llm_calls in a single transaction.
 *   6. Backfill messages.category from the AI output if not already set.
 *
 * The /dev/draft route keeps its own inline path because it accepts a
 * fresh DraftRequest with no existing message row — this helper assumes the
 * message already lives in the DB.
 */
import { randomUUID } from "node:crypto";
import {
  type BrandVoicePreset,
  type DraftFlag,
  type DraftRequest,
  type DraftResponse,
  type DraftSnapshot,
  type ListingKb,
} from "@app/shared";
import { generateDraft, type GenerateDraftOptions } from "../llm.js";
import type { DB } from "../db.js";
import { V0_USER_ID } from "../constants.js";

/** 404-style error the routes map to a 404 reply. */
export class MessageNotFoundError extends Error {
  constructor(public readonly messageId: string) {
    super(`message not found: ${messageId}`);
    this.name = "MessageNotFoundError";
  }
}

export interface BuildDraftForMessageOpts {
  db: DB;
  messageId: string;
  /** Override of brand voice. Defaults to "friendly" for V0. */
  brandVoice?: BrandVoicePreset;
  llmOptions?: GenerateDraftOptions;
}

interface MessageRow {
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

interface ListingRow {
  id: string;
  user_id: string;
  ebay_item_id: string;
  kb_json: string;
  last_synced_at: string;
}

interface DraftRow {
  id: string;
  message_id: string;
  version: number;
  draft_text: string;
  edited_text: string | null;
  category: string;
  confidence: number;
  used_facts: string;
  flags: string;
  model: string;
  prompt_hash: string;
  generated_at: string;
  approved_at: string | null;
  sent_at: string | null;
  status: string;
  skipped_at: string | null;
  send_method: string | null;
}

/** Look up a message row by id, scoped to the V0 user. */
export function getMessageById(db: DB, messageId: string): MessageRow | null {
  const row = db
    .prepare<[string, string]>(
      `SELECT id, user_id, buyer_username, body, pii_scrubbed_body,
              ebay_item_id, ebay_message_id, thread_id, category, received_at
         FROM messages
        WHERE user_id = ? AND id = ?`,
    )
    .get(V0_USER_ID, messageId) as MessageRow | undefined;
  return row ?? null;
}

/** Look up a listing for grounding, scoped to the V0 user + ebay item id. */
export function getListingForMessage(
  db: DB,
  ebayItemId: string,
): ListingRow | null {
  const row = db
    .prepare<[string, string]>(
      `SELECT id, user_id, ebay_item_id, kb_json, last_synced_at
         FROM listings
        WHERE user_id = ? AND ebay_item_id = ?`,
    )
    .get(V0_USER_ID, ebayItemId) as ListingRow | undefined;
  return row ?? null;
}

/** Latest (max version) draft row for a message, or null if none exists. */
export function getLatestDraftRow(
  db: DB,
  messageId: string,
): DraftRow | null {
  const row = db
    .prepare<[string]>(
      `SELECT id, message_id, version, draft_text, edited_text, category,
              confidence, used_facts, flags, model, prompt_hash, generated_at,
              approved_at, sent_at, status, skipped_at, send_method
         FROM drafts
        WHERE message_id = ?
        ORDER BY version DESC
        LIMIT 1`,
    )
    .get(messageId) as DraftRow | undefined;
  return row ?? null;
}

/**
 * Convert a DB drafts row (joined with its llm_calls cost) into the
 * DraftSnapshot dashboard shape. used_facts/flags are stored as JSON text
 * — parse them back here so callers always see arrays.
 */
export function draftRowToSnapshot(
  row: DraftRow,
  costCents: number,
): DraftSnapshot {
  let usedFacts: string[] = [];
  let flags: DraftFlag[] = [];
  try {
    usedFacts = JSON.parse(row.used_facts) as string[];
  } catch {
    usedFacts = [];
  }
  try {
    flags = JSON.parse(row.flags) as DraftFlag[];
  } catch {
    flags = [];
  }
  return {
    id: row.id,
    version: row.version,
    draft_text: row.draft_text,
    edited_text: row.edited_text,
    category: row.category as DraftSnapshot["category"],
    confidence: row.confidence,
    used_facts: usedFacts,
    flags,
    model: row.model,
    status: row.status as DraftSnapshot["status"],
    generated_at: row.generated_at,
    approved_at: row.approved_at,
    sent_at: row.sent_at,
    skipped_at: row.skipped_at,
    cost_cents: costCents,
  };
}

/**
 * Sum of cost_cents across all llm_calls rows for a draft. Lets us surface
 * "how much did the regeneration chain cost" later — for now there's
 * exactly one llm_calls row per draft.
 */
export function getDraftCostCents(db: DB, draftId: string): number {
  const row = db
    .prepare<[string]>(
      `SELECT cost_cents FROM llm_calls WHERE draft_id = ?`,
    )
    .get(draftId) as { cost_cents: number } | undefined;
  return row?.cost_cents ?? 0;
}

/**
 * Build a DraftRequest for an existing message row + (optional) listing.
 * Uses the message's `pii_scrubbed_body` (NEVER the raw body — the model
 * must only ever see scrubbed text per CLAUDE.md #12).
 */
function buildDraftRequest(
  message: MessageRow,
  listingKb: ListingKb | undefined,
  brandVoice: BrandVoicePreset,
): DraftRequest {
  return {
    message: {
      userId: V0_USER_ID,
      buyerUsername: message.buyer_username,
      body: message.pii_scrubbed_body,
      ...(message.ebay_item_id ? { ebayItemId: message.ebay_item_id } : {}),
      ...(message.ebay_message_id
        ? { ebayMessageId: message.ebay_message_id }
        : {}),
      ...(message.thread_id ? { threadId: message.thread_id } : {}),
      receivedAt: message.received_at,
    },
    ...(listingKb ? { listingKb } : {}),
    brandVoice,
  };
}

/**
 * Generate a new draft version for a message. Returns the freshly-built
 * DraftSnapshot. Always inserts a NEW drafts row at version = max+1.
 *
 * This is the ONLY path the V0 message routes use to spend LLM tokens —
 * the routes themselves never call generateDraft directly.
 */
export async function buildDraftForMessage(
  opts: BuildDraftForMessageOpts,
): Promise<DraftSnapshot> {
  const message = getMessageById(opts.db, opts.messageId);
  if (!message) {
    throw new MessageNotFoundError(opts.messageId);
  }

  // Listing grounding is best-effort: if the buyer messaged about an item
  // we haven't scraped yet, the model still gets to draft, just without KB.
  let listingKb: ListingKb | undefined;
  if (message.ebay_item_id) {
    const listingRow = getListingForMessage(opts.db, message.ebay_item_id);
    if (listingRow) {
      try {
        listingKb = JSON.parse(listingRow.kb_json) as ListingKb;
      } catch {
        // Malformed kb_json — log via server logger isn't available here;
        // dropping to undefined matches "no listing" behavior.
        listingKb = undefined;
      }
    }
  }

  // Next version = (current max ?? 0) + 1. better-sqlite3 returns null when
  // no rows match MAX().
  const maxRow = opts.db
    .prepare<[string]>(
      `SELECT MAX(version) AS max_version FROM drafts WHERE message_id = ?`,
    )
    .get(opts.messageId) as { max_version: number | null } | undefined;
  const newVersion = (maxRow?.max_version ?? 0) + 1;

  const brandVoice: BrandVoicePreset = opts.brandVoice ?? "friendly";
  const draftRequest = buildDraftRequest(message, listingKb, brandVoice);

  // Track wall-clock for the llm_calls row.
  const startedAt = Date.now();
  const draftResponse: DraftResponse = await generateDraft(
    draftRequest,
    opts.llmOptions,
  );
  const latencyMs = Date.now() - startedAt;

  const draftId = randomUUID();
  const llmCallId = randomUUID();
  const promptHash = `${draftResponse.model}:${opts.messageId}:v${newVersion}`;

  const insertDraft = opts.db.prepare(`
    INSERT INTO drafts (
      id, message_id, version, draft_text, category, confidence,
      used_facts, flags, model, prompt_hash, generated_at, status
    ) VALUES (
      @id, @message_id, @version, @draft_text, @category, @confidence,
      @used_facts, @flags, @model, @prompt_hash, @generated_at, 'drafted'
    )
  `);
  const insertLlmCall = opts.db.prepare(`
    INSERT INTO llm_calls (
      id, user_id, message_id, draft_id, model, prompt_hash,
      tokens_in, tokens_out, cache_read_tokens, cost_cents,
      cache_hit, latency_ms
    ) VALUES (
      @id, @user_id, @message_id, @draft_id, @model, @prompt_hash,
      @tokens_in, @tokens_out, @cache_read_tokens, @cost_cents,
      @cache_hit, @latency_ms
    )
  `);
  const updateMessageCategory = opts.db.prepare(`
    UPDATE messages SET category = ?
     WHERE id = ? AND user_id = ? AND category IS NULL
  `);

  const persist = opts.db.transaction(() => {
    insertDraft.run({
      id: draftId,
      message_id: opts.messageId,
      version: newVersion,
      draft_text: draftResponse.draft,
      category: draftResponse.category,
      confidence: draftResponse.confidence,
      used_facts: JSON.stringify(draftResponse.used_facts),
      flags: JSON.stringify(draftResponse.flags),
      model: draftResponse.model,
      prompt_hash: promptHash,
      generated_at: draftResponse.generated_at,
    });
    insertLlmCall.run({
      id: llmCallId,
      user_id: V0_USER_ID,
      message_id: opts.messageId,
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
    // Backfill the message category from the model's output if we don't
    // already have one. Subsequent regenerates won't clobber a stored value.
    updateMessageCategory.run(
      draftResponse.category,
      opts.messageId,
      V0_USER_ID,
    );
  });
  persist();

  return {
    id: draftId,
    version: newVersion,
    draft_text: draftResponse.draft,
    edited_text: null,
    category: draftResponse.category,
    confidence: draftResponse.confidence,
    used_facts: draftResponse.used_facts,
    flags: draftResponse.flags,
    model: draftResponse.model,
    status: "drafted",
    generated_at: draftResponse.generated_at,
    approved_at: null,
    sent_at: null,
    skipped_at: null,
    cost_cents: draftResponse.cost_cents,
  };
}

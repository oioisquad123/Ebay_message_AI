import { z } from "zod";
import { CategoryEnum } from "./category.js";
import { DraftFlagEnum } from "./draft.js";

/**
 * V0 Days 4-5 message lifecycle.
 *
 * Status is owned by the latest draft row, not the message:
 *   no_draft   - message ingested, no draft generated yet
 *   drafted    - draft exists, waiting for seller review
 *   approved   - seller approved (with or without edits); awaiting send
 *   sent       - prepare-and-paste send completed (V0 Day 6)
 *   skipped    - seller marked needs-human-attention; no auto-draft to send
 *
 * The 9 PRD §14.3 "always flag" categories (returns_refunds, complaint_dispute)
 * arrive as `no_draft` and need explicit `skip` to clear them — V0 deliberately
 * does NOT auto-draft those.
 */
export const MessageStatusEnum = z.enum([
  "no_draft",
  "drafted",
  "approved",
  "sent",
  "skipped",
]);
export type MessageStatus = z.infer<typeof MessageStatusEnum>;

export const MessageListItemSchema = z.object({
  id: z.string(),
  buyer_username: z.string(),
  ebay_item_id: z.string().nullable(),
  ebay_message_id: z.string().nullable(),
  body_preview: z.string(), // first ~120 chars
  category: CategoryEnum.nullable(),
  status: MessageStatusEnum,
  draft_id: z.string().nullable(),
  draft_confidence: z.number().min(0).max(1).nullable(),
  draft_flags: z.array(DraftFlagEnum).default([]),
  received_at: z.string(),
  approved_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  skipped_at: z.string().nullable(),
});
export type MessageListItem = z.infer<typeof MessageListItemSchema>;

export const MessageListQuerySchema = z.object({
  status: MessageStatusEnum.optional(),
  category: CategoryEnum.optional(),
  cursor: z.string().optional(), // received_at|id encoded
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;

export const MessageListResponseSchema = z.object({
  data: z.array(MessageListItemSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  total_pending: z.number().int().nonnegative().optional(),
});
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

/** Snapshot of a draft as the dashboard sees it. */
export const DraftSnapshotSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  draft_text: z.string(),
  edited_text: z.string().nullable(),
  category: CategoryEnum,
  confidence: z.number().min(0).max(1),
  used_facts: z.array(z.string()),
  flags: z.array(DraftFlagEnum),
  model: z.string(),
  status: z.enum(["drafted", "approved", "sent", "skipped"]),
  generated_at: z.string(),
  approved_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  skipped_at: z.string().nullable(),
  cost_cents: z.number().nonnegative(),
});
export type DraftSnapshot = z.infer<typeof DraftSnapshotSchema>;

export const MessageDetailSchema = z.object({
  message: z.object({
    id: z.string(),
    user_id: z.string(),
    buyer_username: z.string(),
    body: z.string(),
    pii_scrubbed_body: z.string(),
    ebay_item_id: z.string().nullable(),
    ebay_message_id: z.string().nullable(),
    thread_id: z.string().nullable(),
    category: CategoryEnum.nullable(),
    received_at: z.string(),
  }),
  listing: z
    .object({
      ebay_item_id: z.string(),
      title: z.string().optional(),
      kb_json: z.unknown(), // raw passthrough; the dashboard inspects what's there
    })
    .nullable(),
  draft: DraftSnapshotSchema.nullable(),
  status: MessageStatusEnum,
  /** Other recent messages from the same buyer — useful context. */
  buyer_history_count: z.number().int().nonnegative(),
});
export type MessageDetail = z.infer<typeof MessageDetailSchema>;

export const ApproveDraftRequestSchema = z.object({
  /** Optional — if present, treated as an edit-and-approve. */
  editedText: z.string().optional(),
});
export type ApproveDraftRequest = z.infer<typeof ApproveDraftRequestSchema>;

export const ApproveDraftResponseSchema = z.object({
  ok: z.literal(true),
  draft: DraftSnapshotSchema,
  /** True iff the seller's text differed from the model output → captured into learned_edits. */
  learned_edit_captured: z.boolean(),
});
export type ApproveDraftResponse = z.infer<typeof ApproveDraftResponseSchema>;

export const SkipMessageResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal("skipped"),
});
export type SkipMessageResponse = z.infer<typeof SkipMessageResponseSchema>;

export const MarkSentRequestSchema = z.object({
  /** "paste" for V0 prepare-and-paste; "api" for V1 Compat App. */
  send_method: z.enum(["paste", "api"]).default("paste"),
});
export type MarkSentRequest = z.infer<typeof MarkSentRequestSchema>;

export const MarkSentResponseSchema = z.object({
  ok: z.literal(true),
  sent_at: z.string(),
});
export type MarkSentResponse = z.infer<typeof MarkSentResponseSchema>;

export const RegenerateResponseSchema = z.object({
  ok: z.literal(true),
  draft: DraftSnapshotSchema,
});
export type RegenerateResponse = z.infer<typeof RegenerateResponseSchema>;

/** A captured edit pair (full draft, full edited text). V0 stores as-is; V1.5 promotes phrase pairs. */
export const LearnedEditEntrySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  category: CategoryEnum,
  original_phrase: z.string(),
  preferred_phrase: z.string(),
  observation_count: z.number().int().nonnegative(),
  last_observed_at: z.string(),
});
export type LearnedEditEntry = z.infer<typeof LearnedEditEntrySchema>;

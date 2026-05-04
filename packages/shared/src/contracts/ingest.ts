import { z } from "zod";
import { BuyerMessageSchema } from "./buyerMessage.js";

/**
 * Bulk-insert envelope from the Chrome extension. Idempotency-Key header
 * (separate from the body) makes a retry safe even when the network
 * dropped after the server inserted but before responding.
 *
 * Per CLAUDE.md constraint #6: every POST is idempotent. The middleware
 * stores the (user_id, key) → response in idempotency_keys and replays.
 */
export const IngestMessageBatchSchema = z.object({
  /** Versioned envelope so old extensions don't silently drift. */
  protocol_version: z.literal(1),
  /** ISO timestamp the extension captured the page. */
  captured_at: z.string().datetime(),
  /** Selector config version the extension used to extract these. Useful for debugging drift. */
  selector_config_version: z.number().int().positive().optional(),
  /** Buyer messages extracted from the eBay Messages page. */
  messages: z.array(BuyerMessageSchema).min(1).max(500),
});
export type IngestMessageBatch = z.infer<typeof IngestMessageBatchSchema>;

export const IngestMessageResultSchema = z.object({
  ebay_message_id: z.string().nullable(),
  status: z.enum(["inserted", "deduped", "skipped"]),
  message_id: z.string().nullable(), // our row id when inserted
});
export type IngestMessageResult = z.infer<typeof IngestMessageResultSchema>;

export const IngestResponseSchema = z.object({
  inserted: z.number().int().nonnegative(),
  deduped: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  results: z.array(IngestMessageResultSchema),
  /** Echo of the Idempotency-Key the request supplied (or "" if absent). */
  idempotency_key: z.string(),
  /** True when this response was served from the idempotency cache. */
  replayed: z.boolean().default(false),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

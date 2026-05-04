import { z } from "zod";
import { ListingKbSchema } from "./listingKb.js";

/**
 * V0 Day 3: extension scrapes a listing page → POSTs the structured
 * listing_kb to the backend, idempotent, dedupe by (user_id, ebay_item_id)
 * via the existing UNIQUE constraint on the listings table.
 */
export const IngestListingItemSchema = z.object({
  userId: z.string(),
  /** Source URL the extension scraped — useful for debugging selector drift. */
  sourceUrl: z.string().url().optional(),
  listingKb: ListingKbSchema,
});
export type IngestListingItem = z.infer<typeof IngestListingItemSchema>;

export const IngestListingBatchSchema = z.object({
  protocol_version: z.literal(1),
  captured_at: z.string().datetime(),
  selector_config_version: z.number().int().positive().optional(),
  listings: z.array(IngestListingItemSchema).min(1).max(100),
});
export type IngestListingBatch = z.infer<typeof IngestListingBatchSchema>;

export const IngestListingResultSchema = z.object({
  ebay_item_id: z.string(),
  status: z.enum(["inserted", "updated", "skipped"]),
  listing_id: z.string().nullable(),
});
export type IngestListingResult = z.infer<typeof IngestListingResultSchema>;

export const IngestListingResponseSchema = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  results: z.array(IngestListingResultSchema),
  idempotency_key: z.string(),
  replayed: z.boolean().default(false),
});
export type IngestListingResponse = z.infer<typeof IngestListingResponseSchema>;

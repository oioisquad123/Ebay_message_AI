import { z } from "zod";

/**
 * Per PRD §14.3 — 9-category taxonomy.
 * Two are always flagged (no auto-draft in V1): refunds, complaints.
 */
export const CategoryEnum = z.enum([
  "sizing_measurements",
  "shipping_timeline",
  "condition_authenticity",
  "combined_shipping_discount",
  "returns_refunds",
  "complaint_dispute",
  "generic_greeting",
  "offer_negotiation",
  "other_unclear",
]);
export type Category = z.infer<typeof CategoryEnum>;

export const FLAGGED_CATEGORIES: ReadonlySet<Category> = new Set([
  "returns_refunds",
  "complaint_dispute",
]);

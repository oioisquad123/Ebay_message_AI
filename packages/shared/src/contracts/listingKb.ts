import { z } from "zod";

/**
 * Per PRD §19 listings.listing_kb.
 * Structured summary of an eBay listing for grounded drafting.
 */
export const MeasurementsSchema = z
  .record(z.string(), z.union([z.string(), z.number()]))
  .optional();

export const ShippingPolicySchema = z.object({
  domestic_days: z.string().optional(),
  intl_available: z.boolean().optional(),
  intl_days: z.string().optional(),
  free_threshold: z.string().optional(),
});

export const ReturnsPolicySchema = z.object({
  accepted: z.boolean().optional(),
  window_days: z.number().optional(),
  who_pays: z.string().optional(),
});

export const ListingKbSchema = z.object({
  ebay_item_id: z.string(),
  title: z.string(),
  condition: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  materials: z.array(z.string()).optional(),
  measurements: MeasurementsSchema,
  shipping: ShippingPolicySchema.optional(),
  returns: ReturnsPolicySchema.optional(),
  combined_shipping: z
    .object({
      offered: z.boolean().optional(),
      rule: z.string().optional(),
    })
    .optional(),
  flaws_noted: z.array(z.string()).optional(),
  seller_private_notes: z.string().optional(),
  raw_description_excerpt: z.string().optional(),
});
export type ListingKb = z.infer<typeof ListingKbSchema>;

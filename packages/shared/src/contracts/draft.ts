import { z } from "zod";
import { BrandVoicePresetEnum } from "./brandVoice.js";
import { BuyerMessageSchema } from "./buyerMessage.js";
import { CategoryEnum } from "./category.js";
import { ListingKbSchema } from "./listingKb.js";

/**
 * Per PRD §14.3 — structured Claude output.
 * `used_facts` is verified post-generation against the listing KB; numeric
 * claims (price, dimension, ship_date) MUST appear in `used_facts` keys.
 */
export const DraftFlagEnum = z.enum([
  "forbidden_phrase_money",
  "forbidden_phrase_offplatform",
  "forbidden_phrase_refund_admission",
  "ungrounded_claim",
  "low_confidence",
  "category_flagged",
  "empty_draft",
  "model_error",
]);
export type DraftFlag = z.infer<typeof DraftFlagEnum>;

export const DraftRequestSchema = z.object({
  message: BuyerMessageSchema,
  listingKb: ListingKbSchema.optional(),
  brandVoice: BrandVoicePresetEnum.default("friendly"),
  buyerHistorySummary: z.string().optional(),
});
export type DraftRequest = z.infer<typeof DraftRequestSchema>;

export const DraftResponseSchema = z.object({
  draft: z.string(),
  confidence: z.number().min(0).max(1),
  category: CategoryEnum,
  used_facts: z.array(z.string()),
  flags: z.array(DraftFlagEnum),
  model: z.string(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cache_read_tokens: z.number().int().nonnegative().default(0),
  cost_cents: z.number().nonnegative(),
  generated_at: z.string().datetime(),
});
export type DraftResponse = z.infer<typeof DraftResponseSchema>;

/** What the LLM is asked to produce as JSON output (subset of DraftResponse). */
export const LlmDraftOutputSchema = z.object({
  draft: z.string(),
  confidence: z.number().min(0).max(1),
  category: CategoryEnum,
  used_facts: z.array(z.string()),
  flags: z.array(DraftFlagEnum).default([]),
});
export type LlmDraftOutput = z.infer<typeof LlmDraftOutputSchema>;

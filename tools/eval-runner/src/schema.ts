/**
 * Zod schemas for the eval harness — case definitions and report shape.
 *
 * Per CLAUDE.md #14: the eval harness is a deploy gate (≥80% category accuracy,
 * factuality 100%, no category drops >5 F1 points). These schemas define the
 * contract between hand-authored eval cases (JSON on disk) and the runner.
 */
import { z } from "zod";
import {
  BrandVoicePresetEnum,
  CategoryEnum,
  DraftFlagEnum,
} from "@app/shared";

/**
 * Per-case eval definition. Each case points at a fixture message + optional
 * fixture listing, declares a brand voice, and lists the expectations the
 * runner scores against:
 *   - `expected.category`         — gold-label category
 *   - `must_use_facts`            — every entry must appear in `response.used_facts`
 *   - `must_not_flag`             — none of these flags should appear in `response.flags`
 *   - `ideal_draft_excerpts`      — at least one substring should appear in the draft
 */
export const EvalCaseSchema = z.object({
  id: z.string(),
  fixture_message: z.string(),
  fixture_listing: z.string().nullable().default(null),
  brandVoice: BrandVoicePresetEnum.default("friendly"),
  expected: z.object({
    category: CategoryEnum,
    must_use_facts: z.array(z.string()).default([]),
    must_not_flag: z.array(DraftFlagEnum).default([]),
    ideal_draft_excerpts: z.array(z.string()).default([]),
  }),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

/** Per-category macro-F1 breakdown. */
export const CategoryMetricsSchema = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
  support: z.number().int().nonnegative(),
});
export type CategoryMetrics = z.infer<typeof CategoryMetricsSchema>;

/** One row per case in the report — keep raw fields too for debugging. */
export const EvalCaseResultSchema = z.object({
  id: z.string(),
  expected_category: CategoryEnum,
  predicted_category: CategoryEnum,
  category_correct: z.boolean(),
  factuality_pass: z.boolean(),
  flag_policy_pass: z.boolean(),
  excerpt_match: z.boolean(),
  missing_facts: z.array(z.string()),
  forbidden_flags_returned: z.array(DraftFlagEnum),
  draft: z.string(),
  used_facts: z.array(z.string()),
  flags: z.array(DraftFlagEnum),
  confidence: z.number().min(0).max(1),
  cost_cents: z.number().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResultSchema>;

export const EvalReportSchema = z.object({
  generated_at: z.string().datetime(),
  api_base: z.string(),
  total_cases: z.number().int().nonnegative(),
  category_accuracy: z.number().min(0).max(1),
  category_macro_f1: z.number().min(0).max(1),
  factuality_pass_rate: z.number().min(0).max(1),
  flag_policy_pass_rate: z.number().min(0).max(1),
  excerpt_match_rate: z.number().min(0).max(1),
  total_cost_cents: z.number().nonnegative(),
  total_tokens_in: z.number().int().nonnegative(),
  total_tokens_out: z.number().int().nonnegative(),
  per_category: z.record(z.string(), CategoryMetricsSchema),
  cases: z.array(EvalCaseResultSchema),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;

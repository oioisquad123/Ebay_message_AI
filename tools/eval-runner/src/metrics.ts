/**
 * Pure metrics helpers for the eval harness.
 *
 * Macro-F1: average per-category F1 over the categories present in the eval
 * set. We follow the standard convention — average over categories that have
 * positive support (i.e. appear in the gold labels). Categories present only
 * in predictions contribute to precision penalties for the categories they
 * displaced but are not themselves averaged in (zero support).
 *
 * Round helper trims floating-point noise to 4 decimals so reports diff
 * cleanly across runs.
 */
import type { Category } from "@app/shared";

export interface PerCategoryMetric {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface MacroF1Result {
  per_category: Record<string, PerCategoryMetric>;
  macro_f1: number;
}

export interface PredictionPair {
  predicted: Category;
  actual: Category;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Standard macro-F1.
 *   - For each category in (predicted ∪ actual):
 *       precision = TP / (TP + FP)   (0 if denominator is 0)
 *       recall    = TP / (TP + FN)   (0 if denominator is 0)
 *       f1        = 2pr / (p + r)    (0 if both are 0)
 *   - macro_f1 = mean(F1 across categories with support > 0)
 *
 * Categories present only in predictions show up in `per_category` (their
 * precision is computed against their FPs) but do not contribute to the
 * macro average — otherwise a model that hallucinates a brand-new category
 * gets a free zero pulled into the mean.
 */
export function computeMacroF1(pairs: PredictionPair[]): MacroF1Result {
  const categories = new Set<string>();
  for (const p of pairs) {
    categories.add(p.predicted);
    categories.add(p.actual);
  }

  const per_category: Record<string, PerCategoryMetric> = {};

  for (const cat of categories) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (const p of pairs) {
      if (p.actual === cat) {
        support += 1;
        if (p.predicted === cat) tp += 1;
        else fn += 1;
      } else if (p.predicted === cat) {
        fp += 1;
      }
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
    per_category[cat] = {
      precision: round4(precision),
      recall: round4(recall),
      f1: round4(f1),
      support,
    };
  }

  const supported = Object.values(per_category).filter((m) => m.support > 0);
  const macro_f1 =
    supported.length === 0
      ? 0
      : supported.reduce((sum, m) => sum + m.f1, 0) / supported.length;

  return { per_category, macro_f1: round4(macro_f1) };
}

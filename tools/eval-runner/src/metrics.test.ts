import { describe, expect, test } from "vitest";
import { computeMacroF1, type PredictionPair } from "./metrics.js";
import type { Category } from "@app/shared";

const SIZ: Category = "sizing_measurements";
const SHIP: Category = "shipping_timeline";
const COND: Category = "condition_authenticity";
const OFFER: Category = "offer_negotiation";
const OTHER: Category = "other_unclear";

describe("computeMacroF1", () => {
  test("all-correct → macro_f1 = 1.0", () => {
    const pairs: PredictionPair[] = [
      { actual: SIZ, predicted: SIZ },
      { actual: SHIP, predicted: SHIP },
      { actual: COND, predicted: COND },
      { actual: OFFER, predicted: OFFER },
    ];
    const r = computeMacroF1(pairs);
    expect(r.macro_f1).toBe(1);
    expect(r.per_category[SIZ]).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
      support: 1,
    });
  });

  test("all-wrong (every prediction misses gold class) → macro_f1 = 0", () => {
    // Every actual class is never predicted correctly. Predictions point to
    // the right "type" of slot but the wrong label, so TP is 0 everywhere.
    const pairs: PredictionPair[] = [
      { actual: SIZ, predicted: SHIP },
      { actual: SHIP, predicted: COND },
      { actual: COND, predicted: OFFER },
      { actual: OFFER, predicted: SIZ },
    ];
    const r = computeMacroF1(pairs);
    expect(r.macro_f1).toBe(0);
  });

  test("known small example with 2 of 4 wrong gives expected per-class F1", () => {
    // Gold: SIZ, SIZ, SHIP, SHIP   (2 each, 2 categories)
    // Pred: SIZ, SHIP, SHIP, SIZ   → 2 TP, 2 FP, 2 FN total, 1 TP per class
    //
    // For SIZ: TP=1, FP=1, FN=1 → P=0.5, R=0.5, F1=0.5
    // For SHIP: TP=1, FP=1, FN=1 → P=0.5, R=0.5, F1=0.5
    // macro_f1 = 0.5
    const pairs: PredictionPair[] = [
      { actual: SIZ, predicted: SIZ },
      { actual: SIZ, predicted: SHIP },
      { actual: SHIP, predicted: SHIP },
      { actual: SHIP, predicted: SIZ },
    ];
    const r = computeMacroF1(pairs);
    expect(r.per_category[SIZ]).toEqual({
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
      support: 2,
    });
    expect(r.per_category[SHIP]).toEqual({
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
      support: 2,
    });
    expect(r.macro_f1).toBe(0.5);
  });

  test("category present only in predicted (precision drops, recall=0, support=0) — excluded from macro avg", () => {
    // Gold: SIZ, SIZ. Pred: SIZ, OTHER.
    // SIZ: TP=1, FP=0, FN=1 → P=1.0, R=0.5, F1=0.6667
    // OTHER: TP=0, FP=1, FN=0 → P=0, R=0, F1=0, support=0
    // Only SIZ has positive support → macro_f1 = F1(SIZ) = 0.6667
    const pairs: PredictionPair[] = [
      { actual: SIZ, predicted: SIZ },
      { actual: SIZ, predicted: OTHER },
    ];
    const r = computeMacroF1(pairs);
    expect(r.per_category[SIZ]?.support).toBe(2);
    expect(r.per_category[OTHER]?.support).toBe(0);
    expect(r.per_category[OTHER]?.recall).toBe(0);
    // macro_f1 should equal SIZ's F1 since OTHER is excluded
    expect(r.macro_f1).toBeCloseTo(2 / 3, 3);
  });

  test("empty input → macro_f1 = 0", () => {
    const r = computeMacroF1([]);
    expect(r.macro_f1).toBe(0);
    expect(r.per_category).toEqual({});
  });
});

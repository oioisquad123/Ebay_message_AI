/**
 * Pure-function tests for diffReports — no fs, no network.
 */
import { describe, expect, test } from "vitest";
import { diffReports } from "./diff.js";
import type { EvalCaseResult, EvalReport } from "./schema.js";
import type { Category } from "@app/shared";

const SIZ: Category = "sizing_measurements";
const SHIP: Category = "shipping_timeline";
const COND: Category = "condition_authenticity";

function makeCase(
  id: string,
  overrides: Partial<EvalCaseResult> = {},
): EvalCaseResult {
  return {
    id,
    expected_category: SIZ,
    predicted_category: SIZ,
    category_correct: true,
    factuality_pass: true,
    flag_policy_pass: true,
    excerpt_match: true,
    missing_facts: [],
    forbidden_flags_returned: [],
    draft: "Thanks!",
    used_facts: [],
    flags: [],
    confidence: 0.9,
    cost_cents: 0.05,
    tokens_in: 100,
    tokens_out: 50,
    ...overrides,
  };
}

function makeReport(
  cases: EvalCaseResult[],
  overrides: Partial<EvalReport> = {},
): EvalReport {
  const total = cases.length;
  const correct = cases.filter((c) => c.category_correct).length;
  const fact = cases.filter((c) => c.factuality_pass).length;
  const flag = cases.filter((c) => c.flag_policy_pass).length;
  const excerpt = cases.filter((c) => c.excerpt_match).length;
  return {
    generated_at: "2026-05-04T00:00:00.000Z",
    api_base: "http://mock",
    total_cases: total,
    category_accuracy: total === 0 ? 0 : correct / total,
    category_macro_f1: 1,
    factuality_pass_rate: total === 0 ? 0 : fact / total,
    flag_policy_pass_rate: total === 0 ? 0 : flag / total,
    excerpt_match_rate: total === 0 ? 0 : excerpt / total,
    total_cost_cents: cases.reduce((s, c) => s + c.cost_cents, 0),
    total_tokens_in: cases.reduce((s, c) => s + c.tokens_in, 0),
    total_tokens_out: cases.reduce((s, c) => s + c.tokens_out, 0),
    per_category: {
      [SIZ]: { precision: 1, recall: 1, f1: 1, support: total },
    },
    cases,
    ...overrides,
  };
}

describe("diffReports", () => {
  test("identical reports → no regression, all deltas zero", () => {
    const cases = [makeCase("a"), makeCase("b")];
    const baseline = makeReport(cases);
    const current = makeReport(cases);
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(false);
    expect(diff.regressed_cases).toHaveLength(0);
    expect(diff.improved_cases).toHaveLength(0);
    expect(diff.new_cases).toHaveLength(0);
    expect(diff.dropped_cases).toHaveLength(0);
    expect(diff.metric_deltas.category_accuracy_delta).toBe(0);
    expect(diff.metric_deltas.category_macro_f1_delta).toBe(0);
    expect(diff.metric_deltas.factuality_pass_rate_delta).toBe(0);
    expect(diff.metric_deltas.flag_policy_pass_rate_delta).toBe(0);
    expect(diff.metric_deltas.excerpt_match_rate_delta).toBe(0);
    expect(diff.metric_deltas.total_cost_cents_delta).toBe(0);
    expect(diff.per_category_f1_delta[SIZ]).toBe(0);
  });

  test("category regression → captured in regressed_cases with has_regression=true", () => {
    const baseline = makeReport([makeCase("a")]);
    const current = makeReport([
      makeCase("a", { predicted_category: SHIP, category_correct: false }),
    ]);
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(true);
    expect(diff.regressed_cases).toHaveLength(1);
    expect(diff.regressed_cases[0]?.id).toBe("a");
    expect(diff.regressed_cases[0]?.baseline_passed).toBe(true);
    expect(diff.regressed_cases[0]?.current_passed).toBe(false);
    expect(diff.regressed_cases[0]?.baseline_category).toBe(SIZ);
    expect(diff.regressed_cases[0]?.current_category).toBe(SHIP);
  });

  test("factuality regression → captured in regressed_cases", () => {
    const baseline = makeReport([makeCase("a")]);
    const current = makeReport([
      makeCase("a", {
        factuality_pass: false,
        missing_facts: ["listing.foo"],
      }),
    ]);
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(true);
    expect(diff.regressed_cases).toHaveLength(1);
    expect(diff.regressed_cases[0]?.baseline_factuality).toBe(true);
    expect(diff.regressed_cases[0]?.current_factuality).toBe(false);
  });

  test("improvement → captured in improved_cases, no regression", () => {
    const baseline = makeReport([
      makeCase("a", { factuality_pass: false, category_correct: false }),
    ]);
    const current = makeReport([makeCase("a")]);
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(false);
    expect(diff.improved_cases).toHaveLength(1);
    expect(diff.improved_cases[0]?.id).toBe("a");
    expect(diff.regressed_cases).toHaveLength(0);
  });

  test("new case in current → in new_cases, no regression", () => {
    const baseline = makeReport([makeCase("a")]);
    const current = makeReport([makeCase("a"), makeCase("b")]);
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(false);
    expect(diff.new_cases).toEqual(["b"]);
    expect(diff.regressed_cases).toHaveLength(0);
  });

  test("dropped case in baseline → in dropped_cases, no regression", () => {
    const baseline = makeReport([makeCase("a"), makeCase("b")]);
    const current = makeReport([makeCase("a")]);
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(false);
    expect(diff.dropped_cases).toEqual(["b"]);
    expect(diff.regressed_cases).toHaveLength(0);
  });

  test("category F1 drops 6 points → has_regression=true even with no per-case regressions", () => {
    const baseline = makeReport([makeCase("a")], {
      per_category: {
        [SIZ]: { precision: 1, recall: 1, f1: 1.0, support: 1 },
        [SHIP]: { precision: 1, recall: 1, f1: 0.95, support: 5 },
      },
    });
    const current = makeReport([makeCase("a")], {
      per_category: {
        [SIZ]: { precision: 1, recall: 1, f1: 1.0, support: 1 },
        [SHIP]: { precision: 1, recall: 1, f1: 0.89, support: 5 },
      },
    });
    const diff = diffReports(baseline, current);
    expect(diff.regressed_cases).toHaveLength(0);
    expect(diff.has_regression).toBe(true);
    expect(diff.per_category_f1_delta[SHIP]).toBeLessThan(-0.05);
  });

  test("category F1 drops 4 points → has_regression=false (within 5-point tolerance)", () => {
    const baseline = makeReport([makeCase("a")], {
      per_category: {
        [SIZ]: { precision: 1, recall: 1, f1: 1.0, support: 1 },
        [SHIP]: { precision: 1, recall: 1, f1: 0.95, support: 5 },
      },
    });
    const current = makeReport([makeCase("a")], {
      per_category: {
        [SIZ]: { precision: 1, recall: 1, f1: 1.0, support: 1 },
        [SHIP]: { precision: 1, recall: 1, f1: 0.91, support: 5 },
      },
    });
    const diff = diffReports(baseline, current);
    expect(diff.has_regression).toBe(false);
    // -0.04 is greater than -0.05, so no regression
    expect(diff.per_category_f1_delta[SHIP]).toBeCloseTo(-0.04, 4);
  });

  test("metric deltas reflect current - baseline correctly", () => {
    const baseline = makeReport([makeCase("a"), makeCase("b")], {
      category_accuracy: 0.5,
      category_macro_f1: 0.5,
      factuality_pass_rate: 0.5,
      flag_policy_pass_rate: 1.0,
      excerpt_match_rate: 0.5,
      total_cost_cents: 1.0,
    });
    const current = makeReport([makeCase("a"), makeCase("b")], {
      category_accuracy: 0.875,
      category_macro_f1: 0.95,
      factuality_pass_rate: 1.0,
      flag_policy_pass_rate: 1.0,
      excerpt_match_rate: 0.75,
      total_cost_cents: 0.9,
    });
    const diff = diffReports(baseline, current);
    expect(diff.metric_deltas.category_accuracy_delta).toBeCloseTo(0.375, 4);
    expect(diff.metric_deltas.category_macro_f1_delta).toBeCloseTo(0.45, 4);
    expect(diff.metric_deltas.factuality_pass_rate_delta).toBeCloseTo(0.5, 4);
    expect(diff.metric_deltas.flag_policy_pass_rate_delta).toBe(0);
    expect(diff.metric_deltas.excerpt_match_rate_delta).toBeCloseTo(0.25, 4);
    expect(diff.metric_deltas.total_cost_cents_delta).toBeCloseTo(-0.1, 2);
  });

  test("category present only in current → delta is current's F1 (treats missing as 0)", () => {
    const baseline = makeReport([makeCase("a")], {
      per_category: {
        [SIZ]: { precision: 1, recall: 1, f1: 1.0, support: 1 },
      },
    });
    const current = makeReport([makeCase("a")], {
      per_category: {
        [SIZ]: { precision: 1, recall: 1, f1: 1.0, support: 1 },
        [COND]: { precision: 1, recall: 1, f1: 0.8, support: 2 },
      },
    });
    const diff = diffReports(baseline, current);
    expect(diff.per_category_f1_delta[COND]).toBeCloseTo(0.8, 4);
    expect(diff.has_regression).toBe(false);
  });

  test("summary_lines include metric deltas with explicit signs", () => {
    const baseline = makeReport([makeCase("a")], {
      category_accuracy: 0.5,
    });
    const current = makeReport([makeCase("a")], {
      category_accuracy: 0.75,
    });
    const diff = diffReports(baseline, current);
    expect(diff.summary_lines.some((l) => l.includes("+0.2500"))).toBe(true);
  });
});

/**
 * Regression diff for the eval harness — V0 Day 10.
 *
 * Pure function: given a baseline EvalReport and a current EvalReport, produce
 * a RegressionReport that highlights per-case regressions/improvements and
 * aggregate-metric deltas. Zero side effects (no fs, no network).
 *
 * Per CLAUDE.md #14: the eval harness is the deploy gate — "no category drops
 * >5 F1 points". `has_regression` is true if any case regressed (passed both
 * factuality + category in baseline but fails one in current) OR any
 * `per_category_f1_delta` is < -0.05.
 */
import type { Category } from "@app/shared";
import type { EvalCaseResult, EvalReport } from "./schema.js";

/**
 * Per-case regression / improvement entry. We capture the baseline + current
 * pass states so the diff is self-describing without a reader having to
 * re-load both reports.
 */
export interface CaseDiff {
  id: string;
  baseline_passed: boolean;
  current_passed: boolean;
  baseline_category: string;
  current_category: string;
  baseline_factuality: boolean;
  current_factuality: boolean;
}

/** Aggregate metric deltas — all `current - baseline`. */
export interface MetricDeltas {
  category_accuracy_delta: number;
  category_macro_f1_delta: number;
  factuality_pass_rate_delta: number;
  flag_policy_pass_rate_delta: number;
  excerpt_match_rate_delta: number;
  total_cost_cents_delta: number;
}

export interface RegressionReport {
  regressed_cases: CaseDiff[];
  improved_cases: CaseDiff[];
  new_cases: string[];
  dropped_cases: string[];
  metric_deltas: MetricDeltas;
  per_category_f1_delta: Record<string, number>;
  has_regression: boolean;
  summary_lines: string[];
}

/** A "case passes" if both category is correct AND factuality passes. */
function casePassed(c: EvalCaseResult): boolean {
  return c.category_correct && c.factuality_pass;
}

function makeCaseDiff(
  id: string,
  baseline: EvalCaseResult,
  current: EvalCaseResult,
): CaseDiff {
  return {
    id,
    baseline_passed: casePassed(baseline),
    current_passed: casePassed(current),
    baseline_category: baseline.predicted_category,
    current_category: current.predicted_category,
    baseline_factuality: baseline.factuality_pass,
    current_factuality: current.factuality_pass,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtSigned(n: number, digits = 4): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}`;
}

/**
 * Diff two eval reports and produce a regression summary.
 *
 * Pure: no fs, no network, no global state. Safe to call from tests.
 */
export function diffReports(
  baseline: EvalReport,
  current: EvalReport,
): RegressionReport {
  const baselineById = new Map<string, EvalCaseResult>();
  for (const c of baseline.cases) baselineById.set(c.id, c);
  const currentById = new Map<string, EvalCaseResult>();
  for (const c of current.cases) currentById.set(c.id, c);

  const regressed_cases: CaseDiff[] = [];
  const improved_cases: CaseDiff[] = [];
  const new_cases: string[] = [];
  const dropped_cases: string[] = [];

  // Cases in current vs baseline
  for (const [id, cur] of currentById) {
    const base = baselineById.get(id);
    if (!base) {
      new_cases.push(id);
      continue;
    }
    const basePassed = casePassed(base);
    const curPassed = casePassed(cur);
    if (basePassed && !curPassed) {
      regressed_cases.push(makeCaseDiff(id, base, cur));
    } else if (!basePassed && curPassed) {
      improved_cases.push(makeCaseDiff(id, base, cur));
    }
  }

  // Cases dropped (in baseline but not current)
  for (const id of baselineById.keys()) {
    if (!currentById.has(id)) dropped_cases.push(id);
  }

  // Stable sort for deterministic output
  regressed_cases.sort((a, b) => a.id.localeCompare(b.id));
  improved_cases.sort((a, b) => a.id.localeCompare(b.id));
  new_cases.sort();
  dropped_cases.sort();

  const metric_deltas: MetricDeltas = {
    category_accuracy_delta: round4(
      current.category_accuracy - baseline.category_accuracy,
    ),
    category_macro_f1_delta: round4(
      current.category_macro_f1 - baseline.category_macro_f1,
    ),
    factuality_pass_rate_delta: round4(
      current.factuality_pass_rate - baseline.factuality_pass_rate,
    ),
    flag_policy_pass_rate_delta: round4(
      current.flag_policy_pass_rate - baseline.flag_policy_pass_rate,
    ),
    excerpt_match_rate_delta: round4(
      current.excerpt_match_rate - baseline.excerpt_match_rate,
    ),
    total_cost_cents_delta: round2(
      current.total_cost_cents - baseline.total_cost_cents,
    ),
  };

  // Per-category F1 deltas across the union of categories. Missing in either
  // side counts as 0 F1 (no signal), so the delta is the present side's F1.
  const allCategories = new Set<string>([
    ...Object.keys(baseline.per_category),
    ...Object.keys(current.per_category),
  ]);
  const per_category_f1_delta: Record<string, number> = {};
  for (const cat of allCategories) {
    const baseF1 = baseline.per_category[cat]?.f1 ?? 0;
    const curF1 = current.per_category[cat]?.f1 ?? 0;
    per_category_f1_delta[cat] = round4(curF1 - baseF1);
  }

  const categoryF1Drop = Object.values(per_category_f1_delta).some(
    (d) => d < -0.05,
  );
  const has_regression = regressed_cases.length > 0 || categoryF1Drop;

  // Build human-readable summary lines suitable for stdout. Keep the 2-space
  // indent + plain ASCII style of the existing eval summary.
  const lines: string[] = [];
  lines.push(
    `  category_accuracy     ${fmtSigned(metric_deltas.category_accuracy_delta)}   (${baseline.category_accuracy.toFixed(4)} -> ${current.category_accuracy.toFixed(4)})`,
  );
  lines.push(
    `  category_macro_f1     ${fmtSigned(metric_deltas.category_macro_f1_delta)}   (${baseline.category_macro_f1.toFixed(4)} -> ${current.category_macro_f1.toFixed(4)})`,
  );
  lines.push(
    `  factuality_pass_rate  ${fmtSigned(metric_deltas.factuality_pass_rate_delta)}   (${baseline.factuality_pass_rate.toFixed(4)} -> ${current.factuality_pass_rate.toFixed(4)})`,
  );
  lines.push(
    `  flag_policy_pass_rate ${fmtSigned(metric_deltas.flag_policy_pass_rate_delta)}   (${baseline.flag_policy_pass_rate.toFixed(4)} -> ${current.flag_policy_pass_rate.toFixed(4)})`,
  );
  lines.push(
    `  excerpt_match_rate    ${fmtSigned(metric_deltas.excerpt_match_rate_delta)}   (${baseline.excerpt_match_rate.toFixed(4)} -> ${current.excerpt_match_rate.toFixed(4)})`,
  );
  lines.push(
    `  total_cost_cents      ${fmtSigned(metric_deltas.total_cost_cents_delta, 2)}`,
  );

  if (regressed_cases.length > 0) {
    lines.push(`Regressed cases (${regressed_cases.length}):`);
    for (const r of regressed_cases) {
      const reasons: string[] = [];
      if (r.baseline_factuality && !r.current_factuality) reasons.push("factuality");
      if (r.baseline_category !== r.current_category) {
        reasons.push(
          `category: ${r.baseline_category} -> ${r.current_category}`,
        );
      }
      const reasonStr = reasons.length > 0 ? `[${reasons.join(", ")}]` : "[regressed]";
      lines.push(`  ${r.id}  ${reasonStr}`);
    }
  }

  if (improved_cases.length > 0) {
    lines.push(`Improved cases (${improved_cases.length}):`);
    for (const i of improved_cases) {
      lines.push(`  ${i.id}`);
    }
  }

  if (new_cases.length > 0) {
    lines.push(`New cases (${new_cases.length}):`);
    lines.push(`  ${new_cases.join(", ")}`);
  }

  if (dropped_cases.length > 0) {
    lines.push(`Dropped cases (${dropped_cases.length}):`);
    lines.push(`  ${dropped_cases.join(", ")}`);
  }

  // Per-category F1 drops > 5 points get called out explicitly so the regression
  // gate reason is self-evident in stdout.
  const drops = Object.entries(per_category_f1_delta).filter(
    ([, d]) => d < -0.05,
  );
  if (drops.length > 0) {
    lines.push(`Category F1 drops > 5 points (${drops.length}):`);
    for (const [cat, d] of drops) {
      lines.push(`  ${cat.padEnd(28)} ${fmtSigned(d)}`);
    }
  }

  return {
    regressed_cases,
    improved_cases,
    new_cases,
    dropped_cases,
    metric_deltas,
    per_category_f1_delta,
    has_regression,
    summary_lines: lines,
  };
}

/** Re-export Category type for callers that want to type the F1 delta record. */
export type { Category };

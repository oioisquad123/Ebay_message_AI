/**
 * Eval harness CLI — V0 Day 7.
 *
 * Loads JSON eval cases from `packages/prompts/evals/cases`, calls the
 * running API's `/api/v1/dev/draft`, scores each response, aggregates
 * macro-F1 + factuality + flag-policy + excerpt metrics, writes a JSON
 * report and prints a tight stdout summary.
 *
 * Per CLAUDE.md #14: this harness is a deploy gate. The CLI exits 1 on
 * regression when --fail-on-regression is set:
 *   - category_accuracy   < --threshold-accuracy   (default 0.8)
 *   - factuality_pass_rate < --threshold-factuality (default 1.0)
 * Without the flag the CLI always exits 0 (so dev runs don't fail noisily).
 *
 * `runEval` is exported so unit tests can drive it with mocked fetch.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Category,
  type DraftFlag,
  type DraftRequest,
  DraftResponseSchema,
  type DraftResponse,
} from "@app/shared";
import {
  EvalCaseSchema,
  EvalReportSchema,
  type EvalCase,
  type EvalCaseResult,
  type EvalReport,
} from "./schema.js";
import { computeMacroF1, type PredictionPair } from "./metrics.js";
import { diffReports } from "./diff.js";

export interface RunEvalOptions {
  apiBase: string;
  casesDir: string;
  fixturesDir: string;
  reportPath: string | null;
  failOnRegression: boolean;
  thresholdAccuracy: number;
  thresholdFactuality: number;
  printDrafts: boolean;
  /** Optional baseline EvalReport JSON path for regression diff output. */
  baselinePath: string | null;
  /** For tests: inject fetch. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** For tests: inject stdout/stderr. Defaults to console.log/error. */
  log?: (line: string) => void;
  errLog?: (line: string) => void;
}

/** Process exit codes:
 *   0 — clean run (or thresholds met)
 *   1 — regression vs. thresholds (only when failOnRegression=true)
 *   2 — API unreachable
 *   3 — schema/load error
 */
export type ExitCode = 0 | 1 | 2 | 3;

export interface RunEvalResult {
  report: EvalReport;
  exitCode: ExitCode;
}

const DEFAULT_OPTS: RunEvalOptions = {
  apiBase: "http://127.0.0.1:3000",
  casesDir: "packages/prompts/evals/cases",
  fixturesDir: "packages/prompts/fixtures",
  reportPath: "eval-report.json",
  failOnRegression: false,
  thresholdAccuracy: 0.8,
  thresholdFactuality: 1.0,
  printDrafts: false,
  baselinePath: null,
};

/** Existing stub kept so any external imports of `describe()` keep working. */
export function describe(): string {
  return "eval-runner V0 Day 7 — see EXECUTION_PLAN.md §V0 Day 7";
}

interface FixtureMessage {
  id: string;
  category?: string;
  body: string;
  buyerUsername?: string;
  ebayItemId?: string;
}

function loadJson<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

function loadCases(casesDir: string): EvalCase[] {
  const entries = readdirSync(casesDir).filter((f) => f.endsWith(".json"));
  if (entries.length === 0) {
    throw new Error(`No eval cases found in ${casesDir}`);
  }
  const cases: EvalCase[] = [];
  for (const f of entries) {
    const path = join(casesDir, f);
    const raw = loadJson<unknown>(path);
    const parsed = EvalCaseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Invalid eval case ${f}: ${JSON.stringify(parsed.error.issues)}`,
      );
    }
    cases.push(parsed.data);
  }
  // Stable order — sort by id so reports diff cleanly.
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

function buildRequest(c: EvalCase, fixturesDir: string): DraftRequest {
  const msgPath = resolve(fixturesDir, c.fixture_message);
  const msg = loadJson<FixtureMessage>(msgPath);

  const request: DraftRequest = {
    message: {
      userId: "u-eval",
      buyerUsername: msg.buyerUsername ?? "eval_buyer",
      body: msg.body,
      ...(msg.ebayItemId ? { ebayItemId: msg.ebayItemId } : {}),
    },
    brandVoice: c.brandVoice,
  };

  if (c.fixture_listing) {
    const listingPath = resolve(fixturesDir, c.fixture_listing);
    request.listingKb = loadJson(listingPath);
  }

  return request;
}

function scoreCase(
  c: EvalCase,
  resp: DraftResponse,
): Omit<EvalCaseResult, "id"> {
  const expected = c.expected;
  const category_correct = resp.category === expected.category;

  const usedFactsSet = new Set(resp.used_facts);
  const missing_facts = expected.must_use_facts.filter(
    (f) => !usedFactsSet.has(f),
  );
  const factuality_pass = missing_facts.length === 0;

  const flagsSet = new Set<DraftFlag>(resp.flags);
  const forbidden_flags_returned = expected.must_not_flag.filter((f) =>
    flagsSet.has(f),
  );
  const flag_policy_pass = forbidden_flags_returned.length === 0;

  const draftLower = resp.draft.toLowerCase();
  const excerpt_match =
    expected.ideal_draft_excerpts.length === 0 ||
    expected.ideal_draft_excerpts.some((s) =>
      draftLower.includes(s.toLowerCase()),
    );

  return {
    expected_category: expected.category,
    predicted_category: resp.category,
    category_correct,
    factuality_pass,
    flag_policy_pass,
    excerpt_match,
    missing_facts,
    forbidden_flags_returned,
    draft: resp.draft,
    used_facts: resp.used_facts,
    flags: resp.flags,
    confidence: resp.confidence,
    cost_cents: resp.cost_cents,
    tokens_in: resp.tokens_in,
    tokens_out: resp.tokens_out,
  };
}

class ApiUnreachableError extends Error {
  constructor(public url: string, cause?: unknown) {
    super(`API at ${url} unreachable`);
    this.name = "ApiUnreachableError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

async function callDraft(
  apiBase: string,
  body: DraftRequest,
  fetchImpl: typeof fetch,
): Promise<DraftResponse> {
  const url = `${apiBase.replace(/\/$/, "")}/api/v1/dev/draft`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiUnreachableError(url, err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${url} → ${res.status}: ${text}`);
  }
  const json = (await res.json()) as unknown;
  return DraftResponseSchema.parse(json);
}

export async function runEval(
  partial: Partial<RunEvalOptions> = {},
): Promise<RunEvalResult> {
  const opts: RunEvalOptions = { ...DEFAULT_OPTS, ...partial };
  const log = opts.log ?? ((s: string) => console.log(s));
  const errLog = opts.errLog ?? ((s: string) => console.error(s));
  const fetchImpl = opts.fetchImpl ?? fetch;

  let cases: EvalCase[];
  try {
    cases = loadCases(opts.casesDir);
  } catch (err) {
    errLog((err as Error).message);
    throw err;
  }

  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    const req = buildRequest(c, opts.fixturesDir);
    let resp: DraftResponse;
    try {
      resp = await callDraft(opts.apiBase, req, fetchImpl);
    } catch (err) {
      if (err instanceof ApiUnreachableError) {
        errLog(
          `API at ${err.url} unreachable — start it with \`pnpm dev:api\``,
        );
        throw err;
      }
      throw err;
    }
    const scored = scoreCase(c, resp);
    results.push({ id: c.id, ...scored });
    if (opts.printDrafts) {
      log(
        `--- ${c.id} [${scored.predicted_category}${scored.category_correct ? "" : ` ✗ expected ${scored.expected_category}`}]`,
      );
      log(resp.draft);
    }
  }

  const total = results.length;
  const correct = results.filter((r) => r.category_correct).length;
  const factuality = results.filter((r) => r.factuality_pass).length;
  const flagPolicy = results.filter((r) => r.flag_policy_pass).length;
  const excerpt = results.filter((r) => r.excerpt_match).length;

  const pairs: PredictionPair[] = results.map((r) => ({
    predicted: r.predicted_category as Category,
    actual: r.expected_category as Category,
  }));
  const macro = computeMacroF1(pairs);

  const totalCost = results.reduce((s, r) => s + r.cost_cents, 0);
  const totalIn = results.reduce((s, r) => s + r.tokens_in, 0);
  const totalOut = results.reduce((s, r) => s + r.tokens_out, 0);

  const report: EvalReport = {
    generated_at: new Date().toISOString(),
    api_base: opts.apiBase,
    total_cases: total,
    category_accuracy: total === 0 ? 0 : Math.round((correct / total) * 10_000) / 10_000,
    category_macro_f1: macro.macro_f1,
    factuality_pass_rate:
      total === 0 ? 0 : Math.round((factuality / total) * 10_000) / 10_000,
    flag_policy_pass_rate:
      total === 0 ? 0 : Math.round((flagPolicy / total) * 10_000) / 10_000,
    excerpt_match_rate:
      total === 0 ? 0 : Math.round((excerpt / total) * 10_000) / 10_000,
    total_cost_cents: Math.round(totalCost * 100) / 100,
    total_tokens_in: totalIn,
    total_tokens_out: totalOut,
    per_category: macro.per_category,
    cases: results,
  };

  if (opts.reportPath) {
    writeFileSync(opts.reportPath, JSON.stringify(report, null, 2), "utf8");
  }

  // Tight summary table — no emojis, parseable at a glance.
  log("");
  log(`Eval report — ${total} cases`);
  log(`  category_accuracy     ${report.category_accuracy.toFixed(4)}`);
  log(`  category_macro_f1     ${report.category_macro_f1.toFixed(4)}`);
  log(`  factuality_pass_rate  ${report.factuality_pass_rate.toFixed(4)}`);
  log(`  flag_policy_pass_rate ${report.flag_policy_pass_rate.toFixed(4)}`);
  log(`  excerpt_match_rate    ${report.excerpt_match_rate.toFixed(4)}`);
  log(`  total_cost_cents      ${report.total_cost_cents}`);
  log(`  total_tokens_in/out   ${report.total_tokens_in}/${report.total_tokens_out}`);
  log("  per-category:");
  for (const [cat, m] of Object.entries(report.per_category)) {
    log(
      `    ${cat.padEnd(28)} P=${m.precision.toFixed(3)} R=${m.recall.toFixed(3)} F1=${m.f1.toFixed(3)} n=${m.support}`,
    );
  }
  if (opts.reportPath) log(`  report written: ${opts.reportPath}`);

  let exitCode: ExitCode = 0;
  if (opts.failOnRegression) {
    if (report.category_accuracy < opts.thresholdAccuracy) {
      errLog(
        `REGRESSION: category_accuracy ${report.category_accuracy} < threshold ${opts.thresholdAccuracy}`,
      );
      exitCode = 1;
    }
    if (report.factuality_pass_rate < opts.thresholdFactuality) {
      errLog(
        `REGRESSION: factuality_pass_rate ${report.factuality_pass_rate} < threshold ${opts.thresholdFactuality}`,
      );
      exitCode = 1;
    }
  }

  // Regression diff vs. baseline (V0 Day 10). Pure: load file → diff → log.
  // If baseline file is missing, warn and skip — don't fail. If baseline is
  // unparseable, surface the error so a corrupted baseline doesn't quietly
  // suppress the regression gate.
  if (opts.baselinePath) {
    if (!existsSync(opts.baselinePath)) {
      errLog(
        `WARNING: baseline file not found at ${opts.baselinePath} — skipping regression diff`,
      );
    } else {
      const baselineRaw = loadJson<unknown>(opts.baselinePath);
      const parsed = EvalReportSchema.safeParse(baselineRaw);
      if (!parsed.success) {
        errLog(
          `WARNING: baseline file ${opts.baselinePath} failed schema validation — skipping regression diff`,
        );
      } else {
        const diff = diffReports(parsed.data, report);
        log("");
        log(`Regression diff vs baseline (${opts.baselinePath}):`);
        for (const line of diff.summary_lines) log(line);
        if (opts.failOnRegression && diff.has_regression) {
          if (diff.regressed_cases.length > 0) {
            errLog(
              `REGRESSION: ${diff.regressed_cases.length} case(s) regressed vs baseline`,
            );
          }
          const drops = Object.entries(diff.per_category_f1_delta).filter(
            ([, d]) => d < -0.05,
          );
          if (drops.length > 0) {
            errLog(
              `REGRESSION: ${drops.length} category F1 drop(s) > 5 points vs baseline`,
            );
          }
          exitCode = 1;
        }
      }
    }
  }

  return { report, exitCode };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function parseArgs(argv: string[]): Partial<RunEvalOptions> {
  const out: Partial<RunEvalOptions> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      i += 1;
      return v;
    };
    switch (a) {
      case "--api-base":
        out.apiBase = next();
        break;
      case "--cases":
        out.casesDir = next();
        break;
      case "--fixtures":
        out.fixturesDir = next();
        break;
      case "--report":
        out.reportPath = next();
        break;
      case "--fail-on-regression":
        out.failOnRegression = true;
        break;
      case "--threshold-accuracy":
        out.thresholdAccuracy = Number(next());
        break;
      case "--threshold-factuality":
        out.thresholdFactuality = Number(next());
        break;
      case "--print-drafts":
        out.printDrafts = true;
        break;
      case "--baseline":
        out.baselinePath = next();
        break;
      case "-h":
      case "--help":
        // eslint-disable-next-line no-console
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        if (a && a.startsWith("--")) {
          throw new Error(`Unknown flag: ${a}`);
        }
    }
  }
  return out;
}

const USAGE = `eval-runner — V0 Day 7

Usage:
  pnpm --filter @tools/eval-runner eval [options]

Options:
  --api-base <url>              Default: http://127.0.0.1:3000
  --cases <dir>                 Default: packages/prompts/evals/cases
  --fixtures <dir>              Default: packages/prompts/fixtures
  --report <path>               Default: eval-report.json
  --fail-on-regression          Exit 1 if thresholds breached (default: off)
  --threshold-accuracy <0..1>   Default: 0.8
  --threshold-factuality <0..1> Default: 1.0
  --print-drafts                Print each draft to stdout
  --baseline <path>             Saved EvalReport JSON to diff against. Logs a
                                regression section to stdout. With
                                --fail-on-regression, exits 1 on any case
                                regression or category F1 drop > 5 points.
`;

async function main(): Promise<void> {
  let parsed: Partial<RunEvalOptions>;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const { exitCode } = await runEval(parsed);
    process.exit(exitCode);
  } catch (err) {
    if (err && (err as Error).name === "ApiUnreachableError") {
      process.exit(2);
    }
    console.error((err as Error).message);
    process.exit(3);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}

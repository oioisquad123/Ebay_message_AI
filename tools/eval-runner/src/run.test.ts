/**
 * Integration-style tests for runEval — drive the full CLI flow with
 * in-memory cases + a mocked fetch.
 */
import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as describeStub, runEval } from "./run.js";
import type { DraftResponse } from "@app/shared";

/** Minimal valid DraftResponse builder — fills required schema fields. */
function makeDraftResponse(overrides: Partial<DraftResponse> = {}): DraftResponse {
  return {
    draft: "Thanks for your message! The chest measures 22 in pit to pit.",
    confidence: 0.9,
    category: "sizing_measurements",
    used_facts: ["listing.measurements.chest_pit_to_pit_in"],
    flags: [],
    model: "test-model",
    tokens_in: 100,
    tokens_out: 50,
    cache_read_tokens: 0,
    cost_cents: 0.05,
    generated_at: "2026-05-03T12:00:00.000Z",
    ...overrides,
  };
}

interface SetupResult {
  casesDir: string;
  fixturesDir: string;
  reportPath: string;
  cleanup: () => void;
}

/** Write 3 in-memory eval cases into a tmpdir + minimal fixture messages. */
function setupTmp(cases: Record<string, unknown>[]): SetupResult {
  const root = mkdtempSync(join(tmpdir(), "eval-runner-"));
  const casesDir = join(root, "cases");
  const fixturesDir = join(root, "fixtures");
  const messagesDir = join(fixturesDir, "messages");
  const reportPath = join(root, "report.json");
  mkdirSync(casesDir);
  mkdirSync(fixturesDir);
  mkdirSync(messagesDir);

  for (const c of cases) {
    writeFileSync(
      join(casesDir, `${(c as { id: string }).id}.json`),
      JSON.stringify(c),
    );
  }

  // Stub fixture message files referenced by cases
  for (const c of cases) {
    const path = (c as { fixture_message: string }).fixture_message;
    const target = join(fixturesDir, path);
    const dir = target.substring(0, target.lastIndexOf("/"));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      target,
      JSON.stringify({
        id: (c as { id: string }).id,
        body: "buyer message body",
        buyerUsername: "test_buyer",
      }),
    );
  }

  return {
    casesDir,
    fixturesDir,
    reportPath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeFetch(responses: DraftResponse[]): typeof fetch {
  let calls = 0;
  return (async () => {
    const r = responses[calls];
    calls += 1;
    if (r === undefined) throw new Error("no more mock responses");
    return new Response(JSON.stringify(r), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("describe()", () => {
  test("returns a non-empty descriptive string", () => {
    expect(describeStub()).toMatch(/eval-runner/i);
  });
});

describe("runEval", () => {
  test("happy path — all correct → category_accuracy=1, factuality=1, flag_policy=1", async () => {
    // IDs are sorted by the runner — declare them in sorted order so the
    // mock fetch responses align with the order cases get processed.
    const cases = [
      {
        id: "case-1-sizing",
        fixture_message: "messages/case-1-sizing.json",
        expected: {
          category: "sizing_measurements",
          must_use_facts: ["listing.measurements.chest_pit_to_pit_in"],
          ideal_draft_excerpts: ["22 in"],
        },
      },
      {
        id: "case-2-shipping",
        fixture_message: "messages/case-2-shipping.json",
        expected: { category: "shipping_timeline" },
      },
    ];
    const tmp = setupTmp(cases);
    try {
      const fetchImpl = makeFetch([
        makeDraftResponse({ category: "sizing_measurements" }),
        makeDraftResponse({
          category: "shipping_timeline",
          used_facts: [],
          draft: "Ships in 1-2 days.",
        }),
      ]);
      const logs: string[] = [];
      const { report, exitCode } = await runEval({
        apiBase: "http://mock",
        casesDir: tmp.casesDir,
        fixturesDir: tmp.fixturesDir,
        reportPath: tmp.reportPath,
        failOnRegression: true,
        thresholdAccuracy: 0.8,
        thresholdFactuality: 1.0,
        printDrafts: false,
        fetchImpl,
        log: (s) => logs.push(s),
        errLog: () => {},
      });
      expect(exitCode).toBe(0);
      expect(report.total_cases).toBe(2);
      expect(report.category_accuracy).toBe(1);
      expect(report.factuality_pass_rate).toBe(1);
      expect(report.flag_policy_pass_rate).toBe(1);
      expect(report.excerpt_match_rate).toBe(1);
      expect(report.category_macro_f1).toBe(1);
      // Report file written
      const written = JSON.parse(readFileSync(tmp.reportPath, "utf8"));
      expect(written.total_cases).toBe(2);
    } finally {
      tmp.cleanup();
    }
  });

  test("category mismatch lowers accuracy and fails threshold when --fail-on-regression", async () => {
    const cases = [
      {
        id: "case-1-sizing",
        fixture_message: "messages/case-1-sizing.json",
        expected: { category: "sizing_measurements" },
      },
      {
        id: "case-2-shipping",
        fixture_message: "messages/case-2-shipping.json",
        expected: { category: "shipping_timeline" },
      },
    ];
    const tmp = setupTmp(cases);
    try {
      // Both predict sizing_measurements → ship-01 is wrong → 50% accuracy
      const fetchImpl = makeFetch([
        makeDraftResponse({ category: "sizing_measurements" }),
        makeDraftResponse({ category: "sizing_measurements" }),
      ]);
      const errs: string[] = [];
      const { report, exitCode } = await runEval({
        apiBase: "http://mock",
        casesDir: tmp.casesDir,
        fixturesDir: tmp.fixturesDir,
        reportPath: null,
        failOnRegression: true,
        thresholdAccuracy: 0.8,
        thresholdFactuality: 1.0,
        printDrafts: false,
        fetchImpl,
        log: () => {},
        errLog: (s) => errs.push(s),
      });
      expect(report.category_accuracy).toBe(0.5);
      expect(exitCode).toBe(1);
      expect(errs.some((e) => e.includes("category_accuracy"))).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });

  test("factuality fail when must_use_facts entry is missing from used_facts", async () => {
    const cases = [
      {
        id: "siz-01",
        fixture_message: "messages/siz-01.json",
        expected: {
          category: "sizing_measurements",
          must_use_facts: [
            "listing.measurements.chest_pit_to_pit_in",
            "listing.measurements.shoulder_seam_to_seam_in",
          ],
        },
      },
    ];
    const tmp = setupTmp(cases);
    try {
      const fetchImpl = makeFetch([
        makeDraftResponse({
          category: "sizing_measurements",
          used_facts: ["listing.measurements.chest_pit_to_pit_in"], // missing shoulder
        }),
      ]);
      const { report, exitCode } = await runEval({
        apiBase: "http://mock",
        casesDir: tmp.casesDir,
        fixturesDir: tmp.fixturesDir,
        reportPath: null,
        failOnRegression: true,
        thresholdAccuracy: 0.8,
        thresholdFactuality: 1.0,
        printDrafts: false,
        fetchImpl,
        log: () => {},
        errLog: () => {},
      });
      expect(report.factuality_pass_rate).toBe(0);
      expect(report.cases[0]?.missing_facts).toEqual([
        "listing.measurements.shoulder_seam_to_seam_in",
      ]);
      expect(exitCode).toBe(1);
    } finally {
      tmp.cleanup();
    }
  });

  test("flag_policy fail when forbidden flag is returned", async () => {
    const cases = [
      {
        id: "siz-01",
        fixture_message: "messages/siz-01.json",
        expected: {
          category: "sizing_measurements",
          must_not_flag: ["forbidden_phrase_money"],
        },
      },
    ];
    const tmp = setupTmp(cases);
    try {
      const fetchImpl = makeFetch([
        makeDraftResponse({
          category: "sizing_measurements",
          flags: ["forbidden_phrase_money"],
        }),
      ]);
      const { report, exitCode } = await runEval({
        apiBase: "http://mock",
        casesDir: tmp.casesDir,
        fixturesDir: tmp.fixturesDir,
        reportPath: null,
        failOnRegression: false, // flag policy is not a hard gate, just a metric
        thresholdAccuracy: 0.8,
        thresholdFactuality: 1.0,
        printDrafts: false,
        fetchImpl,
        log: () => {},
        errLog: () => {},
      });
      expect(report.flag_policy_pass_rate).toBe(0);
      expect(report.cases[0]?.forbidden_flags_returned).toEqual([
        "forbidden_phrase_money",
      ]);
      // No fail-on-regression → exit 0 even though flag policy was hit
      expect(exitCode).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });

  test("fetch rejection surfaces as ApiUnreachableError", async () => {
    const cases = [
      {
        id: "siz-01",
        fixture_message: "messages/siz-01.json",
        expected: { category: "sizing_measurements" },
      },
    ];
    const tmp = setupTmp(cases);
    try {
      const failingFetch = (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch;
      const errs: string[] = [];
      await expect(
        runEval({
          apiBase: "http://127.0.0.1:9999",
          casesDir: tmp.casesDir,
          fixturesDir: tmp.fixturesDir,
          reportPath: null,
          failOnRegression: false,
          thresholdAccuracy: 0.8,
          thresholdFactuality: 1.0,
          printDrafts: false,
          fetchImpl: failingFetch,
          log: () => {},
          errLog: (s) => errs.push(s),
        }),
      ).rejects.toThrow(/unreachable/);
      expect(errs.some((e) => e.includes("pnpm dev:api"))).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });
});

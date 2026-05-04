import { describe, expect, test } from "vitest";
import { EvalCaseSchema } from "./schema.js";

describe("EvalCaseSchema", () => {
  test("rejects unknown category", () => {
    const bad = {
      id: "bad-01",
      fixture_message: "messages/x.json",
      expected: { category: "not_a_real_category" },
    };
    const r = EvalCaseSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  test("applies defaults: empty must_use_facts/must_not_flag/excerpts, friendly voice, null listing", () => {
    const minimal = {
      id: "minimal-01",
      fixture_message: "messages/sizing-01.json",
      expected: { category: "sizing_measurements" },
    };
    const r = EvalCaseSchema.parse(minimal);
    expect(r.brandVoice).toBe("friendly");
    expect(r.fixture_listing).toBeNull();
    expect(r.expected.must_use_facts).toEqual([]);
    expect(r.expected.must_not_flag).toEqual([]);
    expect(r.expected.ideal_draft_excerpts).toEqual([]);
  });

  test("rejects unknown flag in must_not_flag", () => {
    const bad = {
      id: "bad-02",
      fixture_message: "messages/x.json",
      expected: {
        category: "sizing_measurements",
        must_not_flag: ["not_a_real_flag"],
      },
    };
    const r = EvalCaseSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  test("accepts a fully-populated case", () => {
    const full = {
      id: "sizing-01",
      fixture_message: "messages/sizing-01.json",
      fixture_listing: "listings/vint-501-jacket-001.json",
      brandVoice: "professional",
      expected: {
        category: "sizing_measurements",
        must_use_facts: ["listing.measurements.chest_pit_to_pit_in"],
        must_not_flag: ["forbidden_phrase_money"],
        ideal_draft_excerpts: ["22 in"],
      },
    };
    const r = EvalCaseSchema.parse(full);
    expect(r.brandVoice).toBe("professional");
    expect(r.expected.must_use_facts).toEqual([
      "listing.measurements.chest_pit_to_pit_in",
    ]);
  });
});

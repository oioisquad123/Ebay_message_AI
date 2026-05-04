import { describe, expect, test } from "vitest";
import { scrubPii } from "./scrubPii.js";

describe("scrubPii", () => {
  test("redacts email addresses", () => {
    const r = scrubPii("Contact me at jane.doe+sales@example.co.uk for info.");
    expect(r.scrubbed).toContain("[email]");
    expect(r.scrubbed).not.toContain("jane.doe");
    expect(r.redactionCount).toBe(1);
  });

  test("redacts US phone numbers in common formats", () => {
    const r = scrubPii("Call (415) 555-2671 or 415-555-2671 anytime.");
    expect(r.scrubbed).not.toMatch(/415/);
    expect(r.redactionCount).toBe(2);
  });

  test("redacts UK phone numbers", () => {
    const r = scrubPii("Ring me on +44 20 7946 0958 about the jacket.");
    expect(r.scrubbed).toContain("[phone]");
    expect(r.scrubbed).not.toMatch(/7946/);
    expect(r.redactionCount).toBe(1);
  });

  test("redacts US street addresses with common suffixes", () => {
    const r = scrubPii("Ship to 1600 Pennsylvania Ave, Washington DC.");
    expect(r.scrubbed).toContain("[address]");
    expect(r.scrubbed).not.toMatch(/Pennsylvania Ave/);
    expect(r.redactionCount).toBe(1);
  });

  test("redacts credit-card-like number runs", () => {
    const r = scrubPii("My card is 4111 1111 1111 1111 if that helps.");
    expect(r.scrubbed).toContain("[card]");
    expect(r.scrubbed).not.toMatch(/4111/);
    expect(r.redactionCount).toBe(1);
  });

  test("redacts SSN-shaped strings", () => {
    const r = scrubPii("My SSN is 123-45-6789, please don't share it.");
    expect(r.scrubbed).toContain("[ssn]");
    expect(r.scrubbed).not.toMatch(/123-45-6789/);
    expect(r.redactionCount).toBe(1);
  });

  test("returns redactionCount=0 for clean text", () => {
    const r = scrubPii("Hi, is this jacket still available?");
    expect(r.scrubbed).toBe("Hi, is this jacket still available?");
    expect(r.redactionCount).toBe(0);
  });

  test("counts multiple PII items in a single message", () => {
    const r = scrubPii(
      "Email me at buyer@gmail.com or call 555-123-4567 — my SSN is 123-45-6789.",
    );
    expect(r.redactionCount).toBeGreaterThanOrEqual(3);
    expect(r.scrubbed).toContain("[email]");
    expect(r.scrubbed).toContain("[phone]");
    expect(r.scrubbed).toContain("[ssn]");
  });
});

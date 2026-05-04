import { describe, expect, test } from "vitest";
import { checkOutputPolicy } from "./checkOutputPolicy.js";

describe("checkOutputPolicy", () => {
  test("returns no flags for a clean draft", () => {
    const flags = checkOutputPolicy(
      "Hi! This jacket measures 22in pit-to-pit and ships in 1-2 business days. Thanks!",
    );
    expect(flags).toEqual([]);
  });

  test("flags PayPal solicitation as money + offplatform", () => {
    const flags = checkOutputPolicy(
      "Sure, you can send the payment via PayPal to my account.",
    );
    expect(flags).toContain("forbidden_phrase_money");
    expect(flags).toContain("forbidden_phrase_offplatform");
  });

  test("flags refund admissions", () => {
    const flags = checkOutputPolicy(
      "No problem — I'll refund you the full amount today.",
    );
    expect(flags).toContain("forbidden_phrase_refund_admission");
  });

  test("flags 'DM me' as off-platform contact", () => {
    const flags = checkOutputPolicy(
      "Sure, just DM me on Instagram and we can sort it out.",
    );
    expect(flags).toContain("forbidden_phrase_offplatform");
  });

  test("does NOT flag the benign phrase 'PayPal-style'", () => {
    const flags = checkOutputPolicy(
      "We use eBay's PayPal-style buyer protection — every order is covered.",
    );
    expect(flags).not.toContain("forbidden_phrase_money");
    expect(flags).not.toContain("forbidden_phrase_offplatform");
  });

  test("does NOT flag a refusal that mentions paypal", () => {
    const flags = checkOutputPolicy(
      "Sorry, I can't accept PayPal directly — eBay checkout only.",
    );
    expect(flags).not.toContain("forbidden_phrase_money");
  });

  test("flags a bare email address in the draft", () => {
    const flags = checkOutputPolicy(
      "Reach out to bayu@example.com for faster service.",
    );
    expect(flags).toContain("forbidden_phrase_offplatform");
  });

  test("flags wire transfer and gift card phrases", () => {
    const flags1 = checkOutputPolicy("Please send a wire transfer to my bank.");
    const flags2 = checkOutputPolicy("I'll take payment as a gift card.");
    expect(flags1).toContain("forbidden_phrase_money");
    expect(flags2).toContain("forbidden_phrase_money");
  });

  test("returns unique flags only", () => {
    const flags = checkOutputPolicy(
      "Email me, text me, and DM me whenever — happy to help!",
    );
    // Even though three off-platform phrases match, the flag list is deduped.
    const offPlatformCount = flags.filter(
      (f) => f === "forbidden_phrase_offplatform",
    ).length;
    expect(offPlatformCount).toBe(1);
  });
});

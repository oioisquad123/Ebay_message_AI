import { describe, expect, test } from "vitest";
import { getBrandVoiceFragment } from "./brandVoice.js";

describe("getBrandVoiceFragment", () => {
  test("returns a non-empty fragment for friendly", () => {
    const f = getBrandVoiceFragment("friendly");
    expect(f.length).toBeGreaterThan(50);
    expect(f.toLowerCase()).toContain("friendly");
  });

  test("returns a non-empty fragment for professional", () => {
    const f = getBrandVoiceFragment("professional");
    expect(f.length).toBeGreaterThan(50);
    expect(f.toLowerCase()).toContain("professional");
  });

  test("returns a non-empty fragment for casual", () => {
    const f = getBrandVoiceFragment("casual");
    expect(f.length).toBeGreaterThan(50);
    expect(f.toLowerCase()).toContain("casual");
  });

  test("the three fragments are all distinct", () => {
    const friendly = getBrandVoiceFragment("friendly");
    const professional = getBrandVoiceFragment("professional");
    const casual = getBrandVoiceFragment("casual");
    expect(friendly).not.toBe(professional);
    expect(professional).not.toBe(casual);
    expect(friendly).not.toBe(casual);
  });
});

/**
 * PII regex pre-pass per PRD §21.2 / CLAUDE.md constraint 12.
 * Default-on. Runs BEFORE any Claude call and BEFORE the buyer body
 * is wrapped in untrusted-content delimiters.
 *
 * Conservative-leaning: false positives (over-redaction) are preferred
 * over false negatives (PII leaked to the model). The seller can still
 * see the original message; only the model sees the scrubbed version.
 */

interface PatternRule {
  /** Order matters: earlier rules win on overlap. */
  name: string;
  regex: RegExp;
  replacement: string;
}

// NOTE: Card pattern is intentionally placed BEFORE phone so a 16-digit run
// formatted with dashes/spaces doesn't get partially eaten by the phone regex.
// SSN must come before card so 9-digit dashed SSN ("123-45-6789") doesn't fall
// through to a card match.
const RULES: ReadonlyArray<PatternRule> = [
  {
    name: "email",
    // RFC-5322-lite. Good enough for messaging; strict validation isn't the goal.
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[email]",
  },
  {
    name: "ssn",
    // 9 digits with two dashes (US SSN). Must run before card.
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[ssn]",
  },
  {
    name: "card",
    // 13-19 digits, optionally separated by spaces or dashes. Word boundaries
    // around the whole run prevent eating long ID strings glued to letters.
    regex: /\b(?:\d[ -]?){12,18}\d\b/g,
    replacement: "[card]",
  },
  {
    name: "phone",
    // Handles common formats:
    //   US: (415) 555-2671, 415-555-2671, 415.555.2671, +1 415 555 2671
    //   UK: +44 20 7946 0958, 020 7946 0958
    // Two alternatives:
    //   (a) optional paren-area-code + two digit groups (e.g. "(415) 555-2671")
    //   (b) optional country code + three+ digit groups separated by spaces/dashes/dots
    regex:
      /(?:\+?\d{1,3}[\s.\-]?)?\(\d{2,4}\)[\s.\-]?\d{2,4}[\s.\-]?\d{2,4}|(?:\+?\d{1,3}[\s.\-]?)?\d{2,4}[\s.\-]\d{2,4}[\s.\-]\d{2,4}(?:[\s.\-]\d{2,4})?/g,
    replacement: "[phone]",
  },
  {
    name: "address",
    // Street-number + 1-4 words + St/Ave/Rd/Dr/Blvd/Ln (case-insensitive).
    regex:
      /\b\d{1,5}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane)\b\.?/gi,
    replacement: "[address]",
  },
];

export function scrubPii(text: string): {
  scrubbed: string;
  redactionCount: number;
} {
  let scrubbed = text;
  let redactionCount = 0;

  for (const rule of RULES) {
    scrubbed = scrubbed.replace(rule.regex, () => {
      redactionCount += 1;
      return rule.replacement;
    });
  }

  return { scrubbed, redactionCount };
}

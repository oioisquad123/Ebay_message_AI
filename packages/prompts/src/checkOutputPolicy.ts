import type { DraftFlag } from "@app/shared";

/**
 * Output policy filter per CLAUDE.md constraint 13 / PRD §26.
 * Scans the model's draft for forbidden phrases and returns the unique
 * `DraftFlag`s triggered. Used by the server post-LLM, before the seller
 * sees the draft.
 *
 * The matchers are intentionally word-boundary aware so that benign
 * surface forms (e.g. "PayPal-style", "non-refundable") do not flag.
 */

interface PolicyRule {
  /** Match against lowercased draft. */
  pattern: RegExp;
  flag: DraftFlag;
  /** Optional second flag triggered by the same match. */
  secondaryFlag?: DraftFlag;
}

// Money / off-platform payment processors. We only flag when the
// processor name appears as a real reference, not as a comparison
// (e.g., "PayPal-style" or "this isn't PayPal").
// Strategy: require the processor token to be followed by a space-or-end
// (i.e., not directly hyphenated/composed into a longer word) and to NOT
// be immediately preceded by "not " or "isn't ".
const PAYMENT_PROCESSORS = [
  "paypal",
  "venmo",
  "zelle",
  "cashapp",
  "cash app",
  "whatsapp",
  "telegram",
];

const MONEY_PHRASES = [
  /\bsend\s+me\s+(?:the\s+)?money\b/i,
  /\bwire\s+transfer\b/i,
  /\bgift\s+card\b/i,
  /\bpay\s+me\s+(?:via|through|on)\b/i,
];

const REFUND_PHRASES = [
  /\bi(?:'|\s+wi)?ll\s+refund\b/i,
  /\bi\s+can\s+refund\b/i,
  /\bfull\s+refund\b/i,
  /\byour\s+money\s+back\b/i,
  /\brefund\s+(?:has\s+been\s+)?issued\b/i,
];

const OFFPLATFORM_PHRASES = [
  /\bdm\s+me\b/i,
  /\btext\s+me\b/i,
  /\bemail\s+me\b/i,
  /\bcall\s+me\b/i,
  /\bmessage\s+me\s+(?:on|at|via)\b/i,
];

// Email or US/UK phone in the draft itself = off-platform contact attempt.
const CONTACT_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const CONTACT_PHONE = /(?:\+?\d{1,3}[\s.\-]?)?(?:\(\d{2,4}\)[\s.\-]?)?\d{2,4}[\s.\-]\d{2,4}[\s.\-]\d{2,4}/;

function mentionsProcessor(draft: string, token: string): boolean {
  // Word-ish boundary before, then the literal token, then a non-letter or end.
  // Reject forms that look like comparisons or compounds.
  const lc = draft.toLowerCase();
  // Build a regex that matches the token only when surrounded by typical
  // sentence punctuation/whitespace, not by hyphen-connected suffixes.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9-])`, "i");
  if (!re.test(lc)) return false;

  // Reject when a refusal/negation appears within ~6 words before the token.
  // Covers: "not paypal", "I can't accept paypal", "we don't use paypal",
  // "sorry, no paypal here", "never via paypal", etc. Also excludes
  // "<token>-style" via the (?![a-z0-9-]) lookahead above.
  const negationRe = new RegExp(
    `\\b(?:not|isn'?t|no|never|don'?t|do\\s+not|cannot|can'?t|won'?t|would\\s+not|wouldn'?t)\\b(?:\\W+\\w+){0,6}?\\W+${escaped}(?![a-z0-9-])`,
    "i",
  );
  if (negationRe.test(lc)) return false;

  return true;
}

export function checkOutputPolicy(draft: string): DraftFlag[] {
  const flags = new Set<DraftFlag>();

  // Payment processors → both money + off-platform.
  for (const token of PAYMENT_PROCESSORS) {
    if (mentionsProcessor(draft, token)) {
      flags.add("forbidden_phrase_money");
      flags.add("forbidden_phrase_offplatform");
    }
  }

  // Other money phrases.
  for (const re of MONEY_PHRASES) {
    if (re.test(draft)) {
      flags.add("forbidden_phrase_money");
    }
  }

  // Refund admissions.
  for (const re of REFUND_PHRASES) {
    if (re.test(draft)) {
      flags.add("forbidden_phrase_refund_admission");
    }
  }

  // Off-platform contact phrases.
  for (const re of OFFPLATFORM_PHRASES) {
    if (re.test(draft)) {
      flags.add("forbidden_phrase_offplatform");
    }
  }

  // Bare contact info in the draft itself.
  if (CONTACT_EMAIL.test(draft) || CONTACT_PHONE.test(draft)) {
    flags.add("forbidden_phrase_offplatform");
  }

  return Array.from(flags);
}

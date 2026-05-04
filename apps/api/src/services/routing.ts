/**
 * V0 Day 9 — tiered model routing.
 *
 * A lightweight keyword-based pre-classifier that picks Haiku vs Sonnet
 * before the LLM call. Per EXECUTION_PLAN.md V0 Day 9:
 *
 *   "Haiku for sizing/shipping/greeting, Sonnet for negotiation/condition;
 *    log model + tokens to llm_calls."
 *
 * And per CLAUDE.md anti-pattern #3 ("Hand-rolling the embedding classifier
 * as an early task. Until Slice 3, ship with one-line heuristic + Sonnet
 * for everything; embeddings come when eval shows cost matters.") — this
 * is intentionally a regex-keyword heuristic, not an embedding classifier.
 *
 * Routing rules:
 *   - High-volume bounded categories → Haiku (sizing, shipping, greeting,
 *     combined-shipping-discount).
 *   - High-stakes / nuance-heavy categories → Sonnet (condition,
 *     negotiation, returns, complaints). returns_refunds + complaint_dispute
 *     also get flagged by the policy layer downstream — Sonnet is the safer
 *     default-up model for the always-flagged categories too.
 *   - other_unclear default → Sonnet (better recall on ambiguous text).
 *
 * The function is PURE and synchronous — call it before generateDraft and
 * pass the returned `model` as opts.modelOverride.
 */
import type { Category } from "@app/shared";

export const HAIKU_MODEL = "anthropic/claude-haiku-4-5";
export const SONNET_MODEL = "anthropic/claude-sonnet-4-5";

const HAIKU_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  "sizing_measurements",
  "shipping_timeline",
  "generic_greeting",
  "combined_shipping_discount",
]);

/**
 * Per-category keyword regexes. Keep these conservative — false positives
 * on returns/complaints route to Sonnet anyway, so the worst-case error
 * for an unknown buyer message is "we paid Sonnet rates instead of Haiku",
 * not "we drafted something we shouldn't have".
 *
 * Pattern order matches the priority used in `routeModel` (later entries
 * win on ties — complaint > returns > offer > condition > sizing > etc.).
 */
const PATTERNS: Array<{ category: Category; re: RegExp }> = [
  // Lowest priority first.
  {
    category: "generic_greeting",
    // Bare-greeting messages: starts with hi/hey/hello/thanks and is short.
    re: /^(hi|hey|hello|thanks|thx|cheers|good\s+(morning|afternoon|evening))\b/i,
  },
  {
    category: "shipping_timeline",
    re: /\b(ship(ping|ment|ped)?|deliver(y|ed)?|arriv(e|al|es|ing)|track(ing)?|carrier|usps|fedex|dhl|ups\b|royal\s*mail|how\s+(long|soon)|days?\s+to\s+ship|when\s+(will|does|can))/i,
  },
  {
    // Comes AFTER shipping_timeline so a combined-shipping phrase wins ties
    // (more specific intent than plain "when does it ship").
    category: "combined_shipping_discount",
    re: /\b(combin(e|ed|ing)\s+(ship|postage|order)|multiple\s+items?|bundle|all\s+(three|four|five)|both\s+(items?|listings?))\b/i,
  },
  {
    category: "sizing_measurements",
    re: /\b(size|sizing|fit|fits|measur(e|ement)|chest|waist|inseam|hips?|bust|neck|sleeve|shoulder|inches?|\bin\b|cm|pit.to.pit|p2p|length|small|medium|large|\bxs\b|\bxl\b|\bxxl\b|true\s+to\s+size)/i,
  },
  {
    category: "condition_authenticity",
    re: /\b(condition|authentic(ity)?|\breal\b|fake|legit|original|reproduction|\brepro\b|knock.?off|tag|stitch|stitching|flaw|damage|stain|hole|\btear\b|year(\s+made)?|made\s+in|vintage|provenance)/i,
  },
  {
    category: "offer_negotiation",
    re: /\b(offer|best\s+price|discount|cheap(er)?|lower(?!\s+back)|negotiat|how\s+about|would\s+you\s+(take|do|accept)|\$\d+|deal|drop\s+the\s+price|knock\s+(off|down)|firm\?)/i,
  },
  {
    category: "returns_refunds",
    re: /\b(return(ing|ed|s)?|refund|money\s+back|send.+back|exchange|doesn'?t\s+(fit|work)|wrong\s+(item|size|color))/i,
  },
  // Highest priority — wins ties.
  {
    category: "complaint_dispute",
    re: /\b(broken|damag(ed|e)|missing|disappointed|complain(t)?|unhappy|terrible|awful|case|paypal|chargeback|file(d)?\s+a|dispute|inad(equate|missible)|misrepresent|scam(med)?)/i,
  },
];

export interface RoutingDecision {
  model: string;
  predicted_category: Category;
  /** 0 if no keywords matched (falls back to other_unclear → Sonnet). */
  match_count: number;
  matched_keywords: string[];
}

/**
 * Pick a model for a buyer message based on keyword matches.
 *
 * Tie-break: highest match-count wins; on equal count, the later pattern
 * in PATTERNS[] wins (so complaint > returns > offer > condition > sizing
 * > shipping > combined-shipping > greeting). The default category is
 * `other_unclear` → Sonnet.
 */
export function routeModel(body: string): RoutingDecision {
  const counts = new Map<Category, { count: number; words: string[] }>();
  for (const { category, re } of PATTERNS) {
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    const matches = Array.from(body.matchAll(globalRe), (m) => m[0]);
    if (matches.length > 0) {
      counts.set(category, { count: matches.length, words: matches });
    }
  }

  if (counts.size === 0) {
    return {
      model: SONNET_MODEL,
      predicted_category: "other_unclear",
      match_count: 0,
      matched_keywords: [],
    };
  }

  // Walk PATTERNS in order so later (higher-priority) categories win ties.
  let winner: { category: Category; count: number; words: string[] } | null = null;
  for (const { category } of PATTERNS) {
    const hit = counts.get(category);
    if (!hit) continue;
    if (!winner || hit.count >= winner.count) {
      winner = { category, count: hit.count, words: hit.words };
    }
  }

  if (!winner) {
    return {
      model: SONNET_MODEL,
      predicted_category: "other_unclear",
      match_count: 0,
      matched_keywords: [],
    };
  }

  const model = HAIKU_CATEGORIES.has(winner.category) ? HAIKU_MODEL : SONNET_MODEL;
  return {
    model,
    predicted_category: winner.category,
    match_count: winner.count,
    matched_keywords: winner.words,
  };
}

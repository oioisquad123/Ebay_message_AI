/**
 * V0 Day 3: pure listing-page parser.
 *
 * Per CLAUDE.md #8 (selectors are DATA), this function consumes a SelectorConfig
 * but bakes in NO selectors of its own. Per CLAUDE.md #11 (platform abstraction),
 * even though the script only runs on eBay today, this parser stays platform-
 * agnostic at its boundary: it takes a Document plus config plus URL and emits a
 * platform-neutral ListingKb.
 *
 * Algorithm:
 *  1. If no listing_selectors configured then bail with a warning.
 *  2. Extract ebay_item_id via attribute, pathname-regex, or textContent.
 *  3. Best-effort extract optional fields (title, condition, brand, size,
 *     color, description). Skip silently if absent.
 *  4. Validate the ListingKb with Zod; bail with the issue summary if it
 *     does not validate (title is required by the schema).
 *
 * Measurements / shipping / returns are NOT auto-extracted in V0: real eBay
 * puts these in iframes / structured data we do not currently parse, and the
 * fixture's prose-style description block does not map cleanly onto the
 * existing structured schemas. Leaving them undefined keeps factuality safe.
 */

import {
  ListingKbSchema,
  type ListingKb,
  type SelectorConfig,
} from "@app/shared/contracts";
import { selectorMatch } from "./parseMessages.js";

const RAW_DESCRIPTION_MAX = 300;

export interface ParseListingResult {
  listingKb: ListingKb | null;
  warnings: string[];
}

interface AttrSelectorLike {
  primary: string;
  attribute?: string;
  fallbacks?: string[];
}

/**
 * Try selector candidates in order; for each, return the matched element's
 * `attribute` (when configured) or its trimmed textContent. Returns the
 * first non-empty value found, or undefined.
 */
function readWithAttribute(
  root: ParentNode,
  cfg: AttrSelectorLike,
): string | undefined {
  const candidates = [cfg.primary, ...(cfg.fallbacks ?? [])];
  for (const sel of candidates) {
    let el: Element | null = null;
    try {
      el = root.querySelector(sel);
    } catch {
      // bad selector string - skip
    }
    if (!el) continue;
    if (cfg.attribute) {
      const v = el.getAttribute(cfg.attribute);
      if (v && v.trim().length > 0) return v.trim();
    } else {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t.length > 0) return t;
    }
  }
  return undefined;
}

function readText(
  root: ParentNode,
  cfg: { primary: string; fallbacks?: string[] },
): string | undefined {
  const el = selectorMatch(root, cfg);
  if (!el) return undefined;
  const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : undefined;
}

function extractItemIdFromPathname(
  pathname: string,
  regexSource: string,
): string | undefined {
  let re: RegExp;
  try {
    re = new RegExp(regexSource);
  } catch {
    return undefined;
  }
  const m = re.exec(pathname);
  if (!m) return undefined;
  const cap = m[1] ?? m[0];
  if (typeof cap !== "string") return undefined;
  const trimmed = cap.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseListing(
  doc: Document,
  cfg: SelectorConfig,
  locationHref: string,
): ParseListingResult {
  const warnings: string[] = [];

  if (!cfg.listing_selectors) {
    return {
      listingKb: null,
      warnings: ["listing_selectors not configured"],
    };
  }
  const ls = cfg.listing_selectors;

  // 1. ebay_item_id
  let ebayItemId: string | undefined;
  if (ls.item_id) {
    // DOM-based extraction first.
    ebayItemId = readWithAttribute(doc, ls.item_id);

    // If nothing yet AND a pathname regex is configured, try that.
    if (!ebayItemId && ls.item_id.location_pathname_regex) {
      let pathname = locationHref;
      try {
        pathname = new URL(locationHref).pathname;
      } catch {
        // locationHref was not a parseable URL - fall back to raw.
      }
      ebayItemId = extractItemIdFromPathname(
        pathname,
        ls.item_id.location_pathname_regex,
      );
    }
  }

  if (!ebayItemId) {
    warnings.push("could not extract ebay_item_id");
    return { listingKb: null, warnings };
  }

  // 2. Optional fields - best-effort.
  const title = readText(doc, ls.title);
  const condition = ls.condition ? readText(doc, ls.condition) : undefined;
  const brand = ls.brand ? readText(doc, ls.brand) : undefined;
  const size = ls.size ? readText(doc, ls.size) : undefined;
  const color = ls.color ? readText(doc, ls.color) : undefined;
  const descRaw = ls.description ? readText(doc, ls.description) : undefined;
  const rawDescriptionExcerpt = descRaw
    ? descRaw.slice(0, RAW_DESCRIPTION_MAX)
    : undefined;

  // Build the candidate. Spread guards keep undefineds out so Zod's
  // optional-with-no-default behavior stays predictable. `title` is required
  // by ListingKbSchema; if absent we let Zod surface the validation error
  // rather than fabricating a value.
  const candidate: ListingKb = {
    ebay_item_id: ebayItemId,
    title: title as string,
    ...(condition ? { condition } : {}),
    ...(brand ? { brand } : {}),
    ...(size ? { size } : {}),
    ...(color ? { color } : {}),
    ...(rawDescriptionExcerpt
      ? { raw_description_excerpt: rawDescriptionExcerpt }
      : {}),
  };

  const parsed = ListingKbSchema.safeParse(candidate);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    warnings.push(`listingKb failed validation: ${summary}`);
    return { listingKb: null, warnings };
  }

  return { listingKb: parsed.data, warnings };
}

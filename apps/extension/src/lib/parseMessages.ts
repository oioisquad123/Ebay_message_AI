import type { BuyerMessage, SelectorConfig } from "@app/shared/contracts";

/**
 * Tries `primary` selector first, then falls back through each `fallbacks`
 * entry in order. Returns the first matching element, or null.
 *
 * Note: returns the *first* match. For multi-element queries (like the thread
 * row list), use selectorMatchAll.
 */
export function selectorMatch(
  root: ParentNode,
  selector: { primary: string; fallbacks?: string[] },
): Element | null {
  try {
    const hit = root.querySelector(selector.primary);
    if (hit) return hit;
  } catch {
    // bad selector string — fall through to fallbacks
  }
  for (const fb of selector.fallbacks ?? []) {
    try {
      const hit = root.querySelector(fb);
      if (hit) return hit;
    } catch {
      // ignore and continue
    }
  }
  return null;
}

export function selectorMatchAll(
  root: ParentNode,
  selector: { primary: string; fallbacks?: string[] },
): Element[] {
  try {
    const hits = root.querySelectorAll(selector.primary);
    if (hits.length > 0) return Array.from(hits);
  } catch {
    // ignore
  }
  for (const fb of selector.fallbacks ?? []) {
    try {
      const hits = root.querySelectorAll(fb);
      if (hits.length > 0) return Array.from(hits);
    } catch {
      // ignore
    }
  }
  return [];
}

function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Try the selector against the row itself first (in case the row is the
 * element holding the attribute), then descendants. `Element.matches()`
 * tests the element itself; `querySelector` only walks descendants.
 */
function selectorMatchSelfOrDescendant(
  row: Element,
  selector: { primary: string; fallbacks?: string[] },
): Element | null {
  const candidates = [selector.primary, ...(selector.fallbacks ?? [])];
  for (const sel of candidates) {
    try {
      if (row.matches(sel)) return row;
    } catch {
      // bad selector — try as descendant query
    }
    try {
      const hit = row.querySelector(sel);
      if (hit) return hit;
    } catch {
      // ignore
    }
  }
  return null;
}

function readField(
  row: Element,
  config: { primary: string; attribute?: string; fallbacks?: string[] } | undefined,
): string | undefined {
  if (!config) return undefined;
  const el = selectorMatchSelfOrDescendant(row, config);
  if (!el) return undefined;
  if (config.attribute) {
    const attr = el.getAttribute(config.attribute);
    return attr ? attr.trim() : undefined;
  }
  const text = normalizeText(el.textContent);
  return text.length > 0 ? text : undefined;
}

export interface ParseResult {
  messages: BuyerMessage[];
  warnings: string[];
}

/**
 * Pure function: extract buyer messages from a Document using a SelectorConfig.
 *
 * Returns BuyerMessage objects with userId hardcoded to "u-bayu" (V0 personal-tool).
 * Per CLAUDE.md #8, selectors are DATA — this function is the runtime that
 * consumes that data; it does not bake any selectors in.
 */
export function parseMessages(
  doc: Document,
  config: SelectorConfig,
  userId: string = "u-bayu",
): ParseResult {
  const warnings: string[] = [];
  const messages: BuyerMessage[] = [];

  const container = selectorMatch(doc, config.selectors.message_list_container);
  if (!container) {
    warnings.push("no message list container found");
    return { messages, warnings };
  }

  const rows = selectorMatchAll(container, config.selectors.message_thread_row);
  if (rows.length === 0) {
    warnings.push("no message thread rows found");
    return { messages, warnings };
  }

  for (const [idx, row] of rows.entries()) {
    const bodyEl = selectorMatch(row, config.selectors.message_body);
    const buyerEl = selectorMatch(row, config.selectors.buyer_username);

    const body = normalizeText(bodyEl?.textContent ?? null);
    const buyerUsername = normalizeText(buyerEl?.textContent ?? null);

    if (!body) {
      warnings.push(`row ${idx}: missing or empty message body — skipped`);
      continue;
    }
    if (!buyerUsername) {
      warnings.push(`row ${idx}: missing or empty buyer username — skipped`);
      continue;
    }

    const ebayMessageId = readField(row, config.selectors.message_id);
    const ebayItemId = readField(row, config.selectors.item_id);

    let receivedAt: string | undefined;
    if (config.selectors.timestamp) {
      const raw = readField(row, config.selectors.timestamp);
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
          receivedAt = d.toISOString();
        } else {
          warnings.push(
            `row ${idx}: timestamp "${raw}" did not parse as ISO date — omitted`,
          );
        }
      }
    }

    const msg: BuyerMessage = {
      userId,
      buyerUsername,
      body,
      ...(ebayItemId ? { ebayItemId } : {}),
      ...(ebayMessageId ? { ebayMessageId } : {}),
      ...(receivedAt ? { receivedAt } : {}),
    };
    messages.push(msg);
  }

  return { messages, warnings };
}

import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import type { SelectorConfig } from "@app/shared/contracts";
import { parseListing } from "./parseListing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  "../../test/fixtures/ebay-listing-page.html",
);

/**
 * Selector config matching the data-testid attributes used by the fixture.
 * In production this comes from /api/v1/extension/selectors.
 */
const FIXTURE_SELECTORS: SelectorConfig = {
  version: 1,
  page_match: ["https://www.ebay.com/mesg/*"],
  selectors: {
    message_list_container: { primary: ".m-list", fallbacks: [] },
    message_thread_row: { primary: ".m-row", fallbacks: [] },
    message_body: { primary: ".m-body", fallbacks: [] },
    buyer_username: { primary: ".m-buyer", fallbacks: [] },
  },
  debug_notes: {},
  listing_page_match: ["https://www.ebay.com/itm/*"],
  listing_selectors: {
    title: { primary: '[data-testid="listing-title"]', fallbacks: [] },
    price: { primary: '[data-testid="listing-price"]', fallbacks: [] },
    condition: {
      primary: '[data-testid="listing-condition"]',
      fallbacks: [],
    },
    brand: { primary: '[data-testid="listing-brand"]', fallbacks: [] },
    size: { primary: '[data-testid="listing-size"]', fallbacks: [] },
    color: { primary: '[data-testid="listing-color"]', fallbacks: [] },
    description: {
      primary: '[data-testid="listing-description"]',
      fallbacks: [],
    },
    item_id: {
      primary: '[data-testid="listing-page"]',
      attribute: "data-item-id",
      location_pathname_regex: "^/itm/(\\d+)",
      fallbacks: [],
    },
  },
};

let fixtureHtml: string;
beforeAll(() => {
  fixtureHtml = readFileSync(FIXTURE_PATH, "utf8");
});

function loadFixture(
  html: string = fixtureHtml,
  url = "https://www.ebay.com/itm/234567890123",
): { doc: Document; href: string } {
  const dom = new JSDOM(html, { url });
  return { doc: dom.window.document, href: dom.window.location.href };
}

describe("parseListing — happy path with fixture", () => {
  it("returns a ListingKb with all extracted fields", () => {
    const { doc, href } = loadFixture();
    const { listingKb, warnings } = parseListing(doc, FIXTURE_SELECTORS, href);
    expect(warnings).toEqual([]);
    expect(listingKb).not.toBeNull();
    expect(listingKb?.title).toBe(
      "Vintage 90s Levi's 501 Denim Jacket Size M",
    );
    expect(listingKb?.condition).toBe(
      "Pre-owned — Good (light wear at cuffs)",
    );
    expect(listingKb?.brand).toBe("Levi's");
    expect(listingKb?.size).toBe("M");
    expect(listingKb?.color).toBe("Mid-blue wash");
  });

  it("extracts ebay_item_id from data-item-id attribute", () => {
    const { doc, href } = loadFixture();
    const { listingKb } = parseListing(doc, FIXTURE_SELECTORS, href);
    expect(listingKb?.ebay_item_id).toBe("234567890123");
  });

  it("populates raw_description_excerpt and caps at 300 chars", () => {
    const { doc, href } = loadFixture();
    const { listingKb } = parseListing(doc, FIXTURE_SELECTORS, href);
    expect(listingKb?.raw_description_excerpt).toBeDefined();
    expect(listingKb?.raw_description_excerpt?.length).toBeLessThanOrEqual(300);
    // Sanity check — should contain content from the description block.
    expect(listingKb?.raw_description_excerpt).toContain("Authentic vintage");
  });

  it("does NOT auto-extract measurements / shipping / returns in V0", () => {
    const { doc, href } = loadFixture();
    const { listingKb } = parseListing(doc, FIXTURE_SELECTORS, href);
    expect(listingKb?.measurements).toBeUndefined();
    expect(listingKb?.shipping).toBeUndefined();
    expect(listingKb?.returns).toBeUndefined();
  });
});

describe("parseListing — degenerate inputs", () => {
  it("returns {listingKb: null, warnings: [...]} when listing_selectors is absent", () => {
    const { doc, href } = loadFixture();
    const cfgNoListing: SelectorConfig = {
      ...FIXTURE_SELECTORS,
      listing_selectors: undefined,
    };
    const { listingKb, warnings } = parseListing(doc, cfgNoListing, href);
    expect(listingKb).toBeNull();
    expect(warnings).toContain("listing_selectors not configured");
  });

  it("returns {listingKb: null, warnings: [...]} for an empty document", () => {
    const { doc, href } = loadFixture(
      "<!doctype html><html><body></body></html>",
      "https://www.ebay.com/itm/",
    );
    const { listingKb, warnings } = parseListing(doc, FIXTURE_SELECTORS, href);
    expect(listingKb).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("parseListing — pathname regex fallback for item_id", () => {
  it("falls back to URL pathname extraction when the attribute is absent", () => {
    // Strip the data-item-id attribute from the fixture so the DOM-based
    // extraction yields nothing and the regex fallback has to fire.
    const stripped = fixtureHtml.replace(
      /data-item-id="234567890123"/,
      "",
    );
    const { doc, href } = loadFixture(
      stripped,
      "https://www.ebay.com/itm/234567890123",
    );
    const { listingKb, warnings } = parseListing(doc, FIXTURE_SELECTORS, href);
    // The DOM-based extraction with no attribute would otherwise read the
    // textContent of the listing-page container; we still want the regex
    // path to work, which it does because readWithAttribute returns
    // undefined when getAttribute fails on a present element.
    // Either path is acceptable as long as the id resolves correctly.
    expect(warnings.filter((w) => w.includes("ebay_item_id"))).toEqual([]);
    expect(listingKb?.ebay_item_id).toBe("234567890123");
  });

  it("uses the pathname regex when no DOM element matches at all", () => {
    // Doc with NO listing-page element — only a title, so DOM extraction
    // for item_id finds nothing. The regex fallback should fire.
    const html = `<!doctype html><html><body>
      <h1 data-testid="listing-title">Bare-bones listing</h1>
    </body></html>`;
    const { doc, href } = loadFixture(
      html,
      "https://www.ebay.com/itm/999888777666",
    );
    const { listingKb, warnings } = parseListing(doc, FIXTURE_SELECTORS, href);
    expect(warnings).toEqual([]);
    expect(listingKb?.ebay_item_id).toBe("999888777666");
    expect(listingKb?.title).toBe("Bare-bones listing");
  });
});

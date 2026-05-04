/**
 * Default selector config served from GET /api/v1/extension/selectors.
 *
 * Per CLAUDE.md constraint #8: selectors are DATA, not code. The Chrome
 * Web Store policy forbids remotely-hosted code; a JSON config of CSS
 * selectors is data and is therefore allowed to be hot-patched.
 *
 * The V0 defaults match the test fixture at
 * `apps/extension/test/fixtures/ebay-mesg-page.html`. Real eBay's DOM is
 * different (and changes frequently); when it drifts, bump `version` and
 * update the primary/fallback selectors. V1 graduates this from a
 * hardcoded constant to a database-backed table with admin UI.
 */
import { SelectorConfigSchema, type SelectorConfig } from "@app/shared";

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = SelectorConfigSchema.parse(
  {
    // V2 (Day 3): added listing_page_match + listing_selectors. Bump on every
    // contract-shape change so the extension's `?since_version=` cache invalidates.
    version: 2,
    page_match: ["https://www.ebay.com/mesg/*", "https://mesg.ebay.com/*"],
    selectors: {
      message_list_container: { primary: "[data-testid='message-list']" },
      message_thread_row: { primary: "[data-testid='message-thread']" },
      message_body: { primary: "[data-testid='message-body']" },
      buyer_username: { primary: "[data-testid='buyer-username']" },
      item_id: {
        primary: "[data-testid='message-thread']",
        attribute: "data-item-id",
      },
      timestamp: {
        primary: "[data-testid='timestamp']",
        attribute: "datetime",
      },
      message_id: {
        primary: "[data-testid='message-thread']",
        attribute: "data-message-id",
      },
    },
    // V0 Day 3: listing-page selectors matching apps/extension/test/fixtures/ebay-listing-page.html.
    listing_page_match: [
      "https://www.ebay.com/itm/*",
      "https://*.ebay.com/itm/*",
    ],
    listing_selectors: {
      title: { primary: "[data-testid='listing-title']" },
      price: { primary: "[data-testid='listing-price']" },
      condition: { primary: "[data-testid='listing-condition']" },
      brand: { primary: "[data-testid='listing-brand']" },
      size: { primary: "[data-testid='listing-size']" },
      color: { primary: "[data-testid='listing-color']" },
      description: { primary: "[data-testid='listing-description']" },
      item_id: {
        primary: "[data-testid='listing-page']",
        attribute: "data-item-id",
        location_pathname_regex: "/itm/(\\d+)",
      },
    },
    debug_notes: {
      note: "V0 defaults match the fixture. Real eBay DOM differs — update via API.",
    },
  },
);

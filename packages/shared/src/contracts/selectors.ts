import { z } from "zod";

/**
 * Per CLAUDE.md constraint #8: selectors are DATA, not code, so DOM
 * breakage can be hot-patched without re-publishing the extension to the
 * Chrome Web Store. The extension fetches `SelectorConfig` from the
 * backend on startup and caches it.
 *
 * V1 will move this into a dedicated table; V0 just hardcodes a default
 * payload in the API.
 */

export const SelectorConfigSchema = z.object({
  /** Monotonic — bumped every time defaults are updated. Extension caches by version. */
  version: z.number().int().positive(),

  /** URL patterns this config applies to. Glob-style. */
  page_match: z.array(z.string()).min(1),

  /** Strategy: try `primary`, then each `fallbacks` in order. */
  selectors: z.object({
    /** Outer container holding the message thread list. */
    message_list_container: z.object({
      primary: z.string(),
      fallbacks: z.array(z.string()).default([]),
    }),
    /** A single thread row inside `message_list_container`. */
    message_thread_row: z.object({
      primary: z.string(),
      fallbacks: z.array(z.string()).default([]),
    }),
    /** Within a thread row: the body text. */
    message_body: z.object({
      primary: z.string(),
      fallbacks: z.array(z.string()).default([]),
    }),
    /** Within a thread row: the buyer's eBay username. */
    buyer_username: z.object({
      primary: z.string(),
      fallbacks: z.array(z.string()).default([]),
    }),
    /** Optional: where to find the eBay item id. */
    item_id: z
      .object({
        primary: z.string(),
        attribute: z.string().optional(), // e.g. "data-item-id" or "href"
        fallbacks: z.array(z.string()).default([]),
      })
      .optional(),
    /** Optional: thread timestamp. */
    timestamp: z
      .object({
        primary: z.string(),
        attribute: z.string().optional(), // e.g. "datetime"
        fallbacks: z.array(z.string()).default([]),
      })
      .optional(),
    /** Optional: stable per-message id we can dedupe on. */
    message_id: z
      .object({
        primary: z.string(),
        attribute: z.string().optional(),
        fallbacks: z.array(z.string()).default([]),
      })
      .optional(),
  }),

  /** Per-field debug notes — surfaces in extension popup if a field fails to extract. */
  debug_notes: z.record(z.string(), z.string()).default({}),

  /**
   * V0 Day 3: optional listing-page selectors used by the content script
   * that runs on `*.ebay.com/itm/*`. When absent the listing scraper is
   * disabled. URL patterns this applies to live in `listing_page_match`.
   */
  listing_page_match: z.array(z.string()).optional(),
  listing_selectors: z
    .object({
      title: z.object({
        primary: z.string(),
        fallbacks: z.array(z.string()).default([]),
      }),
      price: z
        .object({
          primary: z.string(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
      condition: z
        .object({
          primary: z.string(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
      brand: z
        .object({
          primary: z.string(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
      size: z
        .object({
          primary: z.string(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
      color: z
        .object({
          primary: z.string(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
      /** Description excerpt — usually inside an iframe on real eBay (V0 just reads visible text). */
      description: z
        .object({
          primary: z.string(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
      /** Where to extract the eBay item id (URL pattern or attribute). */
      item_id: z
        .object({
          primary: z.string(),
          attribute: z.string().optional(),
          /** Or extract from `window.location.pathname` matching this regex source. */
          location_pathname_regex: z.string().optional(),
          fallbacks: z.array(z.string()).default([]),
        })
        .optional(),
    })
    .optional(),
});
export type SelectorConfig = z.infer<typeof SelectorConfigSchema>;

/**
 * GET /api/v1/extension/selectors
 *
 * The Chrome extension fetches this on startup (and periodically thereafter)
 * to learn how to scrape the eBay Messages page. Per CLAUDE.md #8, this is
 * DATA — a JSON payload of CSS selectors — not remotely-hosted code, which
 * the CWS forbids.
 *
 * Caching: the response carries `Cache-Control: max-age=60` so the
 * extension re-checks frequently but doesn't hammer the API. The
 * `?since_version=N` query lets a client short-circuit with 304 when its
 * cached version is still current.
 */
import type { FastifyPluginAsync } from "fastify";
import { DEFAULT_SELECTOR_CONFIG } from "../selectors/default.js";

export const selectorsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/extension/selectors", async (request, reply) => {
    const since = parseSinceVersion(
      (request.query as { since_version?: string } | undefined)?.since_version,
    );

    reply.header("Cache-Control", "max-age=60");

    if (since !== null && since >= DEFAULT_SELECTOR_CONFIG.version) {
      // Client already has the current (or newer) config. 304 with empty body.
      return reply.code(304).send();
    }

    return reply.code(200).send(DEFAULT_SELECTOR_CONFIG);
  });
};

/**
 * Returns the parsed integer, or null if the parameter is absent or invalid.
 * Invalid values (`?since_version=foo`) are treated like absent — the route
 * just returns the full config rather than 400ing on a query string.
 */
function parseSinceVersion(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

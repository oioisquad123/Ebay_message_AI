/**
 * V0 Day 1 Fastify entry point.
 *
 * Single user, single host, single SQLite file. CORS open only to the
 * Vite dev server. The shape of this file (one factory + one bin entry)
 * is what V1 will keep — but V1 wires Clerk, RLS-aware Postgres, pg-boss,
 * Sentry, etc. Don't bolt those onto V0; they have their own slices.
 */
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { pathToFileURL } from "node:url";
import { openDb, type DB } from "./db.js";
import { devDraftRoute } from "./routes/devDraft.js";
import { ingestRoute } from "./routes/ingest.js";
import { ingestListingsRoute } from "./routes/ingestListings.js";
import { messagesRoute } from "./routes/messages.js";
import { selectorsRoute } from "./routes/selectors.js";
import type { GenerateDraftOptions } from "./llm.js";

export interface BuildServerOptions {
  /** Pre-opened DB (tests). When omitted, opens via env / default path. */
  db?: DB;
  /** Toggle Fastify's built-in logger; tests want it off. */
  logger?: boolean;
  /** Inject a mocked Anthropic-shaped client (tests). */
  llmOptions?: GenerateDraftOptions;
}

/** Build a Fastify instance. Exported for tests; do not call .listen() here. */
export async function buildServer(
  opts: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const db = opts.db ?? openDb();
  const fastify = Fastify({
    logger: opts.logger ?? false,
  });

  await fastify.register(cors, {
    origin: ["http://localhost:5173"],
    credentials: false,
  });

  fastify.get("/api/v1/health", async () => ({ ok: true }));

  await fastify.register(devDraftRoute, {
    db,
    ...(opts.llmOptions ? { llmOptions: opts.llmOptions } : {}),
  });
  await fastify.register(ingestRoute, { db });
  await fastify.register(ingestListingsRoute, { db });
  await fastify.register(messagesRoute, {
    db,
    ...(opts.llmOptions ? { llmOptions: opts.llmOptions } : {}),
  });
  await fastify.register(selectorsRoute);

  return fastify;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const server = await buildServer({ logger: true });
  try {
    await server.listen({ port, host: "127.0.0.1" });
    server.log.info(`@app/api listening on http://127.0.0.1:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Run only when invoked directly (not when imported by tests / tooling).
// `tsx` and Node both set argv[1] to the script path; compare as file URLs.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main();
}

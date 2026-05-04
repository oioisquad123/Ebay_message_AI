/**
 * Idempotency helpers backed by the `idempotency_keys` table.
 *
 * Per CLAUDE.md constraint #6, every POST in V1 is idempotent. V0 keeps
 * the contract for the only POST that needs it (ingest). The route module
 * uses these helpers directly rather than wrapping them in a Fastify
 * plugin, because we want full control over what gets cached, what
 * "request hash" means per route, and when the persist call happens
 * (specifically: inside the same transaction as the actual write).
 *
 * The replay semantics:
 *   - lookupIdempotent(userId, key) returns the cached response when the
 *     submitted request_hash matches the stored hash → safe replay.
 *   - When (user, key) was seen but the request_hash differs, that's a
 *     bad client reusing a key for a different request. We surface that
 *     by throwing IdempotencyConflictError; the route handler maps it to
 *     409.
 */
import { createHash, randomUUID } from "node:crypto";
import type { DB } from "./db.js";

export interface IdempotencyHit {
  status: number;
  body: unknown;
}

export interface IdempotencyOpts {
  db: DB;
  userId: string;
  key: string;
  requestHash: string;
}

/**
 * Thrown when a (user_id, key) row exists but the supplied request_hash
 * doesn't match what was stored. This is the "bad client" case: a different
 * request body was sent under a previously-used key.
 */
export class IdempotencyConflictError extends Error {
  constructor(
    public readonly userId: string,
    public readonly key: string,
  ) {
    super(`idempotency key reuse for user=${userId} key=${key}`);
    this.name = "IdempotencyConflictError";
  }
}

interface IdempotencyRow {
  request_hash: string;
  response_status: number;
  response_json: string;
}

/**
 * Returns the cached response if (userId, key) was seen before AND the
 * supplied request_hash matches. Returns null when nothing is stored.
 * Throws IdempotencyConflictError when the key was used previously with a
 * different request_hash.
 */
export function lookupIdempotent(
  opts: IdempotencyOpts,
): IdempotencyHit | null {
  const row = opts.db
    .prepare<[string, string]>(
      `SELECT request_hash, response_status, response_json
         FROM idempotency_keys
        WHERE user_id = ? AND key = ?`,
    )
    .get(opts.userId, opts.key) as IdempotencyRow | undefined;

  if (!row) return null;

  if (row.request_hash !== opts.requestHash) {
    throw new IdempotencyConflictError(opts.userId, opts.key);
  }

  return {
    status: row.response_status,
    body: JSON.parse(row.response_json) as unknown,
  };
}

/**
 * Persist (userId, key, request_hash, status, body). Should be called
 * within the same transaction as the actual write. Returns nothing.
 *
 * This uses INSERT (not INSERT OR REPLACE): if a row already exists for
 * (userId, key) the caller should have caught it with `lookupIdempotent`
 * first. The UNIQUE(user_id, key) constraint will throw otherwise — which
 * is the correct safety behavior: never silently overwrite a previous
 * response.
 */
export function recordIdempotent(
  opts: IdempotencyOpts & { status: number; body: unknown },
): void {
  opts.db
    .prepare(
      `INSERT INTO idempotency_keys (
         id, user_id, key, request_hash, response_status, response_json
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      opts.userId,
      opts.key,
      opts.requestHash,
      opts.status,
      JSON.stringify(opts.body),
    );
}

/**
 * SHA-256 of canonical JSON, first 32 hex chars (128 bits — plenty for
 * accidental-collision avoidance, much shorter than a full hash for the
 * column). Canonical = recursively sorted object keys so `{a:1,b:2}` and
 * `{b:2,a:1}` hash identically.
 */
export function hashRequest(body: unknown): string {
  const canonical = canonicalJsonStringify(body);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    // JSON.stringify maps NaN/Infinity to null; mirror that for parity.
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`)
      .join(",")}}`;
  }
  // undefined / functions / symbols: same as JSON.stringify on a plain
  // object — they'd be omitted. Inside an array they become null.
  return "null";
}

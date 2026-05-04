/**
 * better-sqlite3 connection + schema bootstrap for V0.
 *
 * V1 swaps this whole module out for Postgres + Prisma + RLS (CLAUDE.md
 * constraint #4). Until then: a single SQLite file, schema applied on every
 * open, no migrations machinery.
 */
import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type DB = Database.Database;

const SCHEMA_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "schema.sql",
);

function loadSchemaSql(): string {
  return readFileSync(SCHEMA_PATH, "utf8");
}

/** Open a SQLite database and apply the V0 schema. */
export function openDb(path?: string): DB {
  const dbPath = path ?? process.env.SQLITE_PATH ?? "./data/v0.db";

  if (dbPath !== ":memory:") {
    // Ensure parent directory exists for file-backed DBs.
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  }

  const db = new Database(dbPath);
  // WAL is friendlier for concurrent reads while a request is mid-write.
  // Skip on :memory: where journal modes are no-ops.
  if (dbPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");

  db.exec(loadSchemaSql());

  return db;
}

/** Close hook for tests. */
export function closeDb(db: DB): void {
  db.close();
}

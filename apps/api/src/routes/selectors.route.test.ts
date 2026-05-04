import { describe, expect, it } from "vitest";
import { SelectorConfigSchema } from "@app/shared";
import { buildServer } from "../server.js";
import { closeDb, openDb } from "../db.js";
import { DEFAULT_SELECTOR_CONFIG } from "../selectors/default.js";

describe("GET /api/v1/extension/selectors", () => {
  it("returns 200 with a SelectorConfig-shaped body", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/extension/selectors",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("max-age=60");

    // Validate the body parses against the canonical Zod schema — that's the
    // contract any extension consumer trusts.
    const parsed = SelectorConfigSchema.parse(res.json());
    expect(parsed.version).toBe(DEFAULT_SELECTOR_CONFIG.version);
    expect(parsed.page_match.length).toBeGreaterThan(0);
    expect(parsed.selectors.message_thread_row.primary).toContain(
      "data-testid",
    );

    await app.close();
    closeDb(db);
  });

  it("returns 304 with empty body when ?since_version >= current", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/extension/selectors?since_version=${DEFAULT_SELECTOR_CONFIG.version}`,
    });

    expect(res.statusCode).toBe(304);
    expect(res.body).toBe("");
    expect(res.headers["cache-control"]).toBe("max-age=60");

    await app.close();
    closeDb(db);
  });

  it("returns 200 with body when ?since_version < current", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    // Day 3 bumped current to 2; v1 clients still need a refresh.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/extension/selectors?since_version=1",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(DEFAULT_SELECTOR_CONFIG.version);
    expect(SelectorConfigSchema.safeParse(body).success).toBe(true);

    await app.close();
    closeDb(db);
  });

  it("returns 304 when ?since_version=2 (matches current)", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/extension/selectors?since_version=2",
    });

    expect(res.statusCode).toBe(304);
    expect(res.body).toBe("");

    await app.close();
    closeDb(db);
  });

  it("ignores invalid ?since_version (returns full config)", async () => {
    const db = openDb(":memory:");
    const app = await buildServer({ db });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/extension/selectors?since_version=notanumber",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(DEFAULT_SELECTOR_CONFIG.version);

    await app.close();
    closeDb(db);
  });
});

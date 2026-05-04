import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IngestListingBatch,
  IngestListingResponse,
  IngestMessageBatch,
  IngestResponse,
  SelectorConfig,
} from "@app/shared/contracts";
import { createApiClient } from "./api.js";

const VALID_SELECTORS: SelectorConfig = {
  version: 1,
  page_match: ["https://www.ebay.com/mesg/*"],
  selectors: {
    message_list_container: { primary: ".m-list", fallbacks: [] },
    message_thread_row: { primary: ".m-row", fallbacks: [] },
    message_body: { primary: ".m-body", fallbacks: [] },
    buyer_username: { primary: ".m-buyer", fallbacks: [] },
  },
  debug_notes: {},
};

const VALID_INGEST_RESPONSE: IngestResponse = {
  inserted: 2,
  deduped: 1,
  skipped: 0,
  results: [],
  idempotency_key: "test-key",
  replayed: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// vi.spyOn against globalThis.fetch — looser typing because TS's
// `typeof globalThis` doesn't expose `fetch` as a keyof literal.
type FetchSpy = ReturnType<typeof vi.fn<typeof fetch>>;
let fetchSpy: FetchSpy;

beforeEach(() => {
  fetchSpy = vi.fn() as unknown as FetchSpy;
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("createApiClient.getSelectors", () => {
  it("hits the correct URL and parses the response", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(VALID_SELECTORS));
    const api = createApiClient("http://localhost:3000");
    const cfg = await api.getSelectors();
    expect(cfg.version).toBe(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/v1/extension/selectors");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("strips a trailing slash from baseUrl", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(VALID_SELECTORS));
    const api = createApiClient("http://localhost:3000/");
    await api.getSelectors();
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/v1/extension/selectors");
  });

  it("throws on non-200 responses", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Server error", { status: 500 }),
    );
    const api = createApiClient("http://localhost:3000");
    await expect(api.getSelectors()).rejects.toThrow(/getSelectors failed: 500/);
  });

  it("throws on schema-invalid responses", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ totally: "wrong" }));
    const api = createApiClient("http://localhost:3000");
    await expect(api.getSelectors()).rejects.toThrow();
  });
});

describe("createApiClient.ingestMessages", () => {
  const batch: IngestMessageBatch = {
    protocol_version: 1,
    captured_at: "2026-05-03T12:00:00.000Z",
    selector_config_version: 1,
    messages: [
      {
        userId: "u-bayu",
        buyerUsername: "test_buyer",
        body: "hello",
      },
    ],
  };

  it("POSTs JSON with the Idempotency-Key header set", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(VALID_INGEST_RESPONSE));
    const api = createApiClient("http://localhost:3000");
    const resp = await api.ingestMessages(batch, "abc-123");
    expect(resp.inserted).toBe(2);
    expect(resp.deduped).toBe(1);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/v1/ingest/messages");
    const i = init as RequestInit;
    expect(i.method).toBe("POST");
    const headers = i.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("abc-123");
    expect(headers["Content-Type"]).toBe("application/json");
    // Body is the serialized batch
    expect(JSON.parse(i.body as string)).toMatchObject({
      protocol_version: 1,
      messages: [{ userId: "u-bayu" }],
    });
  });

  it("throws on non-200 responses", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    const api = createApiClient("http://localhost:3000");
    await expect(api.ingestMessages(batch, "k")).rejects.toThrow(
      /ingestMessages failed: 400/,
    );
  });

  it("throws on schema-invalid responses", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ inserted: "two" }));
    const api = createApiClient("http://localhost:3000");
    await expect(api.ingestMessages(batch, "k")).rejects.toThrow();
  });

  it("accepts a response with replayed=true (idempotent replay)", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ ...VALID_INGEST_RESPONSE, replayed: true }),
    );
    const api = createApiClient("http://localhost:3000");
    const resp = await api.ingestMessages(batch, "abc-123");
    expect(resp.replayed).toBe(true);
  });
});

describe("createApiClient.ingestListings", () => {
  const VALID_LISTING_RESPONSE: IngestListingResponse = {
    inserted: 1,
    updated: 0,
    skipped: 0,
    results: [
      {
        ebay_item_id: "234567890123",
        status: "inserted",
        listing_id: "lst-abc",
      },
    ],
    idempotency_key: "list-key",
    replayed: false,
  };

  const batch: IngestListingBatch = {
    protocol_version: 1,
    captured_at: "2026-05-03T12:00:00.000Z",
    selector_config_version: 1,
    listings: [
      {
        userId: "u-bayu",
        sourceUrl: "https://www.ebay.com/itm/234567890123",
        listingKb: {
          ebay_item_id: "234567890123",
          title: "Test listing",
        },
      },
    ],
  };

  it("POSTs JSON with the Idempotency-Key header set", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(VALID_LISTING_RESPONSE));
    const api = createApiClient("http://localhost:3000");
    const resp = await api.ingestListings(batch, "list-key-1");
    expect(resp.inserted).toBe(1);
    expect(resp.results[0]?.status).toBe("inserted");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/v1/ingest/listings");
    const i = init as RequestInit;
    expect(i.method).toBe("POST");
    const headers = i.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("list-key-1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(i.body as string)).toMatchObject({
      protocol_version: 1,
      listings: [{ userId: "u-bayu", listingKb: { ebay_item_id: "234567890123" } }],
    });
  });

  it("throws on non-200 responses", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const api = createApiClient("http://localhost:3000");
    await expect(api.ingestListings(batch, "k")).rejects.toThrow(
      /ingestListings failed: 500/,
    );
  });

  it("throws on schema-invalid responses", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ inserted: "one" }));
    const api = createApiClient("http://localhost:3000");
    await expect(api.ingestListings(batch, "k")).rejects.toThrow();
  });
});

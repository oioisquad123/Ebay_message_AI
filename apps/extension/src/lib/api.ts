import {
  IngestListingResponseSchema,
  IngestResponseSchema,
  SelectorConfigSchema,
  type IngestListingBatch,
  type IngestListingResponse,
  type IngestMessageBatch,
  type IngestResponse,
  type SelectorConfig,
} from "@app/shared/contracts";

export interface ApiClient {
  baseUrl: string;
  getSelectors(): Promise<SelectorConfig>;
  ingestMessages(
    batch: IngestMessageBatch,
    idempotencyKey: string,
  ): Promise<IngestResponse>;
  ingestListings(
    batch: IngestListingBatch,
    idempotencyKey: string,
  ): Promise<IngestListingResponse>;
}

export const DEFAULT_API_BASE_URL = "http://localhost:3000";

export function createApiClient(baseUrl: string = DEFAULT_API_BASE_URL): ApiClient {
  // Trim trailing slash so we can append paths cleanly.
  const root = baseUrl.replace(/\/+$/, "");

  return {
    baseUrl: root,

    async getSelectors(): Promise<SelectorConfig> {
      const res = await fetch(`${root}/api/v1/extension/selectors`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await safeText(res);
        throw new Error(
          `getSelectors failed: ${res.status} ${res.statusText} — ${text}`,
        );
      }
      const json: unknown = await res.json();
      return SelectorConfigSchema.parse(json);
    },

    async ingestMessages(
      batch: IngestMessageBatch,
      idempotencyKey: string,
    ): Promise<IngestResponse> {
      const res = await fetch(`${root}/api/v1/ingest/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const text = await safeText(res);
        throw new Error(
          `ingestMessages failed: ${res.status} ${res.statusText} — ${text}`,
        );
      }
      const json: unknown = await res.json();
      return IngestResponseSchema.parse(json);
    },

    async ingestListings(
      batch: IngestListingBatch,
      idempotencyKey: string,
    ): Promise<IngestListingResponse> {
      const res = await fetch(`${root}/api/v1/ingest/listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const text = await safeText(res);
        throw new Error(
          `ingestListings failed: ${res.status} ${res.statusText} — ${text}`,
        );
      }
      const json: unknown = await res.json();
      return IngestListingResponseSchema.parse(json);
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}

/**
 * Read the configured API base URL from chrome.storage.local, falling back
 * to DEFAULT_API_BASE_URL. Safe to call from any extension context that has
 * `storage` permission.
 */
export async function readApiBaseUrl(): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return DEFAULT_API_BASE_URL;
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiBaseUrl"], (items) => {
      const v = items?.apiBaseUrl;
      resolve(typeof v === "string" && v.length > 0 ? v : DEFAULT_API_BASE_URL);
    });
  });
}

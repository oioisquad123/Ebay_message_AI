import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BrandVoicePresetEnum,
  DraftRequestSchema,
  DraftResponseSchema,
  ListingKbSchema,
  type BrandVoicePreset,
  type DraftRequest,
  type DraftResponse,
} from "@app/shared/contracts";

const BRAND_VOICES = BrandVoicePresetEnum.options;
const DRAFT_URL = "/api/v1/dev/draft";
const DEFAULT_USER_ID = "dev-user";

type ApiError = {
  status: number;
  message: string;
  /** Zod-style issues from a 422 response. */
  issues?: Array<{ path: (string | number)[]; message: string }>;
};

async function postDraft(req: DraftRequest): Promise<DraftResponse> {
  const res = await fetch(DRAFT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response.
  }

  if (!res.ok) {
    const body = (json ?? {}) as Record<string, unknown>;
    const err: ApiError = {
      status: res.status,
      message:
        (typeof body.message === "string" && body.message) ||
        (typeof body.error === "string" && body.error) ||
        `Request failed with status ${res.status}`,
      issues: Array.isArray(body.issues)
        ? (body.issues as ApiError["issues"])
        : undefined,
    };
    throw err;
  }

  const parsed = DraftResponseSchema.safeParse(json);
  if (!parsed.success) {
    const err: ApiError = {
      status: 200,
      message: "Server response did not match DraftResponse schema",
      issues: parsed.error.issues.map((i) => ({
        path: i.path as (string | number)[],
        message: i.message,
      })),
    };
    throw err;
  }
  return parsed.data;
}

export function DevDraftPage() {
  const [body, setBody] = useState("");
  const [listingJson, setListingJson] = useState("");
  const [brandVoice, setBrandVoice] =
    useState<BrandVoicePreset>("friendly");
  const [buyerUsername, setBuyerUsername] = useState("buyer123");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation<DraftResponse, ApiError, DraftRequest>({
    mutationFn: postDraft,
  });

  const canSubmit = body.trim().length > 0 && !mutation.isPending;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    let listingKb: DraftRequest["listingKb"];
    const trimmed = listingJson.trim();
    if (trimmed.length > 0) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(trimmed);
      } catch (err) {
        setLocalError(
          `Listing JSON is not valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
      const result = ListingKbSchema.safeParse(parsedJson);
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        setLocalError(`Listing JSON failed schema validation: ${issues}`);
        return;
      }
      listingKb = result.data;
    }

    const reqCandidate: DraftRequest = {
      message: {
        userId: DEFAULT_USER_ID,
        buyerUsername: buyerUsername.trim() || "buyer123",
        body,
      },
      ...(listingKb ? { listingKb } : {}),
      brandVoice,
    };

    const reqParsed = DraftRequestSchema.safeParse(reqCandidate);
    if (!reqParsed.success) {
      const issues = reqParsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      setLocalError(`Request failed local validation: ${issues}`);
      return;
    }

    mutation.mutate(reqParsed.data);
  };

  const result = mutation.data;
  const apiErr = mutation.error;

  return (
    <div className="text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-semibold">
            eBay AI Message Assistant — V0 Dev
          </h1>
          <p className="text-sm text-gray-500">
            Paste a buyer message + listing JSON, generate a grounded draft.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* FORM */}
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="body"
                  className="block text-sm font-medium text-gray-700"
                >
                  Buyer message body
                  <span className="text-red-600"> *</span>
                </label>
                <textarea
                  id="body"
                  name="body"
                  rows={6}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi, will this fit a 32 inch waist?"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="listingJson"
                  className="block text-sm font-medium text-gray-700"
                >
                  Listing JSON{" "}
                  <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <textarea
                  id="listingJson"
                  name="listingJson"
                  rows={12}
                  value={listingJson}
                  onChange={(e) => setListingJson(e.target.value)}
                  placeholder={SAMPLE_LISTING_HINT}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Must match{" "}
                  <code className="rounded bg-gray-100 px-1">ListingKbSchema</code>{" "}
                  (see{" "}
                  <a
                    className="text-blue-600 underline"
                    href="https://github.com/your-org/Ebay_message_AI/blob/main/packages/shared/src/contracts/listingKb.ts"
                    target="_blank"
                    rel="noreferrer"
                  >
                    contract
                  </a>
                  ). Try the{" "}
                  <button
                    type="button"
                    onClick={() => setListingJson(SAMPLE_LISTING_JSON)}
                    className="text-blue-600 underline"
                  >
                    sample fixture
                  </button>
                  .
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="brandVoice"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Brand voice
                  </label>
                  <select
                    id="brandVoice"
                    name="brandVoice"
                    value={brandVoice}
                    onChange={(e) =>
                      setBrandVoice(e.target.value as BrandVoicePreset)
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    {BRAND_VOICES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="buyerUsername"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Buyer username
                  </label>
                  <input
                    id="buyerUsername"
                    name="buyerUsername"
                    type="text"
                    value={buyerUsername}
                    onChange={(e) => setBuyerUsername(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {mutation.isPending ? "Generating…" : "Generate draft"}
              </button>

              {localError && (
                <div
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  <strong className="font-medium">Validation:</strong>{" "}
                  {localError}
                </div>
              )}
            </form>
          </section>

          {/* RESULT */}
          <section className="space-y-4">
            {apiErr && <ErrorPanel err={apiErr} />}
            {result && <ResultPanel result={result} />}
            {!apiErr && !result && (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                Submit the form to see a draft here.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ResultPanel({ result }: { result: DraftResponse }) {
  const confidencePct = useMemo(
    () => `${(result.confidence * 100).toFixed(0)}%`,
    [result.confidence],
  );
  const costStr = useMemo(
    () => `${result.cost_cents.toFixed(2)}¢`,
    [result.cost_cents],
  );

  return (
    <div
      data-testid="result-panel"
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Draft
      </h2>
      <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
        {result.draft || (
          <span className="italic text-gray-400">(empty draft)</span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <Stat label="Category" value={result.category} />
        <Stat label="Confidence" value={confidencePct} />
        <Stat label="Cost" value={costStr} />
        <Stat label="Model" value={result.model} />
        <Stat
          label="Tokens (in/out)"
          value={`${result.tokens_in}/${result.tokens_out}`}
        />
        <Stat
          label="Generated"
          value={new Date(result.generated_at).toLocaleTimeString()}
        />
      </dl>

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Used facts
        </h3>
        {result.used_facts.length === 0 ? (
          <span className="text-xs italic text-gray-400">none</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {result.used_facts.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {result.flags.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Flags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {result.flags.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
        <summary className="cursor-pointer font-medium text-gray-700">
          Raw JSON
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-gray-600">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function ErrorPanel({ err }: { err: ApiError }) {
  const isValidation = err.status === 422;
  return (
    <div
      role="alert"
      data-testid="error-panel"
      className="rounded-lg border border-red-300 bg-red-50 p-5 text-sm shadow-sm"
    >
      <h2 className="mb-2 text-sm font-semibold text-red-800">
        {isValidation ? "Validation error (422)" : `Error (${err.status})`}
      </h2>
      <p className="text-red-900">{err.message}</p>
      {err.issues && err.issues.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-red-800">
          {err.issues.map((iss, idx) => (
            <li key={idx}>
              <code className="font-mono">
                {iss.path.length > 0 ? iss.path.join(".") : "(root)"}
              </code>
              : {iss.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SAMPLE_LISTING_HINT = `{
  "ebay_item_id": "1234567890",
  "title": "Levi's 501 Denim Jeans, 32x32",
  "condition": "Pre-owned — Excellent",
  ...
}`;

const SAMPLE_LISTING_JSON = JSON.stringify(
  {
    ebay_item_id: "1234567890",
    title: "Levi's 501 Denim Jeans, 32x32, Dark Wash",
    condition: "Pre-owned — Excellent",
    brand: "Levi's",
    size: "32x32",
    color: "dark wash blue",
    materials: ["100% cotton"],
    measurements: {
      waist_in: 32,
      inseam_in: 32,
      rise_in: 11,
    },
    shipping: {
      domestic_days: "2-3",
      intl_available: false,
      free_threshold: "orders over $50",
    },
    returns: {
      accepted: true,
      window_days: 30,
      who_pays: "buyer",
    },
    flaws_noted: ["minor fading on back pockets"],
  },
  null,
  2,
);

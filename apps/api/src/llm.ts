/**
 * LLM wrapper for V0 drafting.
 *
 * V0 routes through OpenRouter via the OpenAI-compatible Chat Completions
 * API. Default model is `anthropic/claude-haiku-4-5` — preserves PRD §14.3
 * Claude family + brand-voice fidelity at ~0.5¢/draft for V0 paste-and-test.
 *
 * Override the model with the OPENROUTER_MODEL env var. Suggested cheap
 * alternatives (see EXECUTION_PLAN if cost ever bites in V0):
 *   anthropic/claude-haiku-4-5            (default, PRD-aligned, ~0.5¢/draft)
 *   anthropic/claude-3-5-haiku            (slightly older Claude Haiku, similar price)
 *   google/gemini-2.5-flash               (~10x cheaper, different brand voice)
 *   mistralai/mistral-small-24b-instruct  (~25x cheaper, capable)
 *
 * NOTE: V0 deliberately does NOT wire Anthropic prompt-caching cache_control
 * blocks because OpenRouter's pass-through of cache_control is provider-
 * specific and adds complexity not worth it for one user. The prompts
 * package still produces cacheable blocks; we concatenate them into the
 * system message so the structure survives V0→V1 graduation when V1 swaps
 * back to direct Anthropic with full cache_control support.
 *
 * Hard rules per CLAUDE.md:
 *   #5  Budget caps wired BEFORE the call. (V0 has no caps yet — V1 gate.)
 *   #10 Audit/llm_calls log from D1. The route persists this; we just
 *       return the numbers needed to populate the row.
 *   #12 PII scrubbing default-on. The route runs scrubPii BEFORE this
 *       module so the model only ever sees scrubbed text.
 *   #13 Prompt-injection defense from D1. Owned by buildDraftPrompt
 *       (delimited untrusted-content tags) and checkOutputPolicy
 *       (forbidden-phrase output filter).
 */
import OpenAI from "openai";
import {
  DraftRequestSchema,
  LlmDraftOutputSchema,
  type DraftFlag,
  type DraftRequest,
  type DraftResponse,
  type LlmDraftOutput,
} from "@app/shared";
import { buildDraftPrompt, checkOutputPolicy } from "@app/prompts";

const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MAX_TOKENS = 800;

/**
 * Cents per million tokens. Model-keyed pricing for the small set V0
 * realistically uses; everything else falls back to Haiku rates so the
 * audit log is at least directionally correct. Update from OpenRouter's
 * `/api/v1/models` whenever you swap defaults — these match prices on
 * 2026-05-03.
 */
const PRICING_CENTS_PER_M: Record<string, { in: number; out: number }> = {
  "anthropic/claude-haiku-4-5": { in: 100, out: 500 },
  "anthropic/claude-3-5-haiku": { in: 100, out: 500 },
  "anthropic/claude-sonnet-4-5": { in: 300, out: 1500 },
  "google/gemini-2.5-flash": { in: 7.5, out: 30 },
  "google/gemini-2.0-flash-001": { in: 10, out: 40 },
  "openai/gpt-4o-mini": { in: 15, out: 60 },
  "mistralai/mistral-small-24b-instruct-2501": { in: 5, out: 8 },
  "mistralai/mistral-nemo": { in: 2, out: 3 },
};

/** Look up pricing by model id, with Haiku family aliasing + safe fallback. */
function pricingFor(model: string): { in: number; out: number } {
  if (model in PRICING_CENTS_PER_M) {
    return PRICING_CENTS_PER_M[model]!;
  }
  // OpenRouter sometimes returns a more-specific id (e.g.
  // anthropic/claude-4.5-haiku-20251001). Match by family substring.
  const lower = model.toLowerCase();
  if (lower.includes("haiku")) return PRICING_CENTS_PER_M["anthropic/claude-haiku-4-5"]!;
  if (lower.includes("sonnet")) return PRICING_CENTS_PER_M["anthropic/claude-sonnet-4-5"]!;
  if (lower.includes("gemini") && lower.includes("flash"))
    return PRICING_CENTS_PER_M["google/gemini-2.5-flash"]!;
  if (lower.includes("gpt-4o-mini")) return PRICING_CENTS_PER_M["openai/gpt-4o-mini"]!;
  // Conservative fallback: assume Haiku rates rather than $0 (so we don't
  // silently underbill our own audit log).
  return PRICING_CENTS_PER_M["anthropic/claude-haiku-4-5"]!;
}

export function computeCostCents(
  model: string,
  tokensIn: number,
  tokensOut: number,
  /**
   * Optional override — when OpenRouter returns a `cost` field we trust it
   * over the table. cost is reported by OpenRouter in USD; convert to cents.
   */
  reportedCostUsd?: number,
): number {
  if (typeof reportedCostUsd === "number" && reportedCostUsd >= 0) {
    return Math.round(reportedCostUsd * 100 * 10_000) / 10_000;
  }
  const p = pricingFor(model);
  const cents = (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
  return Math.round(cents * 10_000) / 10_000;
}

/** Empty-draft sentinel returned when the model output is unparseable. */
function emptyDraftResponse(args: {
  model: string;
  tokensIn: number;
  tokensOut: number;
  reportedCostUsd?: number;
  extraFlags?: DraftFlag[];
}): DraftResponse {
  const flags: DraftFlag[] = ["model_error", "empty_draft"];
  if (args.extraFlags) flags.push(...args.extraFlags);
  return {
    draft: "",
    confidence: 0,
    category: "other_unclear",
    used_facts: [],
    flags,
    model: args.model,
    tokens_in: args.tokensIn,
    tokens_out: args.tokensOut,
    cache_read_tokens: 0,
    cost_cents: computeCostCents(
      args.model,
      args.tokensIn,
      args.tokensOut,
      args.reportedCostUsd,
    ),
    generated_at: new Date().toISOString(),
  };
}

/** Best-effort JSON extraction — handles fenced blocks and surrounding prose. */
function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences if present.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced && fenced[1] ? fenced[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fallback: grab the first balanced {...} run.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Minimal shape of OpenAI-SDK chat completion response that we depend on.
 * Lets tests pass a duck-typed mock without instantiating the real SDK.
 */
export interface OpenAILike {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        max_tokens: number;
        response_format?: { type: "json_object" };
      }) => Promise<{
        id?: string;
        model?: string;
        choices: Array<{
          message?: { content?: string | null };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          /** OpenRouter extension: cost in USD. */
          cost?: number;
        };
      }>;
    };
  };
}

export interface GenerateDraftOptions {
  client?: OpenAILike;
  modelOverride?: string;
}

/**
 * Build a real OpenAI client pointed at OpenRouter. Throws at call time
 * (not at module load — tests must be able to import without a key).
 */
function buildOpenRouterClient(): OpenAILike {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is required to generate drafts. Set it in env or pass opts.client.",
    );
  }
  // Optional self-identifying headers per OpenRouter docs — they show up
  // on your usage dashboard and surface us in OpenRouter's app rankings.
  const referer = process.env.OPENROUTER_REFERER ?? "https://github.com/bayuhidayat/ebay-msg-ai";
  const title = process.env.OPENROUTER_TITLE ?? "eBay AI Message Assistant V0";
  return new OpenAI({
    apiKey: key,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": referer,
      "X-Title": title,
    },
  }) as unknown as OpenAILike;
}

/**
 * Generate a single draft.
 *
 * The function NEVER throws on model misbehavior — instead it returns a
 * DraftResponse with `flags: ["model_error", "empty_draft"]`. The route
 * persists the empty draft + the llm_calls row regardless so we always
 * have telemetry on a failed call.
 *
 * It WILL throw if `OPENROUTER_API_KEY` is missing AT CALL TIME or if the
 * SDK itself raises a transport error.
 */
export async function generateDraft(
  input: DraftRequest,
  opts: GenerateDraftOptions = {},
): Promise<DraftResponse> {
  // Belt-and-braces: route already validated, but a direct caller (eval
  // harness, repl) might not. Cheap.
  const parsed = DraftRequestSchema.parse(input);

  const model =
    opts.modelOverride ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  const client: OpenAILike = opts.client ?? buildOpenRouterClient();

  const prompt = buildDraftPrompt(parsed);

  // V0 concatenates system prompt + cacheable blocks into a single system
  // message. V1 (direct Anthropic) will switch back to content-block array
  // with cache_control on each block. The prompts package returns blocks
  // in a stable order so both paths produce identical content.
  const systemContent = [
    prompt.systemPrompt,
    ...prompt.cachedBlocks.map((b) => b.content),
  ].join("\n\n");

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: prompt.userMessage },
    ],
    max_tokens: MAX_TOKENS,
    response_format: { type: "json_object" },
  });

  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const reportedCostUsd = response.usage?.cost;
  const responseModel = response.model || model;

  const rawText = response.choices?.[0]?.message?.content ?? "";

  const parsedJson = tryParseJson(rawText);
  if (parsedJson === null || typeof parsedJson !== "object") {
    return emptyDraftResponse({
      model: responseModel,
      tokensIn,
      tokensOut,
      reportedCostUsd,
    });
  }

  const validated = LlmDraftOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    return emptyDraftResponse({
      model: responseModel,
      tokensIn,
      tokensOut,
      reportedCostUsd,
    });
  }

  const llm: LlmDraftOutput = validated.data;

  // Output policy filter (CLAUDE.md #13). Merge any flags the policy raised
  // with what the model self-reported. De-dupe.
  const policyFlags = checkOutputPolicy(llm.draft);
  const mergedFlags: DraftFlag[] = Array.from(
    new Set<DraftFlag>([...llm.flags, ...policyFlags]),
  );

  // Empty-draft sentinel: even if the model returned valid JSON, an empty
  // draft is a failure mode worth flagging.
  if (llm.draft.trim().length === 0 && !mergedFlags.includes("empty_draft")) {
    mergedFlags.push("empty_draft");
  }

  return {
    draft: llm.draft,
    confidence: llm.confidence,
    category: llm.category,
    used_facts: llm.used_facts,
    flags: mergedFlags,
    model: responseModel,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cache_read_tokens: 0, // V0 OpenRouter path does not surface cache reads.
    cost_cents: computeCostCents(responseModel, tokensIn, tokensOut, reportedCostUsd),
    generated_at: new Date().toISOString(),
  };
}

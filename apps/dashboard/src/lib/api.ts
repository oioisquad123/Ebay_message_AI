/**
 * Dashboard API client.
 *
 * One file = TanStack Query hooks + fetch helpers + Zod runtime validation.
 * Mutations always carry `Idempotency-Key` (PRD §26 hard constraint #6).
 * Errors are thrown with the response body so UI can surface them.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  ApproveDraftResponseSchema,
  MarkSentResponseSchema,
  MessageDetailSchema,
  MessageListResponseSchema,
  RegenerateResponseSchema,
  SkipMessageResponseSchema,
  type ApproveDraftResponse,
  type MarkSentResponse,
  type MessageDetail,
  type MessageListQuery,
  type MessageListResponse,
  type RegenerateResponse,
  type SkipMessageResponse,
} from "@app/shared/contracts";

export type ApiError = {
  status: number;
  message: string;
  body?: unknown;
};

function newIdempotencyKey(): string {
  // crypto.randomUUID is widely available; fallback if jsdom strips it.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Acceptable fallback for tests / very old browsers.
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function throwOnNon2xx(res: Response): Promise<unknown> {
  const body = await readJson(res);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body &&
        typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : null) ?? `Request failed with status ${res.status}`;
    const err: ApiError = { status: res.status, message, body };
    throw err;
  }
  return body;
}

function buildListUrl(query: MessageListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return `/api/v1/messages${qs ? `?${qs}` : ""}`;
}

export const queryKeys = {
  list: (q: MessageListQuery) =>
    ["messages", "list", q] as const,
  detail: (id: string) => ["messages", "detail", id] as const,
};

// ----------------- queries -----------------

export function useMessageList(
  query: MessageListQuery,
): UseQueryResult<MessageListResponse, ApiError> {
  return useQuery<MessageListResponse, ApiError>({
    queryKey: queryKeys.list(query),
    queryFn: async () => {
      const res = await fetch(buildListUrl(query), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const body = await throwOnNon2xx(res);
      const parsed = MessageListResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw {
          status: 200,
          message: `Server response did not match MessageListResponseSchema: ${parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
          body,
        } satisfies ApiError;
      }
      return parsed.data;
    },
  });
}

export function useMessageDetail(
  id: string | undefined,
): UseQueryResult<MessageDetail, ApiError> {
  return useQuery<MessageDetail, ApiError>({
    queryKey: queryKeys.detail(id ?? "__missing__"),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/v1/messages/${id}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const body = await throwOnNon2xx(res);
      const parsed = MessageDetailSchema.safeParse(body);
      if (!parsed.success) {
        throw {
          status: 200,
          message: `Server response did not match MessageDetailSchema: ${parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
          body,
        } satisfies ApiError;
      }
      return parsed.data;
    },
  });
}

// ----------------- mutations -----------------

async function postWithIdempotency(
  url: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Idempotency-Key": newIdempotencyKey(),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return throwOnNon2xx(res);
}

function makeRegenHook(path: "draft" | "regenerate") {
  return function useRegenLikeMutation(): UseMutationResult<
    RegenerateResponse,
    ApiError,
    { messageId: string }
  > {
    const qc = useQueryClient();
    return useMutation<RegenerateResponse, ApiError, { messageId: string }>({
      mutationFn: async ({ messageId }) => {
        const body = await postWithIdempotency(
          `/api/v1/messages/${messageId}/${path}`,
        );
        const parsed = RegenerateResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw {
            status: 200,
            message: `Server response did not match RegenerateResponseSchema`,
            body,
          } satisfies ApiError;
        }
        return parsed.data;
      },
      onSuccess: (_data, vars) => {
        void qc.invalidateQueries({ queryKey: ["messages", "detail", vars.messageId] });
        void qc.invalidateQueries({ queryKey: ["messages", "list"] });
      },
    });
  };
}

export const useGenerateDraft = makeRegenHook("draft");
export const useRegenerateDraft = makeRegenHook("regenerate");

export function useApproveDraft(): UseMutationResult<
  ApproveDraftResponse,
  ApiError,
  { messageId: string; editedText?: string }
> {
  const qc = useQueryClient();
  return useMutation<
    ApproveDraftResponse,
    ApiError,
    { messageId: string; editedText?: string }
  >({
    mutationFn: async ({ messageId, editedText }) => {
      const body = await postWithIdempotency(
        `/api/v1/messages/${messageId}/approve`,
        editedText !== undefined ? { editedText } : {},
      );
      const parsed = ApproveDraftResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw {
          status: 200,
          message: `Server response did not match ApproveDraftResponseSchema`,
          body,
        } satisfies ApiError;
      }
      return parsed.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["messages", "detail", vars.messageId] });
      void qc.invalidateQueries({ queryKey: ["messages", "list"] });
    },
  });
}

export function useSkipMessage(): UseMutationResult<
  SkipMessageResponse,
  ApiError,
  { messageId: string }
> {
  const qc = useQueryClient();
  return useMutation<
    SkipMessageResponse,
    ApiError,
    { messageId: string }
  >({
    mutationFn: async ({ messageId }) => {
      const body = await postWithIdempotency(
        `/api/v1/messages/${messageId}/skip`,
      );
      const parsed = SkipMessageResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw {
          status: 200,
          message: `Server response did not match SkipMessageResponseSchema`,
          body,
        } satisfies ApiError;
      }
      return parsed.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["messages", "detail", vars.messageId] });
      void qc.invalidateQueries({ queryKey: ["messages", "list"] });
    },
  });
}

export function useMarkSent(): UseMutationResult<
  MarkSentResponse,
  ApiError,
  { messageId: string }
> {
  const qc = useQueryClient();
  return useMutation<MarkSentResponse, ApiError, { messageId: string }>({
    mutationFn: async ({ messageId }) => {
      const body = await postWithIdempotency(
        `/api/v1/messages/${messageId}/mark-sent`,
        { send_method: "paste" },
      );
      const parsed = MarkSentResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw {
          status: 200,
          message: `Server response did not match MarkSentResponseSchema`,
          body,
        } satisfies ApiError;
      }
      return parsed.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["messages", "detail", vars.messageId] });
      void qc.invalidateQueries({ queryKey: ["messages", "list"] });
    },
  });
}

// Exposed for tests.
export const __testing = { buildListUrl, newIdempotencyKey };

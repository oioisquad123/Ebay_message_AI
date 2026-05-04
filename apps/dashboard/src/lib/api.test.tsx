import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  ApproveDraftResponse,
  DraftSnapshot,
  MarkSentResponse,
  MessageDetail,
  MessageListResponse,
  RegenerateResponse,
  SkipMessageResponse,
} from "@app/shared/contracts";
import {
  useApproveDraft,
  useGenerateDraft,
  useMarkSent,
  useMessageDetail,
  useMessageList,
  useRegenerateDraft,
  useSkipMessage,
} from "./api.js";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DRAFT_FIXTURE: DraftSnapshot = {
  id: "d1",
  version: 1,
  draft_text: "Hello!",
  edited_text: null,
  category: "generic_greeting",
  confidence: 0.5,
  used_facts: [],
  flags: [],
  model: "anthropic/claude-haiku-4-5",
  status: "drafted",
  generated_at: "2026-05-03T10:00:00.000Z",
  approved_at: null,
  sent_at: null,
  skipped_at: null,
  cost_cents: 0.1,
};

function HookHarness({ run }: { run: () => unknown }) {
  // Calling the hook subscribes us to query/mutation lifecycle.
  run();
  return null;
}

function renderHook<T>(useHook: () => T, client = makeClient()) {
  const captured: { current: T | null } = { current: null };
  function Wrapper() {
    captured.current = useHook();
    return null;
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <Wrapper />
    </QueryClientProvider>,
  );
  return { ...utils, captured };
}

describe("api hooks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  describe("useMessageList", () => {
    it("builds URL with query params and validates with Zod", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({
          data: [],
          next_cursor: null,
          has_more: false,
          total_pending: 5,
        } satisfies MessageListResponse),
      );
      const { captured } = renderHook(() =>
        useMessageList({ limit: 50, status: "drafted", category: "sizing_measurements" }),
      );
      await waitFor(() => {
        expect(captured.current?.isSuccess).toBe(true);
      });
      const url = String(fetchSpy.mock.calls[0]?.[0]);
      expect(url).toContain("status=drafted");
      expect(url).toContain("category=sizing_measurements");
      expect(url).toContain("limit=50");
      expect(captured.current?.data?.total_pending).toBe(5);
    });

    it("throws on non-2xx with response body", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({ message: "boom" }, 500),
      );
      const { captured } = renderHook(() => useMessageList({ limit: 50 }));
      await waitFor(() => {
        expect(captured.current?.isError).toBe(true);
      });
      expect(captured.current?.error?.status).toBe(500);
      expect(captured.current?.error?.message).toBe("boom");
    });

    it("rejects responses that fail Zod validation", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({ data: "not an array" }),
      );
      const { captured } = renderHook(() => useMessageList({ limit: 50 }));
      await waitFor(() => {
        expect(captured.current?.isError).toBe(true);
      });
      expect(captured.current?.error?.message).toMatch(/MessageListResponseSchema/);
    });
  });

  describe("useMessageDetail", () => {
    it("fetches by id and validates Zod", async () => {
      const detail: MessageDetail = {
        message: {
          id: "m1",
          user_id: "u-bayu",
          buyer_username: "alice",
          body: "hi",
          pii_scrubbed_body: "hi",
          ebay_item_id: null,
          ebay_message_id: null,
          thread_id: null,
          category: null,
          received_at: "2026-05-03T10:00:00.000Z",
        },
        listing: null,
        draft: null,
        status: "no_draft",
        buyer_history_count: 0,
      };
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes(detail),
      );
      const { captured } = renderHook(() => useMessageDetail("m1"));
      await waitFor(() => {
        expect(captured.current?.isSuccess).toBe(true);
      });
      expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("/api/v1/messages/m1");
      expect(captured.current?.data?.message.buyer_username).toBe("alice");
    });

    it("is disabled when id is undefined", async () => {
      const fetchSpy = vi.spyOn(global, "fetch");
      renderHook(() => useMessageDetail(undefined));
      // tick a render cycle
      await new Promise((r) => setTimeout(r, 10));
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("mutations", () => {
    it("useGenerateDraft sends Idempotency-Key on POST /draft", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({ ok: true, draft: DRAFT_FIXTURE } satisfies RegenerateResponse),
      );
      const { captured } = renderHook(() => useGenerateDraft());
      captured.current!.mutate({ messageId: "m1" });
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });
      const call = fetchSpy.mock.calls[0]!;
      expect(String(call[0])).toBe("/api/v1/messages/m1/draft");
      const init = call[1] as RequestInit;
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/.+/);
    });

    it("useRegenerateDraft posts to /regenerate", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({ ok: true, draft: DRAFT_FIXTURE } satisfies RegenerateResponse),
      );
      const { captured } = renderHook(() => useRegenerateDraft());
      captured.current!.mutate({ messageId: "m9" });
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });
      expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("/api/v1/messages/m9/regenerate");
    });

    it("useApproveDraft sends editedText when supplied", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({
          ok: true,
          draft: { ...DRAFT_FIXTURE, status: "approved", approved_at: "2026-05-03T10:01:00.000Z" },
          learned_edit_captured: true,
        } satisfies ApproveDraftResponse),
      );
      const { captured } = renderHook(() => useApproveDraft());
      captured.current!.mutate({ messageId: "m1", editedText: "Edited" });
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(String(init.body));
      expect(body.editedText).toBe("Edited");
      const headers = init.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toMatch(/.+/);
    });

    it("useSkipMessage POSTs /skip", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({ ok: true, status: "skipped" } satisfies SkipMessageResponse),
      );
      const { captured } = renderHook(() => useSkipMessage());
      captured.current!.mutate({ messageId: "m3" });
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });
      expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("/api/v1/messages/m3/skip");
    });

    it("useMarkSent sends send_method=paste", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({
          ok: true,
          sent_at: "2026-05-03T10:02:00.000Z",
        } satisfies MarkSentResponse),
      );
      const { captured } = renderHook(() => useMarkSent());
      captured.current!.mutate({ messageId: "m1" });
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(String(init.body));
      expect(body.send_method).toBe("paste");
    });

    it("mutations throw on non-2xx and surface ApiError", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        jsonRes({ message: "rate limited" }, 429),
      );
      const { captured } = renderHook(() => useGenerateDraft());
      captured.current!.mutate({ messageId: "m1" });
      await waitFor(() => {
        expect(captured.current?.isError).toBe(true);
      });
      expect(captured.current?.error?.status).toBe(429);
      expect(captured.current?.error?.message).toBe("rate limited");
    });
  });
});

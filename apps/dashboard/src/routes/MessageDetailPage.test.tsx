import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type {
  ApproveDraftResponse,
  DraftSnapshot,
  MarkSentResponse,
  MessageDetail,
  RegenerateResponse,
  SkipMessageResponse,
} from "@app/shared/contracts";
import { MessageDetailPage } from "./MessageDetailPage.js";

const SAMPLE_DRAFT: DraftSnapshot = {
  id: "d1",
  version: 1,
  draft_text: "Hi! Yes, the waist measures 32 inches. Thanks!",
  edited_text: null,
  category: "sizing_measurements",
  confidence: 0.87,
  used_facts: ["measurements.waist_in"],
  flags: [],
  model: "anthropic/claude-haiku-4-5",
  status: "drafted",
  generated_at: "2026-05-03T10:00:00.000Z",
  approved_at: null,
  sent_at: null,
  skipped_at: null,
  cost_cents: 0.18,
};

function makeDetail(over: Partial<MessageDetail> = {}): MessageDetail {
  return {
    message: {
      id: "m1",
      user_id: "u-bayu",
      buyer_username: "alice",
      body: "Will this fit a 32 waist?",
      pii_scrubbed_body: "Will this fit a 32 waist?",
      ebay_item_id: "1234567890",
      ebay_message_id: null,
      thread_id: null,
      category: "sizing_measurements",
      received_at: "2026-05-03T10:00:00.000Z",
    },
    listing: {
      ebay_item_id: "1234567890",
      title: "Levi's 501 32x32",
      kb_json: { size: "32x32", condition: "Pre-owned" },
    },
    draft: SAMPLE_DRAFT,
    status: "drafted",
    buyer_history_count: 0,
    ...over,
  };
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function setupFetch(handler: FetchHandler) {
  return vi.spyOn(global, "fetch").mockImplementation(((
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init));
  }) as typeof fetch);
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDetail(id = "m1") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const { hook } = memoryLocation({ path: `/messages/${id}` });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <MessageDetailPage id={id} />
      </Router>
    </QueryClientProvider>,
  );
}

describe("MessageDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("with no draft → shows Generate button; clicking calls /draft with Idempotency-Key", async () => {
    const fetchSpy = setupFetch((url, init) => {
      if (url === "/api/v1/messages/m1" && (!init || init.method !== "POST")) {
        return jsonRes(makeDetail({ draft: null, status: "no_draft" }));
      }
      if (url === "/api/v1/messages/m1/draft" && init?.method === "POST") {
        const body: RegenerateResponse = { ok: true, draft: SAMPLE_DRAFT };
        return jsonRes(body);
      }
      return new Response("not found", { status: 404 });
    });
    renderDetail();

    const btn = await screen.findByTestId("generate-draft");
    fireEvent.click(btn);

    await waitFor(() => {
      const draftCall = fetchSpy.mock.calls.find(
        (c) => String(c[0]) === "/api/v1/messages/m1/draft",
      );
      expect(draftCall).toBeDefined();
      const init = draftCall?.[1] as RequestInit;
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toMatch(/.+/);
    });
  });

  it("with draft → renders textarea with draft text", async () => {
    setupFetch(() => jsonRes(makeDetail()));
    renderDetail();
    const ta = (await screen.findByTestId("draft-textarea")) as HTMLTextAreaElement;
    expect(ta.value).toBe(SAMPLE_DRAFT.draft_text);
  });

  it("approve sends empty body when text unchanged, with Idempotency-Key", async () => {
    const fetchSpy = setupFetch((url, init) => {
      if (url === "/api/v1/messages/m1" && (!init || init.method !== "POST")) {
        return jsonRes(makeDetail());
      }
      if (url === "/api/v1/messages/m1/approve") {
        const body: ApproveDraftResponse = {
          ok: true,
          draft: { ...SAMPLE_DRAFT, status: "approved", approved_at: "2026-05-03T10:01:00.000Z" },
          learned_edit_captured: false,
        };
        return jsonRes(body);
      }
      return new Response("not found", { status: 404 });
    });
    renderDetail();

    const btn = await screen.findByTestId("approve");
    fireEvent.click(btn);

    await waitFor(() => {
      const c = fetchSpy.mock.calls.find(
        (c) => String(c[0]) === "/api/v1/messages/m1/approve",
      );
      expect(c).toBeDefined();
      const init = c?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toMatch(/.+/);
      const body = JSON.parse(String(init.body ?? "{}"));
      expect(body.editedText).toBeUndefined();
    });
  });

  it("edit-and-approve sends editedText", async () => {
    const fetchSpy = setupFetch((url) => {
      if (url === "/api/v1/messages/m1") return jsonRes(makeDetail());
      if (url === "/api/v1/messages/m1/approve") {
        const body: ApproveDraftResponse = {
          ok: true,
          draft: { ...SAMPLE_DRAFT, status: "approved", edited_text: "Edited!", approved_at: "2026-05-03T10:01:00.000Z" },
          learned_edit_captured: true,
        };
        return jsonRes(body);
      }
      return new Response("not found", { status: 404 });
    });
    renderDetail();

    const ta = (await screen.findByTestId("draft-textarea")) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "I edited this draft." } });

    fireEvent.click(screen.getByTestId("approve"));

    await waitFor(() => {
      const c = fetchSpy.mock.calls.find(
        (c) => String(c[0]) === "/api/v1/messages/m1/approve",
      );
      expect(c).toBeDefined();
      const body = JSON.parse(String((c?.[1] as RequestInit).body ?? "{}"));
      expect(body.editedText).toBe("I edited this draft.");
    });
  });

  it("regenerate calls /regenerate", async () => {
    const fetchSpy = setupFetch((url) => {
      if (url === "/api/v1/messages/m1") return jsonRes(makeDetail());
      if (url === "/api/v1/messages/m1/regenerate") {
        const body: RegenerateResponse = {
          ok: true,
          draft: { ...SAMPLE_DRAFT, version: 2, draft_text: "Regenerated text" },
        };
        return jsonRes(body);
      }
      return new Response("not found", { status: 404 });
    });
    renderDetail();

    fireEvent.click(await screen.findByTestId("regenerate"));

    await waitFor(() => {
      const c = fetchSpy.mock.calls.find(
        (c) => String(c[0]) === "/api/v1/messages/m1/regenerate",
      );
      expect(c).toBeDefined();
      expect((c?.[1] as RequestInit).method).toBe("POST");
    });
  });

  it("skip calls /skip after confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = setupFetch((url) => {
      if (url === "/api/v1/messages/m1") return jsonRes(makeDetail());
      if (url === "/api/v1/messages/m1/skip") {
        const body: SkipMessageResponse = { ok: true, status: "skipped" };
        return jsonRes(body);
      }
      return new Response("not found", { status: 404 });
    });
    renderDetail();

    fireEvent.click(await screen.findByTestId("skip"));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      const c = fetchSpy.mock.calls.find(
        (c) => String(c[0]) === "/api/v1/messages/m1/skip",
      );
      expect(c).toBeDefined();
    });
  });

  it("approve-and-send copies to clipboard, opens eBay, calls mark-sent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    const fetchSpy = setupFetch((url) => {
      if (url === "/api/v1/messages/m1") return jsonRes(makeDetail());
      if (url === "/api/v1/messages/m1/approve") {
        const body: ApproveDraftResponse = {
          ok: true,
          draft: { ...SAMPLE_DRAFT, status: "approved", approved_at: "2026-05-03T10:01:00.000Z" },
          learned_edit_captured: false,
        };
        return jsonRes(body);
      }
      if (url === "/api/v1/messages/m1/mark-sent") {
        const body: MarkSentResponse = {
          ok: true,
          sent_at: "2026-05-03T10:02:00.000Z",
        };
        return jsonRes(body);
      }
      return new Response("not found", { status: 404 });
    });
    renderDetail();

    fireEvent.click(await screen.findByTestId("approve-and-send"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(SAMPLE_DRAFT.draft_text);
      expect(openSpy).toHaveBeenCalledWith(
        "https://www.ebay.com/mesg/",
        "_blank",
        "noopener",
      );
    });

    await waitFor(() => {
      const markCall = fetchSpy.mock.calls.find(
        (c) => String(c[0]) === "/api/v1/messages/m1/mark-sent",
      );
      expect(markCall).toBeDefined();
      const body = JSON.parse(String((markCall?.[1] as RequestInit).body ?? "{}"));
      expect(body.send_method).toBe("paste");
    });

    expect(await screen.findByTestId("toast")).toHaveTextContent(
      /Copied to clipboard/i,
    );
  });

  it("disables action buttons when status is sent", async () => {
    setupFetch(() =>
      jsonRes(
        makeDetail({
          status: "sent",
          draft: {
            ...SAMPLE_DRAFT,
            status: "sent",
            sent_at: "2026-05-03T10:05:00.000Z",
          },
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByTestId("approve")).toBeDisabled();
    expect(screen.getByTestId("approve-and-send")).toBeDisabled();
    expect(screen.getByTestId("regenerate")).toBeDisabled();
    expect(screen.getByTestId("skip")).toBeDisabled();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type {
  MessageListItem,
  MessageListResponse,
} from "@app/shared/contracts";
import { InboxPage } from "./InboxPage.js";

function makeRow(over: Partial<MessageListItem> = {}): MessageListItem {
  return {
    id: "m1",
    buyer_username: "buyer1",
    ebay_item_id: null,
    ebay_message_id: null,
    body_preview: "Hi, will this fit?",
    category: "sizing_measurements",
    status: "drafted",
    draft_id: "d1",
    draft_confidence: 0.81,
    draft_flags: [],
    received_at: "2026-05-03T10:00:00.000Z",
    approved_at: null,
    sent_at: null,
    skipped_at: null,
    ...over,
  };
}

function renderInbox(initialPath = "/") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const { hook, history } = memoryLocation({ path: initialPath, record: true });
  const utils = render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <InboxPage />
      </Router>
    </QueryClientProvider>,
  );
  return { ...utils, history };
}

describe("InboxPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the empty state when no messages", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          next_cursor: null,
          has_more: false,
          total_pending: 0,
        } satisfies MessageListResponse),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderInbox();
    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("total-pending")).toHaveTextContent(
      "0 pending review",
    );
  });

  it("renders 3 message rows from a mocked GET", async () => {
    const data: MessageListResponse = {
      data: [
        makeRow({ id: "m1", buyer_username: "alice" }),
        makeRow({ id: "m2", buyer_username: "bob", status: "approved" }),
        makeRow({
          id: "m3",
          buyer_username: "carol",
          status: "no_draft",
          draft_id: null,
          draft_confidence: null,
        }),
      ],
      next_cursor: null,
      has_more: false,
      total_pending: 2,
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderInbox();
    expect(await screen.findByTestId("row-m1")).toBeInTheDocument();
    expect(await screen.findByTestId("row-m2")).toBeInTheDocument();
    expect(await screen.findByTestId("row-m3")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
  });

  it("status filter chips trigger new fetch with status query param", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          next_cursor: null,
          has_more: false,
          total_pending: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderInbox();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const initialCalls = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("filter-approved"));
    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });
    const callsWithStatus = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("status=approved"),
    );
    expect(callsWithStatus.length).toBeGreaterThan(0);
  });

  it("clicking a row navigates to /messages/:id", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [makeRow({ id: "m42" })],
          next_cursor: null,
          has_more: false,
          total_pending: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { history } = renderInbox();
    const row = await screen.findByTestId("row-m42");
    fireEvent.click(row);
    await waitFor(() => {
      expect(history.at(-1)).toBe("/messages/m42");
    });
  });

  it("renders Load more when has_more is true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [makeRow()],
          next_cursor: "cursor-2",
          has_more: true,
          total_pending: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderInbox();
    expect(
      await screen.findByRole("button", { name: /Load more/i }),
    ).toBeInTheDocument();
  });
});

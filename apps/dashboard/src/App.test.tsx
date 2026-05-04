import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { MessageListResponse } from "@app/shared/contracts";
import { App } from "./App.js";

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const { hook } = memoryLocation({ path });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <App />
      </Router>
    </QueryClientProvider>,
  );
}

const EMPTY_LIST: MessageListResponse = {
  data: [],
  next_cursor: null,
  has_more: false,
  total_pending: 0,
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("App router", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders InboxPage at /", async () => {
    mockFetch(EMPTY_LIST);
    renderAt("/");
    expect(
      await screen.findByRole("heading", { name: /Inbox/i }),
    ).toBeInTheDocument();
    // Empty state should appear after fetch resolves.
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("renders DevDraftPage at /dev", () => {
    renderAt("/dev");
    expect(
      screen.getByRole("heading", {
        name: /eBay AI Message Assistant — V0 Dev/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Buyer message body/i)).toBeInTheDocument();
  });

  it("renders top nav with Inbox, Dev draft, Help", () => {
    mockFetch(EMPTY_LIST);
    renderAt("/");
    expect(screen.getByRole("link", { name: /^Inbox$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Dev draft$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Help$/i })).toBeInTheDocument();
  });

  it("renders 404 for unknown route", () => {
    renderAt("/this-does-not-exist");
    expect(screen.getByRole("heading", { name: /Not found/i })).toBeInTheDocument();
  });
});

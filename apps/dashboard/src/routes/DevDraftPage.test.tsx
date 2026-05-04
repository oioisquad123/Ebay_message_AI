import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DraftResponse } from "@app/shared/contracts";
import { DevDraftPage } from "./DevDraftPage.js";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <DevDraftPage />
    </QueryClientProvider>,
  );
}

const SAMPLE_RESPONSE: DraftResponse = {
  draft: "Hi! Yes, the waist measures 32 inches. Thanks for asking!",
  confidence: 0.87,
  category: "sizing_measurements",
  used_facts: ["measurements.waist_in", "title"],
  flags: [],
  model: "claude-haiku-4-5",
  tokens_in: 420,
  tokens_out: 80,
  cache_read_tokens: 0,
  cost_cents: 0.42,
  generated_at: "2026-05-03T12:34:56.000Z",
};

function mockFetchOk(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("DevDraftPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the form with default values", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        name: /eBay AI Message Assistant/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Buyer message body/i)).toHaveValue("");
    expect(screen.getByLabelText(/Brand voice/i)).toHaveValue("friendly");
    expect(screen.getByLabelText(/Buyer username/i)).toHaveValue("buyer123");
  });

  it("disables the submit button when body is empty", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /Generate draft/i });
    expect(btn).toBeDisabled();
  });

  it("enables submit and posts to /api/v1/dev/draft on submit", async () => {
    const fetchSpy = mockFetchOk(SAMPLE_RESPONSE);
    renderPage();

    fireEvent.change(screen.getByLabelText(/Buyer message body/i), {
      target: { value: "Will this fit a 32 waist?" },
    });

    const btn = screen.getByRole("button", { name: /Generate draft/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/v1/dev/draft");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const sent = JSON.parse(String(init!.body));
    expect(sent).toMatchObject({
      message: {
        userId: "dev-user",
        buyerUsername: "buyer123",
        body: "Will this fit a 32 waist?",
      },
      brandVoice: "friendly",
    });
    expect(sent.listingKb).toBeUndefined();
  });

  it("renders the result panel when API returns a valid DraftResponse", async () => {
    mockFetchOk(SAMPLE_RESPONSE);
    renderPage();

    fireEvent.change(screen.getByLabelText(/Buyer message body/i), {
      target: { value: "Does this fit a 32 waist?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate draft/i }));

    const panel = await screen.findByTestId("result-panel");
    expect(panel).toHaveTextContent(SAMPLE_RESPONSE.draft);
    expect(panel).toHaveTextContent("sizing_measurements");
    expect(panel).toHaveTextContent("87%");
    expect(panel).toHaveTextContent("0.42¢");
    expect(panel).toHaveTextContent("claude-haiku-4-5");
    expect(panel).toHaveTextContent("measurements.waist_in");
  });

  it("renders the error panel when API returns 422", async () => {
    mockFetchOk(
      {
        message: "Validation failed",
        issues: [
          { path: ["message", "body"], message: "Body required" },
        ],
      },
      422,
    );
    renderPage();

    fireEvent.change(screen.getByLabelText(/Buyer message body/i), {
      target: { value: "anything" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate draft/i }));

    const panel = await screen.findByTestId("error-panel");
    expect(panel).toHaveTextContent(/Validation error \(422\)/i);
    expect(panel).toHaveTextContent(/Validation failed/);
    expect(panel).toHaveTextContent(/message\.body/);
    expect(panel).toHaveTextContent(/Body required/);
  });
});

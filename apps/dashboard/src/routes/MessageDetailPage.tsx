import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { DraftSnapshot, MessageDetail } from "@app/shared/contracts";
import {
  useApproveDraft,
  useGenerateDraft,
  useMarkSent,
  useMessageDetail,
  useMessageList,
  useRegenerateDraft,
  useSkipMessage,
} from "../lib/api.js";
import {
  STATUS_LABEL,
  STATUS_PILL_CLASS,
  absoluteTime,
  categoryClass,
  categoryLabel,
  relativeTime,
} from "../lib/format.js";

const EBAY_INBOX_URL = "https://www.ebay.com/mesg/";

export function MessageDetailPage({ id }: { id: string }) {
  const detail = useMessageDetail(id);

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-gray-500">
        Loading message…
      </div>
    );
  }

  if (detail.error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          Failed to load message: {detail.error.message}
        </div>
        <div className="mt-4">
          <Link href="/" className="text-blue-600 underline">
            ← Back to inbox
          </Link>
        </div>
      </div>
    );
  }

  if (!detail.data) {
    return null;
  }

  return <MessageDetailLoaded id={id} data={detail.data} />;
}

function MessageDetailLoaded({
  id,
  data,
}: {
  id: string;
  data: MessageDetail;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <Link href="/" className="text-sm text-blue-600 underline">
          ← Back to inbox
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeftColumn data={data} />
        <RightColumn id={id} data={data} />
      </div>
    </div>
  );
}

function LeftColumn({ data }: { data: MessageDetail }) {
  const { message, listing, buyer_history_count } = data;
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              {message.buyer_username}
            </div>
            <div
              className="text-xs text-gray-500"
              title={absoluteTime(message.received_at)}
            >
              {relativeTime(message.received_at)}
            </div>
          </div>
          {message.category && (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${categoryClass(message.category)}`}
            >
              {categoryLabel(message.category)}
            </span>
          )}
        </header>

        <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          {message.body}
        </div>

        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-gray-600">
            Show PII-scrubbed body (sent to LLM)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {message.pii_scrubbed_body}
          </pre>
        </details>

        <p className="mt-3 text-xs text-gray-500">
          {buyer_history_count === 0
            ? "First message from this buyer"
            : `${buyer_history_count} prior messages from this buyer`}
        </p>
      </div>

      <ListingCard listing={listing} />
    </section>
  );
}

function ListingCard({ listing }: { listing: MessageDetail["listing"] }) {
  if (!listing) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        No listing context — extension hasn't scraped this item yet.
      </div>
    );
  }
  const kb = (listing.kb_json ?? {}) as Record<string, unknown>;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Listing context
      </h2>
      <div className="text-sm font-medium">{listing.title ?? "(no title)"}</div>
      <div className="mt-1 text-xs text-gray-500">
        item id: {listing.ebay_item_id}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {renderKbField("Condition", kb.condition)}
        {renderKbField("Size", kb.size)}
        {renderKbField("Brand", kb.brand)}
        {renderKbField("Color", kb.color)}
        {renderKbField("Measurements", kb.measurements)}
        {renderKbField("Shipping", kb.shipping)}
        {renderKbField("Returns", kb.returns)}
      </dl>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
      {children}
    </kbd>
  );
}

function renderKbField(label: string, value: unknown) {
  if (value == null) return null;
  let text: string;
  if (typeof value === "string" || typeof value === "number") {
    text = String(value);
  } else {
    text = JSON.stringify(value);
  }
  return (
    <div>
      <dt className="uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-mono text-[11px] text-gray-700 break-words">{text}</dd>
    </div>
  );
}

function StatusBanner({ data }: { data: MessageDetail }) {
  const { status, draft } = data;
  let text: string;
  let cls: string;
  if (status === "no_draft") {
    text = "No draft yet — generate one to start";
    cls = "bg-yellow-50 border-yellow-200 text-yellow-800";
  } else if (status === "drafted") {
    text = "Drafted — waiting for review";
    cls = "bg-gray-50 border-gray-200 text-gray-800";
  } else if (status === "approved") {
    text = "Approved — ready to send";
    cls = "bg-green-50 border-green-200 text-green-800";
  } else if (status === "sent") {
    const t = draft?.sent_at ?? data.message.received_at;
    text = `Sent ${relativeTime(t)}`;
    cls = "bg-blue-50 border-blue-200 text-blue-800";
  } else {
    text = "Skipped — flagged for human attention";
    cls = "bg-red-50 border-red-200 text-red-800";
  }
  return (
    <div
      data-testid="status-banner"
      className={`rounded-md border px-3 py-2 text-sm ${cls}`}
    >
      {text}
    </div>
  );
}

function RightColumn({ id, data }: { id: string; data: MessageDetail }) {
  const { draft, status } = data;
  const isFinal = status === "sent";

  return (
    <section className="space-y-4">
      <StatusBanner data={data} />
      {draft === null ? (
        <NoDraftPanel id={id} />
      ) : (
        <DraftPanel id={id} draft={draft} disabled={isFinal} />
      )}
    </section>
  );
}

function NoDraftPanel({ id }: { id: string }) {
  const generate = useGenerateDraft();
  const onClick = () => generate.mutate({ messageId: id });
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-600">
        No draft has been generated for this message yet.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={generate.isPending}
        data-testid="generate-draft"
        className="mt-3 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {generate.isPending ? "Generating…" : "Generate draft"}
      </button>
      {generate.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {generate.error.message}
        </p>
      )}
    </div>
  );
}

function DraftPanel({
  id,
  draft,
  disabled,
}: {
  id: string;
  draft: DraftSnapshot;
  disabled: boolean;
}) {
  const initial = draft.edited_text ?? draft.draft_text;
  const [text, setText] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();

  // Sync local text whenever the draft changes (e.g. after regenerate).
  useEffect(() => {
    setText(draft.edited_text ?? draft.draft_text);
  }, [draft.id, draft.version, draft.edited_text, draft.draft_text]);

  const approve = useApproveDraft();
  const regenerate = useRegenerateDraft();
  const skip = useSkipMessage();
  const markSent = useMarkSent();

  // Navigation set for J/K — the pending-drafted queue.
  const navList = useMessageList({ status: "drafted", limit: 50 });
  const { nextId, prevId } = useMemo(() => {
    const items = navList.data?.data ?? [];
    const idx = items.findIndex((m) => m.id === id);
    if (idx === -1) {
      // Current message not in pending set (e.g. just got sent). J jumps to
      // the next pending message; K does nothing.
      return { nextId: items[0]?.id ?? null, prevId: null };
    }
    return {
      nextId: items[idx + 1]?.id ?? null,
      prevId: items[idx - 1]?.id ?? null,
    };
  }, [navList.data, id]);

  const isBusy =
    approve.isPending ||
    regenerate.isPending ||
    skip.isPending ||
    markSent.isPending;

  const editedTextIfChanged = (): string | undefined =>
    text !== draft.draft_text ? text : undefined;

  const handleApprove = () => {
    approve.mutate({
      messageId: id,
      ...(editedTextIfChanged() !== undefined
        ? { editedText: editedTextIfChanged() as string }
        : {}),
    });
  };

  const handleApproveAndSend = async () => {
    try {
      await approve.mutateAsync({
        messageId: id,
        ...(editedTextIfChanged() !== undefined
          ? { editedText: editedTextIfChanged() as string }
          : {}),
      });
    } catch {
      return; // Error surface in UI via approve.error.
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Clipboard can fail silently in tests / restricted contexts.
    }
    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(EBAY_INBOX_URL, "_blank", "noopener");
    }
    setToast("Copied to clipboard — paste it into eBay's reply box.");
    try {
      await markSent.mutateAsync({ messageId: id });
    } catch {
      // mark-sent failure is non-fatal for UX.
    }
    window.setTimeout(() => setToast(null), 5000);
  };

  const handleRegenerate = () => regenerate.mutate({ messageId: id });

  const handleSkip = () => {
    if (typeof window !== "undefined" && !window.confirm) {
      skip.mutate({ messageId: id });
      return;
    }
    if (window.confirm("Skip and flag this message for human review?")) {
      skip.mutate({ messageId: id });
    }
  };

  // J/K/A/E/S keyboard shortcuts. Disabled when typing in inputs/textareas
  // or when modifier keys are held (so cmd-A still selects all).
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "j") {
        if (nextId) {
          e.preventDefault();
          navigate(`/messages/${nextId}`);
        }
      } else if (k === "k") {
        if (prevId) {
          e.preventDefault();
          navigate(`/messages/${prevId}`);
        }
      } else if (k === "a") {
        if (!disabled && !isBusy) {
          e.preventDefault();
          void handleApproveAndSend();
        }
      } else if (k === "e") {
        if (!disabled) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      } else if (k === "s") {
        if (!disabled && !isBusy) {
          e.preventDefault();
          handleSkip();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleApproveAndSend / handleSkip are closures over current state —
    // re-bind on every render is fine and keeps the deps simple.
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[draft.status as keyof typeof STATUS_PILL_CLASS] ?? STATUS_PILL_CLASS.drafted}`}
        >
          {STATUS_LABEL[draft.status as keyof typeof STATUS_LABEL] ?? draft.status}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${categoryClass(draft.category)}`}
        >
          {categoryLabel(draft.category)}
        </span>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
          {(draft.confidence * 100).toFixed(0)}% confidence
        </span>
        {draft.flags.map((f) => (
          <span
            key={f}
            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
          >
            {f}
          </span>
        ))}
      </header>

      <textarea
        ref={textareaRef}
        data-testid="draft-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        disabled={disabled}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-gray-100"
      />

      {draft.used_facts.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Used facts
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {draft.used_facts.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={disabled || isBusy}
          data-testid="approve"
          className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {approve.isPending ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={handleApproveAndSend}
          disabled={disabled || isBusy}
          data-testid="approve-and-send"
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          Approve & send (copy + open eBay)
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={disabled || isBusy}
          data-testid="regenerate"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {regenerate.isPending ? "Regenerating…" : "Regenerate"}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={disabled || isBusy}
          data-testid="skip"
          className="inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip & flag
        </button>
      </div>

      {(approve.error || regenerate.error || skip.error || markSent.error) && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700"
        >
          {approve.error?.message ||
            regenerate.error?.message ||
            skip.error?.message ||
            markSent.error?.message}
        </div>
      )}

      {toast && (
        <div
          data-testid="toast"
          role="status"
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      <footer
        data-testid="shortcuts-hint"
        className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500"
      >
        <span>
          Generated by {draft.model} — {draft.cost_cents.toFixed(2)}¢
        </span>
        <span className="text-gray-400">
          shortcuts:{" "}
          <Kbd>J</Kbd> next · <Kbd>K</Kbd> prev · <Kbd>A</Kbd> approve & send ·{" "}
          <Kbd>E</Kbd> edit · <Kbd>S</Kbd> skip
        </span>
      </footer>
    </div>
  );
}

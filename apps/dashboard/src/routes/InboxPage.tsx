import { useMemo, useState } from "react";
import { Link } from "wouter";
import type {
  Category,
  MessageListItem,
  MessageListQuery,
  MessageStatus,
} from "@app/shared/contracts";
import { useApproveDraft, useMessageList } from "../lib/api.js";
import {
  STATUS_LABEL,
  STATUS_PILL_CLASS,
  absoluteTime,
  categoryClass,
  categoryLabel,
  relativeTime,
} from "../lib/format.js";

type FilterValue = "all" | "pending" | "approved" | "sent" | "skipped";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "skipped", label: "Skipped" },
];

/**
 * "Pending" maps to two server statuses — drafted + no_draft. We make two
 * requests and merge, sorted by received_at desc. For V0 traffic this is
 * fine; V1 should add a server-side `status_in` filter.
 */
function buildSingleQuery(
  filter: FilterValue,
  cursor: string | undefined,
): MessageListQuery | "split" {
  const base: MessageListQuery = { limit: 50, ...(cursor ? { cursor } : {}) };
  if (filter === "all") return base;
  if (filter === "pending") return "split";
  return { ...base, status: filter as MessageStatus };
}

export function InboxPage() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset cursor + selection when filter changes.
  const handleFilter = (v: FilterValue) => {
    setFilter(v);
    setCursor(undefined);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const singleQuery = buildSingleQuery(filter, cursor);

  const allOrSingle = useMessageList(
    singleQuery === "split"
      ? { limit: 50, status: "drafted" } // placeholder — `enabled: false` below
      : singleQuery,
  );
  const pendingDrafted = useMessageList(
    filter === "pending" ? { limit: 50, status: "drafted" } : { limit: 1 },
  );
  const pendingNoDraft = useMessageList(
    filter === "pending" ? { limit: 50, status: "no_draft" } : { limit: 1 },
  );

  const items = useMemo<MessageListItem[]>(() => {
    if (filter === "pending") {
      const a = pendingDrafted.data?.data ?? [];
      const b = pendingNoDraft.data?.data ?? [];
      return [...a, ...b].sort((x, y) =>
        x.received_at < y.received_at ? 1 : -1,
      );
    }
    return allOrSingle.data?.data ?? [];
  }, [filter, allOrSingle.data, pendingDrafted.data, pendingNoDraft.data]);

  const isLoading =
    filter === "pending"
      ? pendingDrafted.isLoading || pendingNoDraft.isLoading
      : allOrSingle.isLoading;
  const error =
    filter === "pending"
      ? pendingDrafted.error ?? pendingNoDraft.error
      : allOrSingle.error;

  const hasMore =
    filter === "pending"
      ? Boolean(
          pendingDrafted.data?.has_more ?? pendingNoDraft.data?.has_more,
        )
      : Boolean(allOrSingle.data?.has_more);

  const totalPending =
    filter === "pending"
      ? (pendingDrafted.data?.total_pending ?? 0) +
        (pendingNoDraft.data?.total_pending ?? 0)
      : allOrSingle.data?.total_pending;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          {typeof totalPending === "number" && (
            <p className="text-sm text-gray-500" data-testid="total-pending">
              {totalPending} pending review
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              data-testid={`filter-${f.value}`}
              onClick={() => handleFilter(f.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          Failed to load messages: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading messages…
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <ul
            data-testid="message-list"
            className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            {items.map((m) => (
              <MessageRow
                key={m.id}
                item={m}
                selected={selected.has(m.id)}
                onToggle={() => toggleSelected(m.id)}
              />
            ))}
          </ul>
          <BatchApproveBar
            items={items}
            selected={selected}
            onClear={() => setSelected(new Set())}
          />
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const next =
                    filter === "pending"
                      ? pendingDrafted.data?.next_cursor ??
                        pendingNoDraft.data?.next_cursor
                      : allOrSingle.data?.next_cursor;
                  if (next) setCursor(next);
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="empty-state"
      className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center"
    >
      <p className="text-base font-medium text-gray-900">No messages yet</p>
      <p className="mt-1 text-sm text-gray-500">
        Install the Chrome extension and click <strong>Sync now</strong>, or
        try the{" "}
        <Link href="/dev" className="text-blue-600 underline">
          paste-and-draft dev page
        </Link>
        .
      </p>
    </div>
  );
}

function MessageRow({
  item,
  selected,
  onToggle,
}: {
  item: MessageListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const canBatchApprove =
    item.status === "drafted" && item.draft_id !== null;
  return (
    <li className="flex items-stretch hover:bg-gray-50">
      <label
        className={`flex shrink-0 items-center pl-4 pr-2 ${
          canBatchApprove ? "cursor-pointer" : "cursor-not-allowed opacity-40"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          data-testid={`select-${item.id}`}
          checked={selected}
          disabled={!canBatchApprove}
          onChange={onToggle}
          aria-label={`Select message from ${item.buyer_username}`}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </label>
      <Link
        href={`/messages/${item.id}`}
        data-testid={`row-${item.id}`}
        className="block flex-1"
      >
        <div className="flex flex-col gap-2 py-3 pr-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="w-32 shrink-0 truncate font-semibold text-gray-900">
            {item.buyer_username}
          </div>

          <div className="min-w-0 flex-1 truncate text-sm text-gray-600">
            {item.body_preview}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${categoryClass(item.category)}`}
            >
              {categoryLabel(item.category)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[item.status]}`}
            >
              {STATUS_LABEL[item.status]}
            </span>
            {item.draft_confidence !== null && (
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                {(item.draft_confidence * 100).toFixed(0)}%
              </span>
            )}
            <span
              className="text-xs text-gray-500"
              title={absoluteTime(item.received_at)}
            >
              {relativeTime(item.received_at)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function BatchApproveBar({
  items,
  selected,
  onClear,
}: {
  items: MessageListItem[];
  selected: Set<string>;
  onClear: () => void;
}) {
  const approve = useApproveDraft();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => items.filter((m) => selected.has(m.id)),
    [items, selected],
  );

  const categories = useMemo(() => {
    const set = new Set<Category>();
    for (const m of selectedItems) {
      if (m.category) set.add(m.category);
    }
    return set;
  }, [selectedItems]);

  if (selected.size === 0) return null;

  const sameCategory = categories.size === 1;
  const onlyCategory: Category | null = sameCategory
    ? (categories.values().next().value as Category)
    : null;
  const canApprove = sameCategory && !approve.isPending;

  const handleApproveAll = async () => {
    setError(null);
    setProgress({ done: 0, total: selectedItems.length });
    let done = 0;
    for (const item of selectedItems) {
      try {
        await approve.mutateAsync({ messageId: item.id });
      } catch (e) {
        setError(
          `Failed on ${item.buyer_username}: ${
            (e as { message?: string })?.message ?? "unknown error"
          }`,
        );
        setProgress(null);
        return;
      }
      done += 1;
      setProgress({ done, total: selectedItems.length });
    }
    setProgress(null);
    onClear();
  };

  return (
    <div
      data-testid="batch-approve-bar"
      role="region"
      aria-label="Batch approve"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-lg"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm font-medium text-gray-900">
          {selected.size} selected
        </span>
        {sameCategory && onlyCategory && (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${categoryClass(onlyCategory)}`}
          >
            {categoryLabel(onlyCategory)}
          </span>
        )}
        {!sameCategory && (
          <span
            data-testid="batch-mixed-warning"
            className="text-xs text-amber-700"
          >
            Mixed categories — select one category at a time.
          </span>
        )}
        {progress && (
          <span data-testid="batch-progress" className="text-xs text-gray-600">
            Approving {progress.done} of {progress.total}…
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-red-700">
            {error}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            data-testid="batch-clear"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={!canApprove}
            data-testid="batch-approve"
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Approve {selected.size}
          </button>
        </div>
      </div>
    </div>
  );
}

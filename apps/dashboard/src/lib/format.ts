/** Small UI formatting helpers — no business logic. */

import type { Category, MessageStatus } from "@app/shared/contracts";

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return iso;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString();
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export const STATUS_PILL_CLASS: Record<MessageStatus, string> = {
  no_draft:
    "bg-yellow-100 text-yellow-800 border border-yellow-200",
  drafted: "bg-gray-100 text-gray-800 border border-gray-200",
  approved: "bg-green-100 text-green-800 border border-green-200",
  sent: "bg-blue-100 text-blue-800 border border-blue-200",
  skipped: "bg-red-100 text-red-800 border border-red-200",
};

export const STATUS_LABEL: Record<MessageStatus, string> = {
  no_draft: "No draft",
  drafted: "Drafted",
  approved: "Approved",
  sent: "Sent",
  skipped: "Skipped",
};

const CATEGORY_PALETTE: Record<Category, string> = {
  sizing_measurements: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipping_timeline: "bg-cyan-50 text-cyan-700 border-cyan-200",
  condition_authenticity: "bg-purple-50 text-purple-700 border-purple-200",
  combined_shipping_discount: "bg-teal-50 text-teal-700 border-teal-200",
  returns_refunds: "bg-rose-50 text-rose-700 border-rose-200",
  complaint_dispute: "bg-red-50 text-red-700 border-red-200",
  generic_greeting: "bg-emerald-50 text-emerald-700 border-emerald-200",
  offer_negotiation: "bg-amber-50 text-amber-700 border-amber-200",
  other_unclear: "bg-slate-50 text-slate-700 border-slate-200",
};

export function categoryClass(c: Category | null | undefined): string {
  if (!c) return "bg-slate-50 text-slate-500 border-slate-200";
  return CATEGORY_PALETTE[c];
}

export function categoryLabel(c: Category | null | undefined): string {
  if (!c) return "uncategorized";
  return c.replace(/_/g, " ");
}

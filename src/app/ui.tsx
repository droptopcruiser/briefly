import type { MatterStatus } from "@/lib/types";

/** Readiness score pill, coloured by band. */
export function ReadinessBadge({ value }: { value: number }) {
  const tone =
    value >= 100
      ? "bg-accent text-accent-fg"
      : value >= 60
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone}`}>
      {value}%
    </span>
  );
}

const STATUS_LABELS: Record<MatterStatus, string> = {
  processing: "Processing",
  needs_info: "Needs info",
  ready_for_review: "Ready for review",
  approved: "Approved",
};

export function StatusBadge({ status }: { status: MatterStatus }) {
  const tone =
    status === "approved"
      ? "border-accent text-accent"
      : status === "ready_for_review"
        ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
        : "border-border text-muted";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

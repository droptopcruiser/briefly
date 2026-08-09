import type { MatterStatus } from "@/lib/types";
import type { Usage } from "@/lib/metering";
import type { MonthStats } from "@/lib/stats";

/** Activity overview: what Briefly handled this month + estimated time saved. */
export function StatsPanel({ stats }: { stats: MonthStats }) {
  const tiles: { num: string; cap: string; accent?: boolean }[] = [
    { num: `${stats.hoursSaved}h`, cap: "saved this month", accent: true },
    { num: String(stats.matters), cap: "matters this month" },
    { num: String(stats.readyForYou), cap: "ready for you" },
    { num: String(stats.awaitingClient), cap: "awaiting client" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.cap}
          className={`rounded-lg border bg-surface px-4 py-3 ${
            t.accent ? "border-accent" : "border-border"
          }`}
        >
          <div
            className={`text-2xl font-semibold tabular-nums tracking-tight ${
              t.accent ? "text-accent" : ""
            }`}
          >
            {t.num}
          </div>
          <div className="text-xs text-muted">{t.cap}</div>
        </div>
      ))}
    </div>
  );
}

/** Monthly usage meter: extractions used vs the plan cap, plus credits. */
export function UsageMeter({ usage }: { usage: Usage }) {
  const pct = usage.cap > 0 ? Math.min(100, Math.round((usage.used / usage.cap) * 100)) : 0;
  const overCap = usage.used >= usage.cap;
  const barColor = usage.blocked
    ? "bg-red-500"
    : overCap
      ? "bg-amber-500"
      : "bg-accent";

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium tabular-nums">
            {usage.used} / {usage.cap}
          </span>{" "}
          <span className="text-muted">extractions this month</span>
        </div>
        <div className="text-xs text-muted">
          {usage.planName} plan
          {usage.credits > 0 ? (
            <>
              {" · "}
              <span className="tabular-nums">{usage.credits}</span> credits
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {usage.blocked ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          Monthly limit reached. Upgrade your plan or add a credit pack to keep processing intake.
        </p>
      ) : overCap ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Over your plan cap — running on credits ({usage.credits} left).
        </p>
      ) : null}
    </div>
  );
}

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
  preparing: "Preparing",
  ready_for_review: "Ready for review",
  awaiting_client: "Awaiting client",
  ready_for_you: "Ready for you",
  completed: "Completed",
};

const STATUS_TONES: Record<MatterStatus, string> = {
  preparing: "border-border text-muted",
  ready_for_review: "border-amber-500 text-amber-700 dark:text-amber-300",
  awaiting_client: "border-border text-muted",
  ready_for_you: "border-emerald-500 text-emerald-700 dark:text-emerald-300",
  completed: "border-accent text-accent",
};

export function StatusBadge({ status }: { status: MatterStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${STATUS_TONES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

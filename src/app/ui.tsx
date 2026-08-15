import Link from "next/link";
import type { Matter, MatterStatus } from "@/lib/types";
import type { Usage } from "@/lib/metering";
import type { MonthStats } from "@/lib/stats";

/** Activity overview: what Briefly handled this month + estimated time saved.
 *  The count tiles are queues — each links to its filtered matters view. */
export function StatsPanel({ stats }: { stats: MonthStats }) {
  const tiles: { num: string; cap: string; accent?: boolean; href?: string }[] = [
    { num: `${stats.hoursSaved}h`, cap: "saved this month", accent: true },
    { num: String(stats.matters), cap: "matters this month", href: "/app/matters?view=all" },
    { num: String(stats.readyForYou), cap: "ready for you", href: "/app/matters" },
    { num: String(stats.awaitingClient), cap: "awaiting client", href: "/app/matters?view=awaiting" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => {
        const inner = (
          <>
            <div
              className={`text-2xl font-semibold tabular-nums tracking-tight ${
                t.accent ? "text-accent" : ""
              }`}
            >
              {t.num}
            </div>
            <div className="text-xs text-muted">{t.cap}</div>
          </>
        );
        const cls = `block rounded-lg border bg-surface px-4 py-3 ${
          t.accent ? "border-accent" : "border-border"
        }`;
        return t.href ? (
          <Link key={t.cap} href={t.href} className={`${cls} transition-colors hover:bg-inset`}>
            {inner}
          </Link>
        ) : (
          <div key={t.cap} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** Monthly usage meter: extractions used vs the plan cap, plus credits. */
export function UsageMeter({ usage }: { usage: Usage }) {
  const pct = usage.cap > 0 ? Math.min(100, Math.round((usage.used / usage.cap) * 100)) : 0;
  const overCap = usage.used >= usage.cap;
  const barColor = usage.blocked
    ? "bg-error"
    : overCap
      ? "bg-awaiting"
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
        <p className="mt-2 text-xs text-error">
          Monthly limit reached. Upgrade your plan or add a credit pack to keep processing intake.
        </p>
      ) : overCap ? (
        <p className="mt-2 text-xs text-awaiting">
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
        ? "bg-awaiting-soft text-awaiting"
        : "bg-error-soft text-error";
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
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_TONES: Record<MatterStatus, string> = {
  preparing: "border-border text-muted",
  ready_for_review: "border-awaiting text-awaiting",
  awaiting_client: "border-border text-muted",
  ready_for_you: "border-accent text-accent",
  in_progress: "border-transparent bg-accent-soft text-accent",
  completed: "border-transparent bg-inset text-muted",
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

/** Readiness by band: forest at 100, honey mid, clay low. */
function bandTone(value: number): string {
  return value >= 100 ? "bg-accent" : value >= 60 ? "bg-awaiting" : "bg-error";
}

/** A calm hairline progress line for a matter's readiness. */
export function ReadinessMeter({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full bg-inset ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Readiness"
    >
      <div className={`h-full rounded-full ${bandTone(pct)}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Server-only (these components never hydrate on the client), so reading the
// clock here can't cause a hydration mismatch. UTC keeps the fallback stable.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * A single matter in a list: client · type, last activity + assignee, readiness
 * and status on the right, a hairline readiness line beneath. One source so the
 * dashboard and the matters list read identically. Links to the full matter view.
 */
export function MatterRow({
  matter,
  assignee,
  href,
}: {
  matter: Matter;
  assignee?: string | null;
  href: string;
}) {
  const readiness = matter.result?.readiness;
  return (
    <Link href={href} className="block px-4 py-3.5 transition-colors hover:bg-inset">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {matter.clientName ?? "Unnamed client"}
            {matter.result ? (
              <span className="font-normal text-muted"> · {matter.result.rubricName}</span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {assignee ? `${assignee} · ` : ""}
            {timeAgo(matter.updatedAt ?? matter.createdAt)}
          </div>
        </div>
        {typeof readiness === "number" ? <ReadinessBadge value={readiness} /> : null}
        <StatusBadge status={matter.status} />
      </div>
      {typeof readiness === "number" ? <ReadinessMeter value={readiness} className="mt-2.5" /> : null}
    </Link>
  );
}

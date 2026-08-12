import Link from "next/link";
import type { MatterStatus } from "@/lib/types";
import { listMatters } from "@/lib/store";
import { listMembers } from "@/lib/team";
import { requireAccount, getCurrentMembership } from "@/lib/metering";
import { MatterRow } from "../../ui";

type ViewKey = "needs-you" | "awaiting" | "assigned" | "unassigned" | "all";

const VIEWS: { key: ViewKey; label: string; empty: string }[] = [
  { key: "needs-you", label: "Needs you", empty: "Nothing needs you right now — a good place to be." },
  { key: "awaiting", label: "Awaiting client", empty: "No matters are waiting on a client." },
  { key: "assigned", label: "Assigned to me", empty: "Nothing is assigned to you yet." },
  { key: "unassigned", label: "Unassigned", empty: "Every matter has an owner." },
  { key: "all", label: "All", empty: "No matters yet — new intake will appear here." },
];

const NEEDS_YOU: MatterStatus[] = ["ready_for_review", "ready_for_you"];

export default async function MattersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const account = await requireAccount();
  const membership = await getCurrentMembership();
  const members = await listMembers(account.id);

  const sp = await searchParams;
  const view: ViewKey =
    VIEWS.find((v) => v.key === sp?.view)?.key ?? "needs-you";
  const current = VIEWS.find((v) => v.key === view)!;

  const opts =
    view === "needs-you"
      ? { status: NEEDS_YOU }
      : view === "awaiting"
        ? { status: "awaiting_client" as MatterStatus }
        : view === "assigned"
          ? { assignee: membership?.userId }
          : view === "unassigned"
            ? { assignee: "unassigned" as const }
            : {};
  const matters = await listMatters(account.id, { ...opts, limit: 100 });

  const labelFor = (uid: string | null) => {
    if (!uid) return null;
    const m = members.find((x) => x.userId === uid);
    return m ? m.name || m.email || "Teammate" : "Teammate";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Matters</h1>
        <p className="mt-1 text-muted">Every intake, grouped by what it needs.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              href={v.key === "needs-you" ? "/app/matters" : `/app/matters?view=${v.key}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-accent font-medium text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      {matters.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          {current.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <ul className="divide-y divide-border">
            {matters.map((m) => (
              <li key={m.id}>
                <MatterRow matter={m} assignee={labelFor(m.assignedTo)} href={`/matters/${m.id}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

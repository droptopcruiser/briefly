import Link from "next/link";
import type { MatterStatus } from "@/lib/types";
import { listMatters } from "@/lib/store";
import { listMembers } from "@/lib/team";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { getActiveBrief } from "@/lib/work-brief";
import { workflowStatus, statusTone, firstSentence } from "@/lib/matter-status";
import { requireAccount, getCurrentMembership } from "@/lib/metering";
import { MatterRow } from "../../ui";
import { LeadMatterCard } from "../../lead-matter-card";

type ViewKey =
  | "needs-you"
  | "awaiting"
  | "in-progress"
  | "completed"
  | "assigned"
  | "unassigned"
  | "all";

const VIEWS: { key: ViewKey; label: string; empty: string }[] = [
  { key: "needs-you", label: "Needs you", empty: "Nothing needs you right now — a good place to be." },
  { key: "awaiting", label: "Awaiting client", empty: "No matters are waiting on a client." },
  { key: "in-progress", label: "In progress", empty: "No matters are in progress — approve a brief to begin one." },
  { key: "completed", label: "Completed", empty: "No completed matters yet — finished work lives here." },
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
        : view === "in-progress"
          ? { status: "in_progress" as MatterStatus }
          : view === "completed"
            ? { status: "completed" as MatterStatus }
            : view === "assigned"
            ? { assignee: membership?.userId }
            : view === "unassigned"
              ? { assignee: "unassigned" as const }
              : {};
  const [matters, rubrics] = await Promise.all([
    listMatters(account.id, { ...opts, limit: 100 }),
    getEffectiveRubrics(account.id),
  ]);
  const rubricFor = (rid: string | undefined) => rubrics.find((x) => x.id === rid);

  const labelFor = (uid: string | null) => {
    if (!uid) return null;
    const m = members.find((x) => x.userId === uid);
    return m ? m.name || m.email || "Teammate" : "Teammate";
  };

  // The lead — the one matter given full weight — plus its brief, for the insight.
  const [lead, ...rest] = matters;
  const leadBrief = lead ? await getActiveBrief(lead.id) : null;

  // Inbox-Zero relief: clearing "Needs you" is the reward, stated calmly.
  const isNeedsYou = view === "needs-you";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">Matters</h1>
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
        isNeedsYou ? (
          <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
            <p className="font-serif text-2xl font-medium tracking-tight">You&apos;re all caught up.</p>
            <p className="mt-2 text-sm text-muted">
              Nothing awaits your review right now. New intake will appear here the moment it arrives.
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            {current.empty}
          </p>
        )
      ) : (
        <div className="space-y-4">
          {/* The lead matter — full weight. */}
          <div className="stagger-in" style={{ ["--i" as string]: 0 }}>
            <LeadMatterCard
              matter={lead}
              brief={leadBrief}
              rubric={rubricFor(lead.result?.rubricId)}
              assignee={labelFor(lead.assignedTo)}
              href={`/matters/${lead.id}`}
            />
          </div>

          {/* The rest — quiet, decision-forward rows. */}
          {rest.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <ul className="divide-y divide-border">
                {rest.map((m, idx) => {
                  const rubric = rubricFor(m.result?.rubricId);
                  return (
                    <li
                      key={m.id}
                      className="stagger-in"
                      style={{ ["--i" as string]: idx + 1 }}
                    >
                      <MatterRow
                        matter={m}
                        assignee={labelFor(m.assignedTo)}
                        href={`/matters/${m.id}`}
                        statusLabel={workflowStatus(m, rubric)}
                        snippet={m.result ? firstSentence(m.result.summary) : null}
                        tone={statusTone(m)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

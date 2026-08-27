import Link from "next/link";
import { createMatterFromSubmission } from "../actions";
import { listMatters } from "@/lib/store";
import type { Matter } from "@/lib/types";
import { SubmissionForm } from "../submission-form";
import { Greeting } from "../greeting";
import { MatterRow, UsageMeter, StatsPanel } from "../ui";
import { DashboardTabs } from "../dashboard-tabs";
import { requireAccount, getUsage, getCurrentMembership } from "@/lib/metering";
import { getCurrentProfile } from "@/lib/profile";
import { getAccountRubrics } from "@/lib/rubric-store";
import { getReviewRollup, summariseChanges } from "@/lib/reviews";
import { listMembers } from "@/lib/team";
import { getMonthStats } from "@/lib/stats";

// The submission server action runs the pipeline (3 sequential Haiku calls,
// ~10-20s). Give the route headroom on Vercel (well under the 300s ceiling).
export const maxDuration = 60;

export default async function Dashboard() {
  const account = await requireAccount();
  await getCurrentMembership();
  const profile = await getCurrentProfile();
  const usage = await getUsage(account);
  const stats = await getMonthStats(account.id, account.timezone);
  const members = await listMembers(account.id);
  const blocked = usage.blocked;

  const [needsYou, awaiting, everything] = await Promise.all([
    listMatters(account.id, { status: ["ready_for_review", "ready_for_you"], limit: 50 }),
    listMatters(account.id, { status: ["awaiting_client"], limit: 50 }),
    listMatters(account.id, { limit: 50 }),
  ]);
  const hasOwnRubric = (await getAccountRubrics(account.id)).length > 0;
  const rollup = await getReviewRollup(account.id, 6);
  const firstName = profile?.name?.split(/\s+/)[0] ?? null;

  const labelFor = (uid: string | null) => {
    if (!uid) return null;
    const m = members.find((x) => x.userId === uid);
    return m ? m.name || m.email || "Teammate" : "Teammate";
  };

  const rows = (items: Matter[]) => (
    <div className="glass-card glass-sheen overflow-hidden rounded-2xl">
      <ul className="divide-y divide-border/60">
        {items.map((m) => (
          <li key={m.id}>
            <MatterRow matter={m} assignee={labelFor(m.assignedTo)} href={`/matters/${m.id}`} />
          </li>
        ))}
      </ul>
    </div>
  );
  const empty = (msg: string) => (
    <div className="glass-card rounded-2xl px-4 py-12 text-center text-sm text-muted">{msg}</div>
  );

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          <Greeting name={firstName} />
        </h1>
        <p className="mt-1 text-muted">
          {needsYou.length === 0
            ? "Nothing needs you right now. Briefly is watching the inbox."
            : needsYou.length === 1
              ? "One matter is ready for you."
              : `${needsYou.length} matters are ready for you.`}
        </p>
      </header>

      {!hasOwnRubric ? (
        <Link
          href="/app/welcome"
          className="glass-card glass-sheen flex flex-wrap items-center justify-between gap-3 rounded-2xl border-accent/60 px-5 py-4 transition-transform hover:-translate-y-0.5"
        >
          <div>
            <div className="text-sm font-medium text-accent">Finish setting up Briefly</div>
            <div className="text-sm text-muted">
              Teach Briefly your first matter type — describe how you handle one enquiry and it builds
              your checklist.
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-accent">Set it up →</span>
        </Link>
      ) : null}

      {/* Stats */}
      {stats ? (
        <section className="space-y-2">
          <StatsPanel stats={stats} />
          <p className="text-xs text-muted">
            Time saved is an estimate — about 15 minutes of manual prep per matter (reading,
            structuring, spotting gaps, drafting the reply).
          </p>
        </section>
      ) : null}

      {/* Matters — tabbed, with the readiness line on every row */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-xl font-semibold tracking-tight">Your matters</h2>
          <Link href="/app/matters" className="text-sm text-accent hover:text-accent-h">
            Open all →
          </Link>
        </div>
        <DashboardTabs
          tabs={[
            {
              id: "needs",
              label: "Needs you",
              count: needsYou.length,
              node: needsYou.length
                ? rows(needsYou.slice(0, 10))
                : empty("You're all caught up — new intake surfaces here the moment it's ready."),
            },
            {
              id: "awaiting",
              label: "Awaiting client",
              count: awaiting.length,
              node: awaiting.length
                ? rows(awaiting.slice(0, 10))
                : empty("Nothing waiting on a client right now."),
            },
            {
              id: "all",
              label: "Everything",
              count: everything.length,
              node: everything.length
                ? rows(everything.slice(0, 12))
                : empty("No matters yet — forward a client enquiry to your intake address to begin."),
            },
          ]}
        />
      </section>

      {/* Recent activity — what changed across matters since you last looked */}
      {rollup.items.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl font-semibold tracking-tight">Recent activity</h2>
            <span className="text-sm text-muted tabular-nums">
              {rollup.total} {rollup.total === 1 ? "matter" : "matters"} updated
            </span>
          </div>
          <div className="glass-card glass-sheen overflow-hidden rounded-2xl">
            <ul className="divide-y divide-border/60">
              {rollup.items.map(({ matter, changes }) => (
                <li key={matter.id}>
                  <Link
                    href={`/matters/${matter.id}`}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-inset/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        <span className="font-serif text-[15px] font-medium tracking-tight">
                          {matter.clientName ?? "Unnamed client"}
                        </span>
                        {matter.result ? (
                          <span className="text-sm text-muted"> · {matter.result.rubricName}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-accent">
                        {summariseChanges(changes)}
                        {changes.readinessDelta ? (
                          <span className="text-muted">
                            {" · "}readiness {changes.readinessDelta.from}% → {changes.readinessDelta.to}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* New matter — quieter than the list; most intake arrives by email */}
      <section className="space-y-4 border-t border-border pt-8">
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-semibold tracking-tight">New matter by hand</h2>
          <p className="max-w-2xl text-sm text-muted">
            Most enquiries arrive by email and become matters automatically. To add one yourself,
            paste the client&apos;s message — Briefly reads it, checks your checklist, flags what&apos;s
            missing, and drafts the next step.
          </p>
        </div>

        <UsageMeter usage={usage} />

        {blocked ? (
          <div className="glass-card rounded-2xl px-4 py-4 text-sm">
            <p className="font-medium">You&apos;ve reached this month&apos;s limit.</p>
            <p className="mt-1 text-muted">
              Upgrade your plan or add a credit pack to keep processing intake. Until then, new
              submissions and inbound emails won&apos;t be processed.
            </p>
          </div>
        ) : (
          <SubmissionForm action={createMatterFromSubmission} />
        )}
      </section>
    </div>
  );
}

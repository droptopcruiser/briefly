import Link from "next/link";
import { createMatterFromSubmission } from "../actions";
import { listMatters } from "@/lib/store";
import { SubmissionForm } from "../submission-form";
import { Greeting } from "../greeting";
import { UsageMeter, StatsPanel } from "../ui";
import { NeedsAttention } from "../needs-attention";
import { requireAccount, getUsage, getCurrentMembership } from "@/lib/metering";
import { getCurrentProfile } from "@/lib/profile";
import { getAccountRubrics } from "@/lib/rubric-store";
import { getChangesMap, describeChanges } from "@/lib/reviews";
import { computeUrgency, isSnoozed, PRIORITY_ORDER, PRIORITY_META } from "@/lib/urgency";
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

  // Whole active picture in two queries: the matters + one baselines lookup that
  // powers the "since your last review" signals. The urgency scorer does the rest
  // in memory — no per-matter round trips.
  const matters = await listMatters(account.id, { limit: 100 });
  const changesMap = await getChangesMap(account.id, matters);
  const hasOwnRubric = (await getAccountRubrics(account.id)).length > 0;
  const firstName = profile?.name?.split(/\s+/)[0] ?? null;

  const labelFor = (uid: string | null) => {
    if (!uid) return null;
    const m = members.find((x) => x.userId === uid);
    return m ? m.name || m.email || "Teammate" : "Teammate";
  };
  const memberOpts = members.map((m) => ({
    userId: m.userId,
    label: m.name || m.email || "Teammate",
  }));

  const now = Date.now();
  // Completed matters live in the Completed list, not the daily queue.
  const scored = matters
    .filter((m) => m.status !== "completed")
    .map((m) => ({ m, u: computeUrgency(m, changesMap.get(m.id) ?? null, now) }));

  const snoozed = scored
    .filter(({ m }) => isSnoozed(m, now))
    .map(({ m }) => ({
      id: m.id,
      href: `/matters/${m.id}`,
      clientName: m.clientName ?? "Unnamed client",
      rubricName: m.result?.rubricName ?? null,
    }));
  const activeScored = scored.filter(({ m }) => !isSnoozed(m, now));

  const groups = PRIORITY_ORDER.map((p) => ({
    priority: p,
    label: PRIORITY_META[p].label,
    blurb: PRIORITY_META[p].blurb,
    items: activeScored
      .filter(({ u }) => u.priority === p)
      .sort((a, b) => b.u.score - a.u.score)
      .map(({ m, u }) => {
        const c = changesMap.get(m.id);
        return {
          id: m.id,
          href: `/matters/${m.id}`,
          clientName: m.clientName ?? "Unnamed client",
          rubricName: m.result?.rubricName ?? null,
          status: m.status,
          readiness: typeof m.result?.readiness === "number" ? m.result.readiness : null,
          gapsCount: m.result?.gaps.length ?? 0,
          reason: u.reason,
          detail: c ? describeChanges(c) : null,
          actionLabel: u.actionLabel,
          signals: u.signals,
          when: u.when,
          assignee: labelFor(m.assignedTo),
          priorityOverride: m.priorityOverride ?? null,
        };
      }),
  }));

  // The greeting number is what needs a DECISION now — critical + needs-review —
  // not everything on the desk.
  const attention = groups
    .filter((g) => g.priority === "critical" || g.priority === "review")
    .reduce((n, g) => n + g.items.length, 0);
  const activeTotal = activeScored.length;
  const subline =
    activeTotal === 0
      ? "Nothing needs you right now. Briefly is watching the inbox."
      : attention === 0
        ? "Nothing urgent — everything is either waiting on a client or ready when you are."
        : attention === 1
          ? "1 matter needs your attention."
          : `${attention} matters need your attention.`;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          <Greeting name={firstName} />
        </h1>
        <p className="mt-1 text-muted">{subline}</p>
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

      {/* Needs Attention — the daily command centre: urgency first, then readiness */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-xl font-semibold tracking-tight">Needs attention</h2>
          <Link href="/app/matters" className="text-sm text-accent hover:text-accent-h">
            Open all →
          </Link>
        </div>
        <NeedsAttention groups={groups} members={memberOpts} snoozed={snoozed} />
      </section>

      {/* New matter — quieter than the queue; most intake arrives by email */}
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

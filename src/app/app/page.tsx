import Link from "next/link";
import { createMatterFromSubmission } from "../actions";
import { listMatters } from "@/lib/store";
import type { MatterStatus } from "@/lib/types";
import { isConfigured } from "@/lib/anthropic";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SubmissionForm } from "../submission-form";
import { Greeting } from "../greeting";
import { MatterRow, UsageMeter, StatsPanel } from "../ui";
import {
  requireAccount,
  getUsage,
  getCurrentMembership,
  intakeAddress,
} from "@/lib/metering";
import { getCurrentProfile } from "@/lib/profile";
import { getAccountRubrics } from "@/lib/rubric-store";
import { getReviewRollup, summariseChanges } from "@/lib/reviews";
import { listMembers } from "@/lib/team";
import { getMonthStats } from "@/lib/stats";

// The submission server action runs the pipeline (3 sequential Haiku calls,
// ~10-20s). Give the route headroom on Vercel (well under the 300s ceiling).
export const maxDuration = 60;

const SAMPLE = `Hi, my name is Priya Sharma and I'm hoping to apply for a spousal visa to stay with my partner. We started dating in June 2021 and got married on 2023-09-14. My partner's name is Daniel Okafor and he's a citizen here. I'm currently on a student visa and living in-country. I've attached my passport and some joint bills showing we live together.`;

const NEEDS_YOU: MatterStatus[] = ["ready_for_review", "ready_for_you"];


export default async function Dashboard() {
  const account = await requireAccount();
  const membership = await getCurrentMembership();
  const profile = await getCurrentProfile();
  const live = isConfigured();
  const db = isSupabaseConfigured();
  const usage = await getUsage(account);
  const stats = await getMonthStats(account.id, account.timezone);
  const intake = intakeAddress(account.inboundToken);
  const members = await listMembers(account.id);
  const blocked = usage.blocked;

  const needsYou = await listMatters(account.id, { status: NEEDS_YOU, limit: 50 });
  const hasOwnRubric = (await getAccountRubrics(account.id)).length > 0;
  const rollup = await getReviewRollup(account.id, 6);
  const firstName = profile?.name?.split(/\s+/)[0] ?? null;

  const labelFor = (uid: string | null) => {
    if (!uid) return null;
    const m = members.find((x) => x.userId === uid);
    return m ? m.name || m.email || "Teammate" : "Teammate";
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-serif text-2xl font-medium tracking-tight">
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
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-surface px-5 py-4 transition-colors hover:bg-inset"
        >
          <div>
            <div className="text-sm font-medium text-accent">Finish setting up Briefly</div>
            <div className="text-sm text-muted">
              Teach Briefly your first matter type — describe how you handle one enquiry and it builds
              your rulebook.
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-accent">Teach Briefly →</span>
        </Link>
      ) : null}

      {stats ? (
        <section className="space-y-2">
          <StatsPanel stats={stats} />
          <p className="text-xs text-muted">
            Time saved is an estimate — about 15 minutes of manual intake per matter (reading,
            structuring, spotting gaps, drafting the reply).
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Needs you</h2>
          <Link href="/app/matters" className="text-sm text-accent hover:text-accent-h">
            All matters →
          </Link>
        </div>
        {needsYou.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            You&apos;re all caught up. New intake will surface here the moment it&apos;s ready.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <ul className="divide-y divide-border">
              {needsYou.slice(0, 6).map((m) => (
                <li key={m.id}>
                  <MatterRow
                    matter={m}
                    assignee={labelFor(m.assignedTo)}
                    href={`/matters/${m.id}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {rollup.items.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Updated since your last review
            </h2>
            <span className="text-sm text-muted tabular-nums">
              {rollup.total} {rollup.total === 1 ? "matter" : "matters"}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-accent bg-surface">
            <ul className="divide-y divide-border">
              {rollup.items.map(({ matter, changes }) => (
                <li key={matter.id}>
                  <Link
                    href={`/matters/${matter.id}`}
                    className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-inset"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {matter.clientName ?? "Unnamed client"}
                        {matter.result ? (
                          <span className="font-normal text-muted"> · {matter.result.rubricName}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-accent">
                        {summariseChanges(changes)}
                        {changes.readinessDelta ? (
                          <span className="text-muted">
                            {" "}
                            · readiness {changes.readinessDelta.from}% → {changes.readinessDelta.to}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm text-muted">Review →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {intake ? (
        <section className="rounded-lg border border-border bg-inset px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Your intake address
          </div>
          <div className="mt-1 break-all font-mono text-sm">{intake}</div>
          <p className="mt-1 text-xs text-muted">
            Forward client enquiries here (or set up auto-forwarding) and Briefly turns each one into
            a matter automatically.
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">New matter</h2>
          <p className="max-w-2xl text-muted">
            Paste a client&apos;s raw enquiry. Briefly classifies it, extracts the facts, builds a
            timeline, flags what&apos;s missing, scores readiness, and drafts the follow-up — then
            hands it to you to approve.
          </p>
        </div>

        <UsageMeter usage={usage} />

        {blocked ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-4 text-sm">
            <p className="font-medium">You&apos;ve reached this month&apos;s limit.</p>
            <p className="mt-1 text-muted">
              Upgrade your plan or add a credit pack to keep processing intake. Until then, new
              submissions and inbound emails won&apos;t be processed.
            </p>
          </div>
        ) : (
          <SubmissionForm action={createMatterFromSubmission} sample={SAMPLE} />
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded-full border px-2.5 py-1 ${
              live ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {live ? "Live extraction (Haiku)" : "Demo mode — no API key (mock extraction)"}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
            {db ? "Supabase connected" : "In-memory store"}
          </span>
        </div>
      </section>
    </div>
  );
}

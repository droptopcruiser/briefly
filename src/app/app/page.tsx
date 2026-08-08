import Link from "next/link";
import { createMatterFromSubmission } from "../actions";
import { listMatters } from "@/lib/store";
import { isConfigured } from "@/lib/anthropic";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SubmissionForm } from "../submission-form";
import { ReadinessBadge, StatusBadge, UsageMeter, StatsPanel } from "../ui";
import { requireAccount, getUsage, getCurrentMembership, isManager, intakeAddress } from "@/lib/metering";
import { listMembers } from "@/lib/team";
import { getMonthStats } from "@/lib/stats";

// The submission server action runs the pipeline (3 sequential Haiku calls,
// ~10-20s). Give the route headroom on Vercel (well under the 300s ceiling).
export const maxDuration = 60;

const SAMPLE = `Hi, my name is Priya Sharma and I'm hoping to apply for a spousal visa to stay with my partner. We started dating in June 2021 and got married on 2023-09-14. My partner's name is Daniel Okafor and he's a citizen here. I'm currently on a student visa and living in-country. I've attached my passport and some joint bills showing we live together.`;

const TABS = [
  { key: "all", label: "All", href: "/app" },
  { key: "me", label: "Assigned to me", href: "/app?assignee=me" },
  { key: "unassigned", label: "Unassigned", href: "/app?assignee=unassigned" },
] as const;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string }>;
}) {
  const account = await requireAccount();
  const membership = await getCurrentMembership();
  const manager = isManager(membership?.role);
  const live = isConfigured();
  const db = isSupabaseConfigured();
  const usage = await getUsage(account);
  const stats = await getMonthStats(account.id, account.timezone);
  const intake = intakeAddress(account.inboundToken);
  const members = await listMembers(account.id);
  const blocked = usage.blocked;

  const sp = await searchParams;
  const view = sp?.assignee === "me" ? "me" : sp?.assignee === "unassigned" ? "unassigned" : "all";
  const assigneeFilter =
    view === "me" ? membership?.userId : view === "unassigned" ? "unassigned" : undefined;
  const matters = await listMatters(account.id, { assignee: assigneeFilter, limit: 20 });

  const labelFor = (uid: string | null) => {
    if (!uid) return null;
    const m = members.find((x) => x.userId === uid);
    return m ? m.name || m.email || "Teammate" : "Teammate";
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">This month</h1>
        {manager ? (
          <div className="flex items-center gap-2">
            <Link
              href="/app/team"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
            >
              Team →
            </Link>
            <Link
              href="/app/rubrics"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
            >
              Manage rubrics →
            </Link>
            <Link
              href="/app/settings"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
            >
              Settings →
            </Link>
          </div>
        ) : null}
      </div>

      {stats ? (
        <section className="space-y-2">
          <StatsPanel stats={stats} />
          <p className="text-xs text-muted">
            Time saved is an estimate — about 15 minutes of manual intake per matter (reading,
            structuring, spotting gaps, drafting the reply).
          </p>
        </section>
      ) : null}

      {intake ? (
        <section className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">Your intake address</div>
          <div className="mt-1 font-mono text-sm break-all">{intake}</div>
          <p className="mt-1 text-xs text-muted">
            Forward client enquiries here (or set up auto-forwarding) and Briefly turns each one into
            a matter automatically.
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">New submission</h2>
          <p className="text-muted max-w-2xl">
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
            className={`rounded-full px-2.5 py-1 border ${
              live ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {live ? "Live extraction (Haiku)" : "Demo mode — no API key (mock extraction)"}
          </span>
          <span className="rounded-full px-2.5 py-1 border border-border text-muted">
            {db ? "Supabase connected" : "In-memory store"}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Matters</h2>
          <div className="flex items-center gap-1 text-sm">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`rounded-md px-2.5 py-1 ${
                  view === t.key
                    ? "bg-surface font-medium text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
        {matters.length === 0 ? (
          <p className="text-muted text-sm">
            {view === "all" ? "No matters yet — submit one above." : "Nothing here."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {matters.map((m) => {
              const assignee = labelFor(m.assignedTo);
              return (
                <li key={m.id}>
                  <Link
                    href={`/matters/${m.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-background transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {m.clientName ?? "Unnamed client"}
                        {m.result ? (
                          <span className="text-muted font-normal"> · {m.result.rubricName}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {assignee ? `${assignee} · ` : ""}
                        {m.submission.slice(0, 80)}…
                      </div>
                    </div>
                    {m.result ? <ReadinessBadge value={m.result.readiness} /> : null}
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

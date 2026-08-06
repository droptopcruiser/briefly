import Link from "next/link";
import { createMatterFromSubmission } from "../actions";
import { listMatters } from "@/lib/store";
import { isConfigured } from "@/lib/anthropic";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SubmissionForm } from "../submission-form";
import { ReadinessBadge, StatusBadge, UsageMeter } from "../ui";
import { requireUser } from "@/lib/auth";
import { getAccountUsage } from "@/lib/metering";

// The submission server action runs the pipeline (3 sequential Haiku calls,
// ~10-20s). Give the route headroom on Vercel (well under the 300s ceiling).
export const maxDuration = 60;

const SAMPLE = `Hi, my name is Priya Sharma and I'm hoping to apply for a spousal visa to stay with my partner. We started dating in June 2021 and got married on 2023-09-14. My partner's name is Daniel Okafor and he's a citizen here. I'm currently on a student visa and living in-country. I've attached my passport and some joint bills showing we live together.`;

export default async function Dashboard() {
  await requireUser();
  const matters = await listMatters(20);
  const live = isConfigured();
  const db = isSupabaseConfigured();
  const au = await getAccountUsage();
  const blocked = au?.usage.blocked ?? false;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">New submission</h1>
          <p className="text-muted max-w-2xl">
            Paste a client&apos;s raw enquiry. Briefly classifies it, extracts the facts, builds a
            timeline, flags what&apos;s missing, scores readiness, and drafts the follow-up — then
            hands it to you to approve.
          </p>
        </div>

        {au ? <UsageMeter usage={au.usage} /> : null}

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
        <h2 className="text-lg font-semibold tracking-tight">Matters</h2>
        {matters.length === 0 ? (
          <p className="text-muted text-sm">No matters yet — submit one above.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {matters.map((m) => (
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
                    <div className="text-xs text-muted truncate">{m.submission.slice(0, 90)}…</div>
                  </div>
                  {m.result ? <ReadinessBadge value={m.result.readiness} /> : null}
                  <StatusBadge status={m.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

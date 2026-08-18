import Link from "next/link";
import type { Matter, Rubric } from "@/lib/types";
import type { WorkBrief } from "@/lib/work-brief";
import { workflowStatus, statusTone, firstSentence } from "@/lib/matter-status";
import { StatusChip } from "@/app/ui";

/**
 * The lead matter — the one thing that most needs the professional right now, given
 * full weight instead of another identical row. It carries the decision: the
 * workflow status, the client (editorial serif), the "Briefly noticed" consequence,
 * and the next decision, with one clear way in. Weight = priority; the rest of the
 * queue compresses to quiet rows beneath.
 */
export function LeadMatterCard({
  matter,
  brief,
  rubric,
  assignee,
  href,
}: {
  matter: Matter;
  brief: WorkBrief | null;
  rubric: Rubric | undefined;
  assignee?: string | null;
  href: string;
}) {
  const r = matter.result;
  const rawInsight = brief?.content.insight;
  const insight =
    rawInsight && typeof rawInsight === "object" && rawInsight.consequence ? rawInsight : null;

  const status = workflowStatus(matter, rubric, false);
  const oneLiner = insight?.consequence || (r ? firstSentence(r.summary) : "");
  const decision =
    brief?.content.suggestedNextStep?.trim() || rubric?.nextActionIntent?.trim() || null;

  return (
    <Link
      href={href}
      className="lift group block overflow-hidden rounded-xl border border-accent/30 bg-surface p-5 shadow-[var(--shadow)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label={status} tone={statusTone(matter)} />
        {assignee ? <span className="text-xs text-muted">{assignee}</span> : null}
      </div>

      <h2 className="mt-3 font-serif text-2xl font-medium leading-tight tracking-tight">
        {matter.clientName ?? "Unnamed client"}
      </h2>
      {r ? <div className="mt-0.5 text-sm text-muted">{r.rubricName}</div> : null}

      {oneLiner ? (
        <div className="mt-3">
          {insight ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">
              Briefly noticed
            </div>
          ) : null}
          <p className="mt-1 font-serif text-lg leading-snug text-foreground/90">{oneLiner}</p>
        </div>
      ) : null}

      {decision ? (
        <p className="mt-2 text-sm">
          <span className="font-semibold text-accent">Decision now:</span> {decision}
        </p>
      ) : null}

      <div className="mt-4">
        <span className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-transform group-hover:translate-x-0.5">
          Open matter →
        </span>
      </div>
    </Link>
  );
}

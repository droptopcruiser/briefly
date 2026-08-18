import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatterById } from "@/lib/store";
import type { Matter } from "@/lib/types";
import { approveMatter, approveAndSendMatter } from "@/app/actions";
import { ReadinessBadge, ReadinessMeter, StatusBadge } from "@/app/ui";
import { ApproveButton } from "@/app/approve-button";
import { DraftActions } from "@/app/draft-actions";
import { BriefPanel } from "@/app/brief-panel";
import { ConsultationPanel } from "@/app/consultation-panel";
import { SinceReviewCard } from "@/app/since-review-card";
import { AssignControl } from "@/app/assign-control";
import { requireAccount, type Account } from "@/lib/metering";
import { listMembers } from "@/lib/team";
import { listEvents } from "@/lib/events";
import { getActiveBrief, isBriefStale } from "@/lib/work-brief";
import { getActivePacket, isPacketStale } from "@/lib/consultation-packet";
import { getBaselineReview, computeMatterChanges } from "@/lib/reviews";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { getClientContext } from "@/lib/clients";
import { assignMatter, markMatterReviewed } from "@/app/actions";
import { composeEmailBody } from "@/lib/email";

/**
 * Evidence over confidence: show how much of the matter is backed by source
 * material and how much needs a human eye (carried-forward or unsourced facts),
 * instead of an unexplained confidence percentage.
 */
function evidenceLabel(
  fields: { present: boolean; value: string | null; source: string | null; carried?: boolean }[],
): string {
  const sourced = fields.filter((f) => f.present && f.value && f.source && !f.carried).length;
  const review = fields.filter((f) => f.present && f.value && (f.carried || !f.source)).length;
  const parts = [`${sourced} ${sourced === 1 ? "fact" : "facts"} sourced`];
  if (review > 0) parts.push(`${review} ${review === 1 ? "item needs" : "items need"} your review`);
  return parts.join(" · ");
}

/**
 * Matter detail. Only the essentials (account + the matter row) block the first
 * render — the header, extracted facts, timeline, and gaps all come from
 * `matter.result`, so they paint as soon as the row loads. Everything that needs
 * further queries (assignee, returning-client context, the "since review" diff,
 * the prepared-work artifact, the activity trail) streams in behind its own
 * Suspense boundary, so no secondary query blocks the first useful view.
 */

// --- Deferred, independently-streamed sections ------------------------------

async function AssignSection({ matter }: { matter: Matter }) {
  const t = Date.now();
  const members = await listMembers(matter.accountId ?? "");
  console.log(`[matter-timing] listMembers ms=${Date.now() - t}`);
  const options = members.map((m) => ({ userId: m.userId, label: m.name || m.email || "Teammate" }));
  return (
    <AssignControl
      matterId={matter.id}
      members={options}
      current={matter.assignedTo}
      action={assignMatter}
    />
  );
}

async function SinceReviewSection({ matter, accountId }: { matter: Matter; accountId: string }) {
  const t = Date.now();
  const [baseline, rubrics] = await Promise.all([
    getBaselineReview(matter.id),
    getEffectiveRubrics(accountId),
  ]);
  console.log(`[matter-timing] since-review (baseline+rubrics) ms=${Date.now() - t}`);
  if (!baseline) return null;
  const rubric = rubrics.find((x) => x.id === matter.result?.rubricId);
  const changes = computeMatterChanges(matter, baseline.snapshot, rubric);

  const brief = matter.result && !matter.result.draftEmail ? await getActiveBrief(matter.id) : null;
  const briefStale = brief ? isBriefStale(brief, matter) : false;
  const needsAttention =
    brief && briefStale
      ? "A client reply has arrived since the brief was prepared — refresh it to include the new information."
      : changes.readinessDelta && changes.readinessDelta.to < changes.readinessDelta.from
        ? `Readiness fell from ${changes.readinessDelta.from}% to ${changes.readinessDelta.to}% since the last review.`
        : null;
  if (!changes.hasChanges && !needsAttention) return null;

  return (
    <SinceReviewCard
      id={matter.id}
      changes={changes}
      needsAttention={needsAttention}
      markReviewedAction={markMatterReviewed}
    />
  );
}

async function ReturningClientSection({ matter }: { matter: Matter }) {
  if (!matter.clientEmail) return null;
  const t = Date.now();
  const ctx = await getClientContext(matter.accountId ?? "", matter.clientEmail, matter.id);
  console.log(`[matter-timing] clientContext ms=${Date.now() - t}`);
  if (!ctx || ctx.priorCount === 0) return null;
  const carriedCount = matter.result?.fields.filter((f) => f.carried).length ?? 0;
  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-accent bg-surface px-4 py-3">
      <div>
        <div className="text-sm font-medium">
          Returning client · {matter.result?.clientName ?? "Client"} · {ctx.priorCount} previous{" "}
          {ctx.priorCount === 1 ? "matter" : "matters"}
        </div>
        {carriedCount > 0 ? (
          <div className="text-xs text-muted">
            Briefly used {carriedCount} known {carriedCount === 1 ? "fact" : "facts"} from previous
            matters.
          </div>
        ) : null}
      </div>
      {ctx.client ? (
        <Link
          href={`/app/clients/${ctx.client.id}`}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset"
        >
          View client →
        </Link>
      ) : null}
    </section>
  );
}

async function PreparedWorkSection({ matter, account }: { matter: Matter; account: Account }) {
  const r = matter.result!;

  // Path A — a missing-info follow-up to review and send.
  if (r.draftEmail) {
    const alreadySent =
      (matter.status === "awaiting_client" && !matter.lastNudgedAt) || matter.status === "completed";
    const body = alreadySent
      ? r.draftEmail.body
      : composeEmailBody(r.draftEmail.body, { signature: account.emailSignature, firmName: account.name });
    return (
      <DraftActions
        id={matter.id}
        to={r.draftEmail.to}
        initialSubject={r.draftEmail.subject}
        initialBody={body}
        approved={alreadySent}
        action={approveAndSendMatter}
      />
    );
  }

  // Path B — the matter is ready → the Initial Work Brief (+ consultation packet).
  const t = Date.now();
  const [brief, rubrics, packet] = await Promise.all([
    getActiveBrief(matter.id),
    getEffectiveRubrics(account.id),
    getActivePacket(matter.id),
  ]);
  console.log(`[matter-timing] prepared-work (brief+rubrics+packet) ms=${Date.now() - t}`);
  const rubric = rubrics.find((x) => x.id === r.rubricId);
  const briefsEnabled = !brief ? !rubric || rubric.prepareBriefWhenReady !== false : true;
  const briefStale = brief ? isBriefStale(brief, matter) : false;

  // Once a matter is ready, the professional can book a consultation and get a
  // pre-consultation packet — the next lifecycle step after the brief.
  const showConsultation = matter.status === "ready_for_you" || matter.status === "in_progress";
  const consultation = showConsultation ? (
    <ConsultationPanel
      matterId={matter.id}
      initialConsultationAt={matter.consultationAt}
      initialPacket={packet}
      initialStale={packet ? isPacketStale(packet, matter) : false}
    />
  ) : null;

  if (briefsEnabled) {
    return (
      <div className="space-y-6">
        <BriefPanel
          matterId={matter.id}
          clientEmail={matter.clientEmail}
          initialBrief={brief}
          initialStatus={matter.status}
          initialStale={briefStale}
          briefsEnabled={briefsEnabled}
        />
        {consultation}
      </div>
    );
  }
  if (matter.status === "completed") {
    return (
      <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
        ✓ Matter completed.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
          100% ready — nothing missing. Ready for you to review.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <ApproveButton id={matter.id} approved={false} action={approveMatter} />
          <span className="text-xs text-muted">Human gate — Briefly never acts on its own.</span>
        </div>
      </div>
      {consultation}
    </div>
  );
}

async function ActivitySection({ matterId }: { matterId: string }) {
  const t = Date.now();
  const events = await listEvents(matterId);
  console.log(`[matter-timing] listEvents ms=${Date.now() - t}`);
  if (events.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
      <ol className="relative space-y-4 border-l border-border pl-5">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
            <div className="text-sm">{e.detail ?? e.type}</div>
            <div className="text-xs text-muted tabular-nums">
              {new Date(e.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-border" aria-label={label} />
      <div className="h-24 w-full animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}

// --- Page: only account + matter block the first paint ----------------------

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await params;
  // Resolve the account (auth waterfall) and the matter row IN PARALLEL — the
  // matter query no longer waits on the auth chain. Tenant isolation is verified
  // immediately after (accountId must match), so an unowned id is not-found.
  const [account, matter] = await Promise.all([requireAccount(), getMatterById(id)]);
  console.log(`[matter-timing] essential (account+matter, parallel) ms=${Date.now() - t0}`);
  if (!matter || !matter.result || matter.accountId !== account.id) notFound();

  const r = matter.result;

  // A chase Briefly drafted for a stuck matter — awaiting_client + a pending nudge.
  const pendingChase = matter.status === "awaiting_client" && !!matter.lastNudgedAt;
  const daysWaiting = pendingChase
    ? Math.max(1, Math.round((Date.now() - new Date(matter.updatedAt ?? matter.createdAt).getTime()) / 86_400_000))
    : 0;

  return (
    <div className="space-y-8">
      <Link href="/app/matters" className="text-sm text-muted hover:text-foreground">
        ← Matters
      </Link>

      {/* Since the last review — deferred, shows only when there's a baseline + changes */}
      <Suspense fallback={null}>
        <SinceReviewSection matter={matter} accountId={account.id} />
      </Suspense>

      {/* Header — paints immediately from the matter row */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{r.clientName ?? "Unnamed client"}</h1>
          <ReadinessBadge value={r.readiness} />
          <StatusBadge status={matter.status} />
          <div className="ml-auto flex items-center gap-2">
            <form action={markMatterReviewed}>
              <input type="hidden" name="id" value={matter.id} />
              <button
                type="submit"
                title="Snapshot the matter as it stands, so Briefly can show what changes next"
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-inset hover:text-foreground"
              >
                Mark reviewed
              </button>
            </form>
            <Suspense fallback={<div className="h-8 w-28 animate-pulse rounded-md bg-inset" />}>
              <AssignSection matter={matter} />
            </Suspense>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span>
            {r.rubricName} · {r.vertical}
          </span>
          <span>{evidenceLabel(r.fields)}</span>
          {r.clientEmail ? <span>{r.clientEmail}</span> : null}
        </div>
        <p className="max-w-2xl">{r.summary}</p>
        <ReadinessMeter value={r.readiness} className="max-w-2xl" />
      </header>

      {/* Returning client — deferred */}
      <Suspense fallback={null}>
        <ReturningClientSection matter={matter} />
      </Suspense>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Extracted facts */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Extracted facts</h2>
          <dl className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.fields.map((f) => (
              <div key={f.key} className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                {f.present ? (
                  <>
                    <dd className="font-medium">{f.value}</dd>
                    {f.carried ? (
                      <dd className="mt-1 text-xs text-muted">📎 {f.source}</dd>
                    ) : (
                      <>
                        {f.source ? (
                          <dd className="mt-1 text-xs text-muted italic">“{f.source}”</dd>
                        ) : null}
                        <dd className="mt-0.5 text-xs text-accent">✓ Provided in current enquiry</dd>
                      </>
                    )}
                  </>
                ) : (
                  <dd className="text-muted italic">— missing</dd>
                )}
              </div>
            ))}
          </dl>
        </section>

        {/* Timeline */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
          {r.timeline.length === 0 ? (
            <p className="text-sm text-muted">No dated events found.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {r.timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
                  <div className="text-sm font-medium tabular-nums">{e.date || "Undated"}</div>
                  <div className="text-sm">{e.description}</div>
                  {e.source ? (
                    <div className="mt-0.5 text-xs text-muted italic">“{e.source}”</div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Gaps */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Gaps <span className="text-muted font-normal text-base">({r.gaps.length} missing)</span>
        </h2>
        {r.gaps.length === 0 ? (
          <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
            Every required fact and document is present — this matter is ready. The prepared brief is
            below.
          </p>
        ) : (
          <ul className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.gaps.map((g) => (
              <li key={g.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="rounded px-1.5 py-0.5 text-xs border border-border text-muted uppercase">
                  {g.kind}
                </span>
                <span className="font-medium">{g.label}</span>
                <span className="text-muted">— {g.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Next step / prepared work — deferred (needs the brief artifact) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {r.draftEmail ? "Drafted next step" : "Prepared work"}
        </h2>
        {pendingChase ? (
          <div className="rounded-lg border border-awaiting bg-surface px-4 py-3 text-sm">
            <p className="font-medium">
              Briefly noticed this has been waiting {daysWaiting}{" "}
              {daysWaiting === 1 ? "day" : "days"} since your last message.
            </p>
            <p className="mt-1 text-muted">A follow-up is ready below — review and send it.</p>
          </div>
        ) : null}
        <Suspense fallback={<SectionSkeleton label="Preparing view" />}>
          <PreparedWorkSection matter={matter} account={account} />
        </Suspense>
      </section>

      {/* Activity trail — deferred, lowest priority */}
      <Suspense fallback={null}>
        <ActivitySection matterId={matter.id} />
      </Suspense>
    </div>
  );
}

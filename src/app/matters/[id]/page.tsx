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
import { MatterTabs, GoToTab } from "@/app/matter-tabs";
import type { Rubric } from "@/lib/types";
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

/** First sentence of a summary, capped — the "what's happening now" line. */
function firstSentence(text: string): string {
  const t = (text ?? "").trim();
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  const s = (m ? m[1] : t).trim();
  return s.length > 200 ? s.slice(0, 197) + "…" : s;
}

/**
 * A workflow status derived from the rulebook's intended next action, not a flat
 * "100% ready" — what the professional should DO, in their own terms.
 */
function workflowStatus(
  matter: Matter,
  rubric: Rubric | undefined,
  hasUpcoming: boolean,
  hasPacket: boolean,
): string {
  const intent = rubric?.nextActionIntent?.trim();
  switch (matter.status) {
    case "ready_for_review": {
      const n = matter.result?.gaps.length ?? 0;
      return n <= 1 ? "Waiting on one client detail" : `Waiting on ${n} client details`;
    }
    case "awaiting_client":
      return matter.lastNudgedAt ? "Follow-up ready to send" : "Waiting on the client";
    case "ready_for_you":
      if (hasUpcoming) return "Ready for the consultation";
      return intent ? `Ready — ${intent}` : "Ready for your review";
    case "in_progress":
      if (hasUpcoming && hasPacket) return "Ready for the meeting";
      return intent ? `In progress — ${intent}` : "In progress";
    case "completed":
      return "Completed";
    default:
      return "In progress";
  }
}

/**
 * THE "NOW" — the matter's centre of gravity. A compact synthesis at the top of the
 * page: what's happening now, what's next, the workflow status, a preview of the
 * most valuable prepared action, and a single button into the tab where it lives.
 * Not another long summary — it carries the decision; the tabs carry the detail.
 */
async function OverviewSection({ matter, account }: { matter: Matter; account: Account }) {
  const r = matter.result!;
  const [brief, packet, rubrics] = await Promise.all([
    r.draftEmail ? Promise.resolve(null) : getActiveBrief(matter.id),
    getActivePacket(matter.id),
    getEffectiveRubrics(account.id),
  ]);
  const rubric = rubrics.find((x) => x.id === r.rubricId);
  const upcoming =
    !!matter.consultationAt && new Date(matter.consultationAt).getTime() > Date.now();
  const status = workflowStatus(matter, rubric, upcoming, !!packet);

  const insight = brief?.content.insight?.trim() || null;
  const now = firstSentence(r.summary);
  const next =
    brief?.content.suggestedNextStep?.trim() ||
    rubric?.nextActionIntent?.trim() ||
    (r.draftEmail
      ? "Review and send the follow-up to the client."
      : matter.status === "completed"
        ? "This matter is complete."
        : "Review what Briefly has prepared.");

  const messagePreview =
    r.draftEmail?.body?.trim() || brief?.content.suggestedClientMessage?.trim() || null;
  const messageLabel = r.draftEmail ? "Prepared follow-up" : "Prepared client message";

  // What Briefly prepared, and the next expected transition.
  const prepared: string[] = [];
  if (r.draftEmail) prepared.push("a client follow-up");
  if (brief) prepared.push("an Initial Work Brief");
  if (packet) prepared.push("a consultation plan");
  const preparedLine =
    prepared.length > 0
      ? `Briefly prepared ${prepared.length === 1 ? prepared[0] : prepared.slice(0, -1).join(", ") + " and " + prepared.slice(-1)}.`
      : null;
  const transition =
    matter.status === "ready_for_review"
      ? "You send the follow-up → the client replies → Briefly re-scores."
      : matter.status === "awaiting_client"
        ? "The client replies → Briefly re-scores and prepares the next step."
        : matter.status === "ready_for_you"
          ? "You approve → the work begins."
          : matter.status === "in_progress"
            ? upcoming
              ? "You run the meeting → add notes to move the matter forward."
              : "You prepare the consultation, or complete the matter."
            : null;

  const completed = matter.status === "completed";

  return (
    <section className="space-y-4 rounded-xl border border-accent bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
          {status}
        </span>
        {upcoming && matter.consultationAt ? (
          <span className="text-sm text-muted">
            Consultation {new Date(matter.consultationAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      {/* Briefly noticed — the signature interpretation, leads the "Now". */}
      {insight ? (
        <div className="rounded-lg border-l-4 border-accent bg-accent/5 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Briefly noticed</div>
          <p className="mt-1 text-[15px] leading-relaxed">{insight}</p>
          {!completed ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold">Recommended next step:</span> {next}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-base">{now}</p>
          {!completed ? (
            <p className="text-base">
              <span className="font-semibold">Next:</span> {next}
            </p>
          ) : null}
        </div>
      )}

      {messagePreview && !completed ? (
        <div className="rounded-lg border border-border bg-inset px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{messageLabel}</div>
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-foreground/90">
            {messagePreview}
          </p>
        </div>
      ) : null}

      {!completed ? (
        <div className="flex flex-wrap items-center gap-3">
          {r.draftEmail ? (
            <GoToTab tab="next">Review &amp; send the follow-up →</GoToTab>
          ) : messagePreview ? (
            <GoToTab tab="next">Review &amp; send the message →</GoToTab>
          ) : (
            <GoToTab tab="next">Review the next step →</GoToTab>
          )}
          {!r.draftEmail ? (
            <GoToTab tab="plan" variant="secondary">
              {packet
                ? upcoming
                  ? "Open consultation plan"
                  : "Open consultation plan"
                : "Prepare consultation plan"}
            </GoToTab>
          ) : null}
        </div>
      ) : null}

      {preparedLine || transition ? (
        <p className="text-xs text-muted">
          {preparedLine ? <span>{preparedLine} </span> : null}
          {transition ? <span>{transition}</span> : null}
        </p>
      ) : null}
    </section>
  );
}

/**
 * NEXT STEP — the current decision. Path A (missing info) is the drafted follow-up
 * to review and send; Path B (ready) is the Initial Work Brief, reframed to lead
 * with the next step and NOT reprint the facts (those live in the record).
 */
async function NextStepSection({ matter, account }: { matter: Matter; account: Account }) {
  const r = matter.result!;

  // A chase Briefly drafted for a stuck matter — awaiting_client + a pending nudge.
  const pendingChase = matter.status === "awaiting_client" && !!matter.lastNudgedAt;
  const daysWaiting = pendingChase
    ? Math.max(1, Math.round((Date.now() - new Date(matter.updatedAt ?? matter.createdAt).getTime()) / 86_400_000))
    : 0;
  const chaseNotice = pendingChase ? (
    <div className="rounded-lg border border-awaiting bg-surface px-4 py-3 text-sm">
      <p className="font-medium">
        Briefly noticed this has been waiting {daysWaiting} {daysWaiting === 1 ? "day" : "days"} since
        your last message.
      </p>
      <p className="mt-1 text-muted">A follow-up is ready below — review and send it.</p>
    </div>
  ) : null;

  // Path A — a missing-info follow-up to review and send.
  if (r.draftEmail) {
    const alreadySent =
      (matter.status === "awaiting_client" && !matter.lastNudgedAt) || matter.status === "completed";
    const body = alreadySent
      ? r.draftEmail.body
      : composeEmailBody(r.draftEmail.body, { signature: account.emailSignature, firmName: account.name });
    return (
      <div className="space-y-4">
        {chaseNotice}
        <DraftActions
          id={matter.id}
          to={r.draftEmail.to}
          initialSubject={r.draftEmail.subject}
          initialBody={body}
          approved={alreadySent}
          action={approveAndSendMatter}
        />
      </div>
    );
  }

  // Path B — the matter is ready → the Initial Work Brief.
  const t = Date.now();
  const [brief, rubrics] = await Promise.all([
    getActiveBrief(matter.id),
    getEffectiveRubrics(account.id),
  ]);
  console.log(`[matter-timing] next-step (brief+rubrics) ms=${Date.now() - t}`);
  const rubric = rubrics.find((x) => x.id === r.rubricId);
  const briefsEnabled = !brief ? !rubric || rubric.prepareBriefWhenReady !== false : true;
  const briefStale = brief ? isBriefStale(brief, matter) : false;

  if (briefsEnabled) {
    return (
      <BriefPanel
        matterId={matter.id}
        clientEmail={matter.clientEmail}
        initialBrief={brief}
        initialStatus={matter.status}
        initialStale={briefStale}
        briefsEnabled={briefsEnabled}
      />
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
    <div>
      <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
        100% ready — nothing missing. Ready for you to review.
      </p>
      <div className="flex items-center gap-3 pt-1">
        <ApproveButton id={matter.id} approved={false} action={approveMatter} />
        <span className="text-xs text-muted">Human gate — Briefly never acts on its own.</span>
      </div>
    </div>
  );
}

/**
 * CONSULTATION PLAN — always available. If no plan exists yet it shows the prepare
 * prompt (date optional); for an incomplete matter it plans around what's known and
 * surfaces the gaps rather than pretending the matter is done.
 */
async function ConsultationPlanSection({ matter }: { matter: Matter }) {
  const r = matter.result!;
  const packet = await getActivePacket(matter.id);
  return (
    <ConsultationPanel
      matterId={matter.id}
      initialConsultationAt={matter.consultationAt}
      initialPacket={packet}
      initialStale={packet ? isPacketStale(packet, matter) : false}
      incomplete={r.readiness < 100}
      missing={r.gaps.map((g) => ({ label: g.label, kind: g.kind }))}
    />
  );
}

/** Prettify a rubric document key when no label is to hand (e.g. "title_deed"). */
function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * MATTER RECORD — the single source of truth: source-backed facts, documents,
 * timeline, and gaps. Every other view references these without repeating them.
 */
function RecordPanel({ matter }: { matter: Matter }) {
  const r = matter.result!;
  const outstandingDocs = r.gaps.filter((g) => g.kind === "document");
  return (
    <div className="space-y-8">
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

      {/* Documents */}
      {r.documentsPresent.length > 0 || outstandingDocs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Documents</h2>
          <ul className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.documentsPresent.map((k) => (
              <li key={k} className="flex items-center gap-2 px-4 py-3 text-sm">
                <span className="text-accent">✓</span>
                <span className="font-medium">{humanizeKey(k)}</span>
                <span className="text-xs text-muted">provided</span>
              </li>
            ))}
            {outstandingDocs.map((g) => (
              <li key={g.key} className="flex items-center gap-2 px-4 py-3 text-sm">
                <span className="text-awaiting">○</span>
                <span>{g.label}</span>
                <span className="text-xs text-muted">outstanding</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Gaps */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Gaps <span className="text-muted font-normal text-base">({r.gaps.length} missing)</span>
        </h2>
        {r.gaps.length === 0 ? (
          <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
            Every required fact and document is present — this matter is ready.
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

      {/* Activity trail — deferred, lowest priority */}
      <Suspense fallback={null}>
        <ActivitySection matterId={matter.id} />
      </Suspense>
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

  // Smart default: open on Next step; but if a plan-worthy consultation is coming
  // up, open on the Consultation plan (the moment that matters right now). A past
  // consultation returns to Next step — the matter needs a fresh decision.
  const upcomingConsult =
    !!matter.consultationAt && new Date(matter.consultationAt).getTime() > Date.now();
  const defaultTab = upcomingConsult ? "plan" : "next";

  const tabs = [
    { id: "record", label: "Matter record", node: <RecordPanel matter={matter} /> },
    {
      id: "next",
      label: "Next step",
      node: (
        <Suspense fallback={<SectionSkeleton label="Preparing next step" />}>
          <NextStepSection matter={matter} account={account} />
        </Suspense>
      ),
    },
    {
      id: "plan",
      label: "Consultation plan",
      node: (
        <Suspense fallback={<SectionSkeleton label="Preparing consultation plan" />}>
          <ConsultationPlanSection matter={matter} />
        </Suspense>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Link href="/app/matters" className="text-sm text-muted hover:text-foreground">
        ← Matters
      </Link>

      {/* Since the last review — deferred, shows only when there's a baseline + changes */}
      <Suspense fallback={null}>
        <SinceReviewSection matter={matter} accountId={account.id} />
      </Suspense>

      {/* Pinned header — the matter's identity, always visible above the tabs */}
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
          {matter.consultationAt ? (
            <span>Consultation: {new Date(matter.consultationAt).toLocaleString()}</span>
          ) : null}
          {r.clientEmail ? <span>{r.clientEmail}</span> : null}
        </div>
        <ReadinessMeter value={r.readiness} className="max-w-2xl" />
      </header>

      {/* Returning client — deferred */}
      <Suspense fallback={null}>
        <ReturningClientSection matter={matter} />
      </Suspense>

      {/* The "Now" — the matter's centre of gravity, above the tabs */}
      <Suspense
        fallback={<div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface" />}
      >
        <OverviewSection matter={matter} account={account} />
      </Suspense>

      {/* One source of truth, three contextual views */}
      <MatterTabs tabs={tabs} defaultTab={defaultTab} />
    </div>
  );
}

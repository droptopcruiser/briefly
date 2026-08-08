import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { PLANS, CREDIT_PACK } from "@/lib/plans";
import { WaitlistForm } from "@/app/waitlist-form";
import { joinWaitlist } from "@/app/waitlist-actions";

const VERTICALS = [
  { name: "Family Law", items: ["Marriage certificate", "Children", "Assets", "Separation date"] },
  { name: "Veterinary", items: ["Pet name", "Species", "Vaccination history", "Symptoms"] },
  { name: "Accounting", items: ["Tax year", "Business type", "Bank statements", "GST status"] },
];

const FLOW = [
  "A client emails you.",
  "Briefly recognises which of your workflows applies.",
  "Extracts everything that workflow requires.",
  "Shows you exactly what's missing.",
  "Drafts the follow-up for the missing items.",
  "You review and approve.",
];

// The "moment" — what you open to instead of a pile of unread email.
const OPENS_TO = [
  { n: "7", label: "matters ready to review" },
  { n: "2", label: "waiting on documents" },
  { n: "4", label: "follow-ups drafted" },
];

const COMPARISON = [
  ["Generic AI", "Briefly"],
  ["One fixed prompt", "Your own intake types"],
  ["Generic extraction", "The fields you require"],
  ["A loose summary", "A readiness score, computed"],
  ["Unstructured text", "A structured, reviewed matter"],
  ["Invents missing context", "Every fact backed by a source quote"],
];

const OUTCOMES = [
  ["You never manually create another matter", "Every enquiry arrives already structured and classified."],
  ["Every matter starts complete", "Missing facts and documents are flagged before you open it."],
  ["Clients get faster, consistent replies", "The follow-up is drafted the moment the enquiry lands."],
];

const PRICING = [PLANS.trial, PLANS.solo, PLANS.practice, PLANS.firm];

export default async function Landing() {
  const user = await getAuthUser();
  if (user) redirect("/app");

  return (
    <div className="space-y-28 pb-10">
      {/* Hero */}
      <section className="pt-10 sm:pt-16 flex flex-col items-center text-center gap-6">
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
          Prepared before you open it
        </span>
        <h1 className="max-w-3xl text-4xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
          Arrive to work
          <br />
          that&apos;s ready.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Briefly prepares your work before you get to it — the way <em>your</em> firm works. Client
          emails arrive as structured, review-ready matters, waiting the moment you sit down.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Start free
          </Link>
          <a
            href="#how"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface"
          >
            See how it works
          </a>
        </div>
        <p className="text-xs text-muted">
          Invite-only during early access —{" "}
          <a href="#waitlist" className="underline underline-offset-2 hover:text-foreground">
            join the waitlist
          </a>
          .
        </p>
      </section>

      {/* The moment — what you open to instead of an inbox */}
      <section id="moment" className="space-y-8 scroll-mt-20">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            You don&apos;t open an inbox. You open your work.
          </h2>
          <p className="text-muted max-w-xl mx-auto">
            Overnight, Briefly did the preparation. This is what&apos;s waiting when you sit down.
          </p>
        </div>
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2 sm:items-stretch">
          {/* The old way */}
          <div className="rounded-xl border border-border bg-surface/50 p-6 flex flex-col justify-center">
            <div className="text-xs uppercase tracking-wide text-muted">Without Briefly</div>
            <div className="mt-3 text-4xl font-semibold tabular-nums text-muted">43</div>
            <div className="text-sm text-muted">unread emails to triage</div>
          </div>
          {/* The Briefly way */}
          <div className="rounded-xl border border-accent bg-surface p-6 space-y-3">
            <div className="text-xs uppercase tracking-wide text-accent">With Briefly</div>
            <ul className="space-y-2">
              {OPENS_TO.map((o) => (
                <li key={o.label} className="flex items-baseline gap-3">
                  <span className="text-2xl font-semibold tabular-nums text-accent w-8 shrink-0">
                    {o.n}
                  </span>
                  <span className="text-sm">{o.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* The differentiator — right away */}
      <section className="space-y-6 text-center">
        <div className="space-y-3 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            Teach Briefly how your business works.
          </h2>
          <p className="text-muted">
            Show it once — the facts you capture, the documents you require, what &ldquo;complete&rdquo;
            means for you. From then on, every client email follows your workflow automatically.
            Most AI makes you adapt to it. Briefly adapts to you.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {["Your required fields", "Your required documents", "What counts as complete"].map((t) => (
            <span key={t} className="rounded-full border border-border bg-surface px-3 py-1.5">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Proof — three verticals */}
      <section className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {VERTICALS.map((v) => (
            <div key={v.name} className="rounded-xl border border-border bg-surface p-5 space-y-3">
              <div className="text-sm font-semibold">{v.name}</div>
              <ul className="space-y-1.5">
                {v.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-sm text-muted">
                    <span className="text-accent">✓</span>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-base font-medium">
          Same AI engine. Different intake. <span className="text-accent">No code.</span>
        </p>
      </section>

      {/* The flow — the workflow is the hero */}
      <section id="how" className="space-y-8 scroll-mt-20">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">From inbox to reviewed matter</h2>
          <p className="text-muted max-w-xl mx-auto">
            The workflow does the work. You just approve the result.
          </p>
        </div>
        <ol className="mx-auto max-w-2xl space-y-2">
          {FLOW.map((step, i) => (
            <li
              key={i}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-fg tabular-nums">
                {i + 1}
              </span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Why Briefly — comparison */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Most AI summarizes email. Briefly understands your business.
        </h2>
        <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-border">
          {COMPARISON.map(([a, b], i) => (
            <div
              key={i}
              className={`grid grid-cols-2 ${i === 0 ? "bg-surface font-medium" : "bg-surface/50"} ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <div className={`px-4 py-3 text-sm ${i === 0 ? "" : "text-muted"}`}>{a}</div>
              <div
                className={`border-l border-border px-4 py-3 text-sm ${
                  i === 0 ? "text-accent" : "font-medium"
                }`}
              >
                {b}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Outcomes — what you become */}
      <section className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {OUTCOMES.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-5 space-y-2">
              <h3 className="font-medium text-balance">{title}</h3>
              <p className="text-sm text-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Vision seed */}
      <section className="rounded-2xl border border-border bg-surface p-8 sm:p-12 text-center space-y-4">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
          Email is where conversations begin.
          <br className="hidden sm:block" /> Briefly is where work begins.
        </h2>
        <p className="text-muted max-w-xl mx-auto">
          Today that work arrives by email. Tomorrow it&apos;s forms, voice, and messages too — all
          prepared the same way, in your workflow, before you get to it.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="space-y-8 scroll-mt-20">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Simple, metered pricing</h2>
          <p className="text-muted max-w-xl mx-auto">
            Every plan includes a set number of matters each month, with credit packs for overage —
            no surprise bills.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING.map((plan) => {
            const featured = plan.id === "solo";
            return (
              <div
                key={plan.id}
                className={`rounded-xl border bg-surface p-5 flex flex-col gap-4 ${
                  featured ? "border-accent" : "border-border"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{plan.name}</span>
                    {featured ? (
                      <span className="text-xs rounded-full bg-accent px-2 py-0.5 text-accent-fg">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <div className="text-2xl font-semibold tracking-tight tabular-nums">
                    {plan.priceLabel}
                  </div>
                </div>
                <div className="text-sm text-muted">
                  <span className="tabular-nums font-medium text-foreground">
                    {plan.monthlyMatters.toLocaleString()}
                  </span>{" "}
                  matters / month
                </div>
                <Link
                  href="/login"
                  className={`mt-auto rounded-md px-4 py-2 text-sm font-medium text-center ${
                    featured
                      ? "bg-accent text-accent-fg hover:opacity-90"
                      : "border border-border hover:bg-background"
                  }`}
                >
                  Start free
                </Link>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted">
          14-day free trial, no charge until it ends. Overage is sold as credit packs (
          {CREDIT_PACK.priceLabel} for {CREDIT_PACK.credits}). Prices may change before general
          availability.
        </p>
      </section>

      {/* Waitlist */}
      <section
        id="waitlist"
        className="rounded-2xl border border-border bg-surface p-8 sm:p-12 text-center space-y-4 scroll-mt-20"
      >
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Don&apos;t have an invite yet?
        </h2>
        <p className="text-muted max-w-xl mx-auto">
          Briefly is invite-only during early access. Leave your email and we&apos;ll reach out as
          spots open up.
        </p>
        <WaitlistForm action={joinWaitlist} />
      </section>

      {/* Closing */}
      <section className="text-center space-y-5">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Arrive to work that&apos;s already prepared.
        </h2>
        <div className="flex justify-center">
          <Link
            href="/login"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Start free
          </Link>
        </div>
      </section>
    </div>
  );
}

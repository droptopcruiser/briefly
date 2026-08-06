import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { PLANS, CREDIT_PACK } from "@/lib/plans";

const STEPS = [
  ["Submission", "A client emails or pastes a messy enquiry."],
  ["Classify", "Matched to the right matter type from your rubrics."],
  ["Extract", "Facts pulled out, each tagged to a source quote."],
  ["Timeline", "A dated, sourced sequence of what happened."],
  ["Gaps", "Missing facts and documents flagged automatically."],
  ["Readiness", "A 0–100% completeness score, computed — not guessed."],
  ["Draft", "A follow-up email requesting exactly what's missing."],
  ["Approve", "You review and approve. Briefly never sends on its own."],
];

const FEATURES = [
  [
    "Reads what your client actually wrote",
    "Only extracts facts that are explicitly stated — every one carries a verbatim source quote. Absent information is marked missing, never invented.",
  ],
  [
    "Tells you what's missing",
    "Compares the enquiry against your requirements and flags the exact fields and documents still needed — no more re-reading to work out the gaps.",
  ],
  [
    "Drafts the chase for you",
    "When something's missing, Briefly writes the follow-up requesting precisely those items. At 100% it flags the matter ready for review.",
  ],
  [
    "Works in any vertical",
    "Firms author their own rubrics, so the same engine serves an immigration adviser, a bookkeeper, and a small legal practice — no code changes.",
  ],
  [
    "Straight from the inbox",
    "Point your intake address at Briefly and client emails become structured, reviewed matters automatically — before you log in.",
  ],
  [
    "You stay in control",
    "Every consequential action passes through a human gate. Briefly extracts and drafts; it never advises, sends, or acts on its own.",
  ],
];

const PRICING = [PLANS.trial, PLANS.solo, PLANS.practice, PLANS.firm];

export default async function Landing() {
  // Signed-in users go straight to the app; this page is for visitors.
  const user = await getAuthUser();
  if (user) redirect("/app");

  return (
    <div className="space-y-24 pb-8">
      {/* Hero */}
      <section className="pt-10 sm:pt-16 flex flex-col items-center text-center gap-6">
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
          AI intake for professional service firms
        </span>
        <h1 className="max-w-3xl text-4xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
          Your client&apos;s intake, done before you open it.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          A client sends a messy, unstructured enquiry. Briefly reads it, extracts the facts into a
          structured matter, flags what&apos;s missing, scores readiness, and drafts the follow-up —
          then hands it to you to approve. Your job shifts from <em>doing</em> intake to{" "}
          <em>approving</em> it.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Sign in
          </Link>
          <a
            href="#how"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="space-y-8 scroll-mt-20">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">From messy email to reviewed matter</h2>
          <p className="text-muted max-w-xl mx-auto">
            Each step is a discrete, inspectable stage — not one opaque black box.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, desc], i) => (
            <li key={title} className="rounded-lg border border-border bg-surface p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-accent border border-border rounded px-1.5 py-0.5">
                  {i + 1}
                </span>
                <span className="font-medium text-sm">{title}</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">What Briefly does for you</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-5 space-y-2">
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="space-y-8 scroll-mt-20">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Simple, metered pricing</h2>
          <p className="text-muted max-w-xl mx-auto">
            Every plan includes a set number of matters each month. Need more? Top up with credit
            packs — no surprise bills.
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
                  Get started
                </Link>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted">
          14-day free trial, no charge until it ends. Need more than your plan&apos;s monthly
          matters? Add a credit pack ({CREDIT_PACK.priceLabel} for {CREDIT_PACK.credits}). Prices may
          change before general availability.
        </p>
      </section>

      {/* Closing CTA */}
      <section className="rounded-2xl border border-border bg-surface p-8 sm:p-12 text-center space-y-5">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Stop doing intake. Start approving it.
        </h2>
        <p className="text-muted max-w-xl mx-auto">
          Briefly turns unstructured client enquiries into reviewed, action-ready matters — with you
          in control of every send.
        </p>
        <div className="flex justify-center">
          <Link
            href="/login"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Sign in to Briefly
          </Link>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { PLANS, CREDIT_PACK } from "@/lib/plans";
import { WaitlistForm } from "@/app/waitlist-form";
import { joinWaitlist } from "@/app/waitlist-actions";
import { Reveal, TwoPathTriage, HeroBackdrop, MatterScene, EvidenceProof } from "@/app/landing";
import { ThemeToggle } from "@/app/theme-toggle";

const PRICING = [PLANS.solo, PLANS.practice, PLANS.firm];

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
          Briefly<span className="text-accent">.</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#position" className="hover:text-foreground">How it works</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href="#waitlist"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Request early access
          </a>
        </div>
      </div>
    </header>
  );
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-24 space-y-10 px-6 py-20 lg:py-28">
      {children}
    </section>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl space-y-3 text-center">
      <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {sub ? <p className="text-muted">{sub}</p> : null}
    </Reveal>
  );
}

export default async function Landing() {
  const user = await getAuthUser();
  if (user) redirect("/app");

  return (
    <div className="min-h-screen">
      <Nav />

      <main>
        {/* ── 1 · Hero — brand-forward dark band (warm black · green period · organic
             shapes). A committed dark section: explicit colours, not theme tokens. ── */}
        <section
          className="relative overflow-hidden"
          style={{
            background:
              "radial-gradient(130% 120% at 50% -10%, #1b1f15 0%, #14170f 58%, #0f110a 100%)",
            color: "#f4f5ef",
          }}
        >
          {/* decorative layer — sage/cream circles, contour lines, dotted grid, w/ parallax */}
          <HeroBackdrop />

          {/* content — one central thesis, then the living matter scene below it */}
          <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <div className="anim-rise mx-auto max-w-3xl text-center">
              <div
                className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                style={{ color: "#9aa48f" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#7fb086" }} />
                For conveyancers and property firms
              </div>
              <h1
                className="mt-6 font-serif font-semibold leading-[1.02] tracking-tight text-balance text-5xl sm:text-6xl lg:text-7xl"
                style={{ color: "#f4f5ef" }}
              >
                The file before the file<span style={{ color: "#7fb086" }}>.</span>
              </h1>
              <p
                className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed"
                style={{ color: "#a7ae9f" }}
              >
                Briefly turns messy client emails, contracts, and replies into a checked matter ready
                for your review. It finds what&apos;s missing, reads what comes back, and prepares the
                next move using your firm&apos;s own requirements.
              </p>
              <p className="mt-5 text-sm font-medium" style={{ color: "#8fb894" }}>
                You review, decide, and send. Briefly does the prep.
              </p>
              <div className="mt-9 flex items-center justify-center">
                <a
                  href="#waitlist"
                  className="rounded-lg px-7 py-3.5 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5"
                  style={{ background: "#7fb086", color: "#12160f" }}
                >
                  Request early access
                </a>
              </div>
            </div>

            {/* The living matter — one file that fills in over time. Larger, closer to
                the copy, so it reads as the focal object of the hero, not a demo below. */}
            <div className="anim-rise mx-auto mt-12 max-w-4xl sm:mt-14" style={{ animationDelay: "140ms" }}>
              <MatterScene />
            </div>
          </div>
        </section>

        {/* ── 2 · The leak, made visible ────────────────────────────────── */}
        <Section id="leak">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                The work before the work
              </div>
              <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl">
                Your intake form only catches the tidy clients.
              </h2>
              <p className="max-w-xl text-muted">
                The rest email a messy note with the contract attached — and you end up doing the prep
                by hand anyway.{" "}
                <span className="text-foreground/80">(No intake form? Then every enquiry is that messy note.)</span>{" "}
                Briefly reads whatever actually lands and turns it into a checked file — so someone
                doesn&apos;t have to do it by hand. Right now that someone is you.
              </p>
            </Reveal>

            <Reveal className="grid gap-3">
              {/* What your form expected — tidy, empty */}
              <div className="rounded-xl border border-dashed border-border bg-inset/50 p-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  What your form expected
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["Property address", "Parties", "Purchase price", "Settlement date"].map((f) => (
                    <div key={f} className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                      <div className="text-[10px] text-muted">{f}</div>
                      <div className="mt-1 h-1.5 w-2/3 rounded bg-border/70" />
                    </div>
                  ))}
                </div>
              </div>
              {/* What actually landed — the mess */}
              <div className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-awaiting">
                  What actually landed in your inbox
                </div>
                <p className="text-sm leading-relaxed text-foreground/85">
                  &ldquo;Hi, buying at 8 Ellery Lane, settlement&apos;s 5 June — contract attached, and a
                  photo of the page you wanted. Signed transfer to come.&rdquo;
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["📎 Contract-of-Sale.pdf", "📷 IMG_4471.jpg", "📎 Section-32.pdf"].map((a) => (
                    <span
                      key={a}
                      className="rounded-md border border-border bg-raise px-2 py-1 text-[11px] font-medium text-foreground/75"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── 3 · The position — in front of, not on top of ─────────────── */}
        <Section id="position">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Where Briefly sits
              </div>
              <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl">
                In front of your practice system, not on top of it.
              </h2>
              <p className="max-w-xl text-muted">
                Your software starts once a file&apos;s in it. Briefly does the messy part before that —
                the inbox, the chasing, the missing documents — and hands you a file ready to drop
                straight in. It sits alongside whatever you already run, because it feeds your system
                rather than replacing it.
              </p>
              <p className="text-sm text-muted">
                Forward an email, review the ready file, drop it into whatever you already run. No
                integration to set up. No migration. Briefly only ever sees what&apos;s forwarded to it —
                never the rest of your inbox.
              </p>
            </Reveal>

            <Reveal className="space-y-3">
              <div className="glass glass-sheen rounded-3xl p-6 sm:p-8">
                <ol className="space-y-3">
                  {[
                    { k: "1", t: "The messy inbox", d: "Whatever the client actually emailed — note, PDFs, a photo." },
                    { k: "2", t: "Briefly", d: "Reads · checks against your checklist · chases what's missing · readies the file.", accent: true },
                    { k: "3", t: "Your system", d: "Drop the ready file into Smokeball, LEAP, triConvey — or a shared drive." },
                  ].map((s, i) => (
                    <li key={s.k}>
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                          {s.k}
                        </span>
                        <div className="min-w-0">
                          <div className={`text-sm font-medium ${s.accent ? "text-accent" : ""}`}>{s.t}</div>
                          <div className="text-xs text-muted">{s.d}</div>
                        </div>
                      </div>
                      {i < 2 ? <div className="ml-3.5 h-4 w-px bg-border" /> : null}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-center text-xs text-muted">
                Works alongside <span className="font-medium text-foreground/80">Smokeball, LEAP,
                triConvey</span> — or a shared drive.
              </p>
            </Reveal>
          </div>
        </Section>

        {/* ── 4 · Proof — page-cited traceability (the trust engine) ─────── */}
        <Section id="proof">
          <Reveal className="mx-auto max-w-2xl space-y-4 text-center">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              It evidences, it doesn&apos;t assert
            </div>
            <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Every fact, traced to its source — and what it means.
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Briefly never asserts; it <strong className="font-medium text-foreground">evidences</strong>. Every
              fact carries its source page and its consequence — so you can trust it, or reject it, in one look.
              A detail it can&apos;t find is marked missing, never filled in.
            </p>
          </Reveal>

          <div className="mx-auto mt-4 max-w-4xl">
            <EvidenceProof />
          </div>
        </Section>

        {/* ── Reserved slot: reference customer (drop in the first happy firm) ──
            Leave the empty frame; do NOT fabricate a testimonial. Sits between
            Proof and the wedge, ready for a named conveyancer + one-line quote. */}

        {/* ── 5 · The wedge — reads what the client actually sent ────────── */}
        <Section id="wedge">
          <Heading
            title="When the client ignores the form, Briefly reads what they sent instead."
            sub="Structured forms work — for the clients who fill them in. For everyone else, Briefly works out what's missing against your checklist, drafts the exact request for what's outstanding, and reads each reply the moment it lands. You approve every chase before it sends."
          />
          <Reveal>
            <TwoPathTriage />
          </Reveal>

          {/* What lands on your desk — the prepared file, its three real parts. */}
          <Reveal className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { v: "Understand", t: "What Briefly noticed", d: "The facts it connected — each tied to a client quote or the document page it came from." },
              { v: "Decide", t: "What's outstanding", d: "Exactly what's still missing against your checklist, and whether the file is ready." },
              { v: "Act", t: "The chase, drafted", d: "The precise request for what's outstanding — yours to edit, approve, and send." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-border bg-surface p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{c.v}</div>
                <h3 className="mt-2 font-serif text-lg font-semibold tracking-tight">{c.t}</h3>
                <p className="mt-1.5 text-sm text-muted">{c.d}</p>
              </div>
            ))}
          </Reveal>
        </Section>

        {/* ── 6 · You keep the call — human-gated trust ─────────────────── */}
        <Section>
          <Reveal className="mx-auto max-w-2xl space-y-4 rounded-3xl border border-border bg-surface p-8 text-center sm:p-10">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Your control, not our limitation
            </div>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              You approve every fact and every send.
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Briefly prepares; you decide. Nothing is sent to a client, and nothing goes on a file,
              until you approve it. Briefly never contacts your client without you.
            </p>
          </Reveal>
        </Section>

        {/* ── 7 · Pricing ───────────────────────────────────────────────── */}
        <Section id="pricing">
          <Heading
            title="Simple, metered pricing"
            sub="A matter costs less than the time you'd spend preparing it by hand. Priced per matter, not per seat — one busy solo shouldn't pay like a team."
          />
          <Reveal className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
            {PRICING.map((plan) => {
              const featured = plan.id === "practice";
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 transition-shadow hover:shadow-sm ${
                    featured ? "border-accent shadow-sm" : "border-border"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{plan.name}</span>
                      {featured ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">Popular</span>
                      ) : null}
                    </div>
                    <div className="text-2xl font-semibold tabular-nums tracking-tight">{plan.priceLabel}</div>
                  </div>
                  <div className="text-sm text-muted">
                    <span className="font-medium tabular-nums text-foreground">
                      {plan.monthlyMatters.toLocaleString()}
                    </span>{" "}
                    matters / month
                  </div>
                  {plan.id === "solo" ? (
                    <p className="rounded-lg bg-inset px-3 py-2 text-xs text-muted">
                      Busy month? Add 50 matters for {CREDIT_PACK.priceLabel}, any time — no forced
                      upgrade, no surprise bills.
                    </p>
                  ) : null}
                  <a
                    href="#waitlist"
                    className={`mt-auto rounded-lg px-4 py-2 text-center text-sm font-medium ${
                      featured ? "bg-accent text-accent-fg hover:opacity-90" : "border border-border hover:bg-inset"
                    }`}
                  >
                    Request early access
                  </a>
                </div>
              );
            })}
          </Reveal>
          <p className="text-center text-xs text-muted">
            At launch, every plan starts with a 7-day free trial — no charge until it ends. Need more
            than your plan includes? Top up with credit packs ({CREDIT_PACK.priceLabel} for{" "}
            {CREDIT_PACK.credits} matters). Prices in AUD and may change before general availability.
          </p>
        </Section>

        {/* ── 8 · Waitlist / invite ─────────────────────────────────────── */}
        <Section id="waitlist">
          <Reveal className="mx-auto max-w-4xl space-y-4 rounded-3xl border border-border bg-surface p-8 text-center sm:p-12">
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance">
              Request early access.
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Briefly is invite-only while we work with a first handful of conveyancing firms. Leave
              your email and we&apos;ll reach out as spots open up.
            </p>
            <WaitlistForm action={joinWaitlist} />
          </Reveal>
        </Section>

        {/* ── Closing — the payoff line, now that the mechanism is understood ─ */}
        <section className="mx-auto max-w-6xl px-6 pb-28 pt-4 text-center">
          <Reveal>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Work arrives ready.
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              <a
                href="#waitlist"
                className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
              >
                Request early access
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="font-serif text-base font-semibold text-foreground">Briefly</span>
            <span className="hidden sm:inline">· The work before the work</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#position" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </div>
          <div>© {new Date().getFullYear()} Briefly</div>
        </div>
      </footer>
    </div>
  );
}

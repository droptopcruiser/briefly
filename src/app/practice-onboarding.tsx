"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFirmStep, finishOnboarding } from "@/app/onboarding-actions";

/**
 * P6 — the three-screen practice onboarding. Firm → Work → Books, then into the app.
 * Not a rulebook-teaching wizard: immigration books are built-in, so the immigration
 * firm just picks which to start with; the Property path skips books, clones the
 * conveyancing starter, and goes home.
 */

type Step = "firm" | "work" | "books";
type Practice = "immigration" | "conveyancing";

const BOOKS: { id: string; label: string; locked?: boolean }[] = [
  { id: "partner_of_nz_citizen", label: "Partner of a New Zealander", locked: true },
  { id: "aewv_worker", label: "AEWV" },
  { id: "student", label: "Student" },
];

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const primaryCls =
  "rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60";

export function PracticeOnboarding({ initialFirmName }: { initialFirmName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("firm");
  const [practice, setPractice] = useState<Practice>("immigration");
  const [books, setBooks] = useState<string[]>(["partner_of_nz_citizen"]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function goHome() {
    router.push("/app");
    router.refresh();
  }

  // ── Screen 1: firm + name ──────────────────────────────────────────────────
  function submitFirm(formData: FormData) {
    setError(null);
    const firmName = String(formData.get("firmName") ?? "");
    const displayName = String(formData.get("displayName") ?? "");
    start(async () => {
      const res = await saveFirmStep({ firmName, displayName });
      if (res.ok) setStep("work");
      else setError(res.error ?? "Could not save.");
    });
  }

  // ── Screen 2 → continue (property finishes here) ────────────────────────────
  function continueWork() {
    setError(null);
    if (practice === "immigration") {
      setStep("books");
      return;
    }
    start(async () => {
      const res = await finishOnboarding({ practiceType: "conveyancing" });
      if (res.ok) goHome();
      else setError(res.error ?? "Could not finish setup.");
    });
  }

  // ── Screen 3: books → open the practice ─────────────────────────────────────
  function finish() {
    setError(null);
    start(async () => {
      const res = await finishOnboarding({ practiceType: "immigration", books });
      if (res.ok) goHome();
      else setError(res.error ?? "Could not finish setup.");
    });
  }

  const toggleBook = (id: string) =>
    setBooks((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  return (
    <div className="mx-auto max-w-lg space-y-8 pt-8">
      <Stepper step={step} practice={practice} />

      {step === "firm" ? (
        <form action={submitFirm} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">Your practice</h1>
            <p className="text-sm text-muted">Two quick details to set up your firm.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Firm name</span>
            <input name="firmName" autoFocus maxLength={80} defaultValue={initialFirmName ?? ""} placeholder="e.g. Bennett Immigration Law" className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Your name</span>
            <input name="displayName" maxLength={80} placeholder="e.g. Sam Bennett" className={inputCls} />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={primaryCls}>{pending ? "Saving…" : "Continue"}</button>
            {error ? <span className="text-sm text-error">{error}</span> : null}
          </div>
        </form>
      ) : step === "work" ? (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">What files do you run?</h1>
          </div>
          <div className="grid gap-3">
            <PracticeCard
              selected={practice === "immigration"}
              onSelect={() => setPractice("immigration")}
              title="Visas"
              blurb="Partner, AEWV, student"
            />
            <PracticeCard
              selected={practice === "conveyancing"}
              onSelect={() => setPractice("conveyancing")}
              title="Property"
              blurb="Purchases and sales"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={continueWork} disabled={pending} className={primaryCls}>
              {pending ? "Setting up…" : "Continue"}
            </button>
            <button type="button" onClick={() => setStep("firm")} className="text-sm text-muted hover:text-foreground">Back</button>
            {error ? <span className="text-sm text-error">{error}</span> : null}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">Start with these rulebooks</h1>
            <p className="text-sm text-muted">You can add or remove books later.</p>
          </div>
          <div className="grid gap-2">
            {BOOKS.map((b) => {
              const on = b.locked || books.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                    on ? "border-accent bg-accent-soft" : "border-border hover:bg-inset"
                  } ${b.locked ? "cursor-default" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={b.locked}
                    onChange={() => toggleBook(b.id)}
                  />
                  <span className="font-medium">{b.label}</span>
                  {b.locked ? <span className="ml-auto text-xs text-muted">Always on</span> : null}
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={finish} disabled={pending} className={primaryCls}>
              {pending ? "Opening…" : "Open the practice"}
            </button>
            <button type="button" onClick={() => setStep("work")} className="text-sm text-muted hover:text-foreground">Back</button>
            {error ? <span className="text-sm text-error">{error}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function PracticeCard({
  selected, onSelect, title, blurb,
}: { selected: boolean; onSelect: () => void; title: string; blurb: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-border hover:bg-inset"
      }`}
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-sm text-muted">{blurb}</span>
      </span>
      <span className={`h-4 w-4 shrink-0 rounded-full border ${selected ? "border-accent bg-accent" : "border-border"}`} />
    </button>
  );
}

function Stepper({ step, practice }: { step: Step; practice: Practice }) {
  const items: { key: Step; label: string }[] = [
    { key: "firm", label: "Firm" },
    { key: "work", label: "Work" },
    ...(practice === "immigration" ? [{ key: "books" as const, label: "Books" }] : []),
  ];
  const idx = items.findIndex((i) => i.key === step);
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((it, i) => (
        <div key={it.key} className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
              i <= idx ? "bg-accent text-accent-fg" : "bg-inset text-muted"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === idx ? "font-medium" : "text-muted"}>{it.label}</span>
          {i < items.length - 1 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
        </div>
      ))}
    </div>
  );
}

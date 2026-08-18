"use client";

import { useState, useTransition } from "react";
import {
  completeOnboardingAction,
  draftRubric,
  saveOnboardingRubric,
  type OnboardRubricInput,
} from "@/app/onboarding-actions";
import { createMatterFromSubmission } from "@/app/actions";
import { SubmitButton } from "@/app/pending-button";
import { PRACTICE_EXAMPLES, type DraftRubric } from "@/lib/rubric-draft";
import type { FieldType } from "@/lib/types";

/**
 * Guided first-matter onboarding. Not a settings wizard — the professional teaches
 * Briefly one workflow in plain language, reviews the SOURCE-BACKED rulebook Briefly
 * proposes (confirming anything it inferred), approves it, then watches one enquiry
 * become a prepared matter. Steps flow client-side so the "aha" isn't broken by
 * full reloads.
 */

type Step = "name" | "rulebook" | "done";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

const SAMPLE_ENQUIRIES: Record<string, string> = {
  property:
    "Hi, I'm looking to sell my home at 22 Hillcrest Road and would like an appraisal. I'm the owner, hoping to list before the school year. Could we arrange a time this week?",
  family_law:
    "Hello, my husband and I separated a few months ago after 9 years. We married on 14 September 2015 and have two children. I'd like to start divorce proceedings — I've attached our marriage certificate.",
  migration:
    "Hi, I'd like to apply for a spousal visa to join my partner. I'm a Senegalese citizen currently on a student visa. We married on 17 June 2023 and I've attached my passport and our certificate.",
  accounting:
    "Hi, I run a small Pte Ltd in retail and need bookkeeping plus help with this year's tax. Our financial year ends 31 March and we're GST-registered. I can share Xero access and last year's return.",
  other:
    "Hi, I'd like to get some help with a new matter. Here are the details of my situation and what I'm hoping you can do…",
};

export function OnboardingWizard({
  initialStep,
  intakeAddress,
}: {
  initialStep: Step;
  intakeAddress: string | null;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [practice, setPractice] = useState<string>("property");

  return (
    <div className="mx-auto max-w-2xl space-y-8 pt-6">
      <Stepper step={step} />
      {step === "name" ? (
        <NameStep onDone={() => setStep("rulebook")} />
      ) : step === "rulebook" ? (
        <RulebookStep
          practice={practice}
          setPractice={setPractice}
          onDone={() => setStep("done")}
        />
      ) : (
        <DoneStep intakeAddress={intakeAddress} sample={SAMPLE_ENQUIRIES[practice] ?? SAMPLE_ENQUIRIES.other} />
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "name", label: "Your firm" },
    { key: "rulebook", label: "Your rulebook" },
    { key: "done", label: "First matter" },
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

// ── Step: firm name ───────────────────────────────────────────────────────────
function NameStep({ onDone }: { onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    start(async () => {
      const res = await completeOnboardingAction({ ok: false }, formData);
      if (res.ok) onDone();
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">What&apos;s your firm called?</h1>
        <p className="text-sm text-muted">
          Clients see this as the sender of your follow-ups. You can change it later in Settings.
        </p>
      </div>
      <form action={submit} className="space-y-3">
        <input
          name="firmName"
          autoFocus
          maxLength={80}
          placeholder="e.g. Bennett Immigration Law"
          className={inputCls}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {pending ? "Saving…" : "Continue"}
          </button>
          {error ? <span className="text-sm text-error">{error}</span> : null}
        </div>
      </form>
    </div>
  );
}

// ── Step: rulebook translator ─────────────────────────────────────────────────

type EditField = { label: string; description: string; type: FieldType; required: boolean; options?: string[]; source: string; inferred: boolean };
type EditDoc = { label: string; description: string; required: boolean; source: string; inferred: boolean };
type Editable = {
  name: string;
  vertical: string;
  description: string;
  nextActionIntent: string;
  fields: EditField[];
  documents: EditDoc[];
  mocked: boolean;
};

function toEditable(d: DraftRubric): Editable {
  return {
    name: d.name,
    vertical: d.vertical,
    description: d.description,
    nextActionIntent: d.nextActionIntent,
    fields: d.fields.map((f) => ({ label: f.label, description: f.description, type: f.type, required: f.required, options: f.options, source: f.source, inferred: f.inferred })),
    documents: d.documents.map((x) => ({ label: x.label, description: x.description, required: x.required, source: x.source, inferred: x.inferred })),
    mocked: d.mocked,
  };
}

function RulebookStep({
  practice,
  setPractice,
  onDone,
}: {
  practice: string;
  setPractice: (p: string) => void;
  onDone: () => void;
}) {
  const initial = PRACTICE_EXAMPLES.find((p) => p.key === practice) ?? PRACTICE_EXAMPLES[0];
  const [mode, setMode] = useState<"describe" | "guided">("describe");
  const [description, setDescription] = useState(initial.example);
  const [guided, setGuided] = useState({ trigger: "", facts: "", docs: "", nextAction: "" });
  const [draft, setDraft] = useState<Editable | null>(null);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pickPractice(key: string) {
    setPractice(key);
    const ex = PRACTICE_EXAMPLES.find((p) => p.key === key);
    if (ex) setDescription(ex.example);
  }

  function composeGuided(): string {
    const parts: string[] = [];
    parts.push(`When ${guided.trigger.trim() || "a new enquiry"} comes in, we need ${guided.facts.trim() || "the key details"}.`);
    if (guided.docs.trim()) parts.push(`We also need these documents: ${guided.docs.trim()}.`);
    parts.push(`Once we have everything, we want to prepare ${guided.nextAction.trim() || "the next step"}. If something's missing, we ask the client for it.`);
    return parts.join(" ");
  }

  const canTranslate =
    mode === "describe" ? description.trim().length >= 12 : guided.trigger.trim() && guided.facts.trim();

  function translate() {
    setError(null);
    const hint = PRACTICE_EXAMPLES.find((p) => p.key === practice)?.hint || undefined;
    const text = mode === "guided" ? composeGuided() : description;
    startDraft(async () => {
      const d = await draftRubric(text, hint);
      setDraft(toEditable(d));
    });
  }

  function approve() {
    if (!draft) return;
    setError(null);
    const input: OnboardRubricInput = {
      name: draft.name,
      vertical: draft.vertical,
      description: draft.description,
      nextActionIntent: draft.nextActionIntent || undefined,
      fields: draft.fields.map((f) => ({ label: f.label, description: f.description, type: f.type, required: f.required, options: f.options })),
      documents: draft.documents.map((x) => ({ label: x.label, description: x.description, required: x.required })),
    };
    startSave(async () => {
      const res = await saveOnboardingRubric(input);
      if (res.ok) onDone();
      else setError(res.error ?? "Could not save the rulebook.");
    });
  }

  // ── Describe ──
  if (!draft) {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Teach Briefly how you work.
          </h1>
          <p className="text-sm text-muted">
            Tell Briefly how your firm handles one kind of enquiry — it turns that into a structured
            rulebook you review and own. Not sure where to start? Answer a few questions instead.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRACTICE_EXAMPLES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPractice(p.key)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                practice === p.key ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {(["describe", "guided"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"}`}
            >
              {m === "describe" ? "Describe it" : "Answer a few questions"}
            </button>
          ))}
        </div>

        {mode === "describe" ? (
          <>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={7}
              placeholder="When a new … enquiry comes in, we need … If we have those we want to draft … If … is missing, we ask for it."
              className={`${inputCls} resize-y leading-relaxed`}
            />
            <p className="text-xs text-muted">
              In your own words — or paste an existing checklist or intake note. Cover what triggers
              it, the facts you need, the documents that matter, and what you&apos;d want prepared
              once it&apos;s complete.
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <GuidedField
              label="What kind of enquiry is this?"
              value={guided.trigger}
              onChange={(v) => setGuided({ ...guided, trigger: v })}
              placeholder="e.g. a property appraisal enquiry"
            />
            <GuidedField
              label="What facts do you need to capture?"
              value={guided.facts}
              onChange={(v) => setGuided({ ...guided, facts: v })}
              placeholder="e.g. property address, owner name and contact, property type (house, apartment, townhouse, or land), preferred timing"
              hint="Listing choices in brackets — like (house, apartment, townhouse, or land) — makes that a picklist automatically."
            />
            <GuidedField
              label="What documents do you need?"
              value={guided.docs}
              onChange={(v) => setGuided({ ...guided, docs: v })}
              placeholder="e.g. proof of ownership"
            />
            <GuidedField
              label="When it's complete, what should Briefly prepare?"
              value={guided.nextAction}
              onChange={(v) => setGuided({ ...guided, nextAction: v })}
              placeholder="e.g. an appraisal booking confirmation"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={translate}
            disabled={drafting || !canTranslate}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {drafting ? "Reading your workflow…" : "Draft my rulebook"}
          </button>
          {error ? <span className="text-sm text-error">{error}</span> : null}
        </div>
      </div>
    );
  }

  // ── Review ──
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Review your rulebook.
        </h1>
        <p className="text-sm text-muted">
          Briefly proposed this from your description. Everything is editable — check what it drew
          from your words, confirm anything it guessed, then activate.
        </p>
      </div>

      {draft.mocked ? (
        <div className="rounded-lg border border-awaiting bg-awaiting-soft px-4 py-2.5 text-sm text-awaiting">
          Example only — no live model is configured, so this is a sample, not a reading of your
          words. Edit it freely.
        </div>
      ) : null}

      {/* Matter type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">Matter type</span>
          <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">Area</span>
          <input className={inputCls} value={draft.vertical} onChange={(e) => setDraft({ ...draft, vertical: e.target.value })} />
        </label>
      </div>

      {/* Facts */}
      <Section title="Facts Briefly will look for">
        {draft.fields.map((f, i) => (
          <ReviewRow
            key={i}
            label={f.label}
            required={f.required}
            source={f.source}
            inferred={f.inferred}
            options={f.type === "enum" ? f.options : undefined}
            onLabel={(v) => setDraft({ ...draft, fields: draft.fields.map((x, j) => (j === i ? { ...x, label: v } : x)) })}
            onRequired={(v) => setDraft({ ...draft, fields: draft.fields.map((x, j) => (j === i ? { ...x, required: v } : x)) })}
            onRemove={() => setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })}
          />
        ))}
        <AddButton onClick={() => setDraft({ ...draft, fields: [...draft.fields, { label: "", description: "", type: "string", required: true, source: "", inferred: false }] })} label="Add a fact" />
      </Section>

      {/* Documents */}
      <Section title="Documents that matter">
        {draft.documents.map((d, i) => (
          <ReviewRow
            key={i}
            label={d.label}
            required={d.required}
            source={d.source}
            inferred={d.inferred}
            onLabel={(v) => setDraft({ ...draft, documents: draft.documents.map((x, j) => (j === i ? { ...x, label: v } : x)) })}
            onRequired={(v) => setDraft({ ...draft, documents: draft.documents.map((x, j) => (j === i ? { ...x, required: v } : x)) })}
            onRemove={() => setDraft({ ...draft, documents: draft.documents.filter((_, j) => j !== i) })}
          />
        ))}
        <AddButton onClick={() => setDraft({ ...draft, documents: [...draft.documents, { label: "", description: "", required: false, source: "", inferred: false }] })} label="Add a document" />
      </Section>

      {/* Next action intent */}
      <Section title="When this matter is ready → what should Briefly prepare?">
        <input
          className={inputCls}
          value={draft.nextActionIntent}
          onChange={(e) => setDraft({ ...draft, nextActionIntent: e.target.value })}
          placeholder="e.g. Appraisal booking confirmation"
        />
        <p className="text-xs text-muted">
          The intended next step. Your team reviews the prepared action before anything is sent.
        </p>
      </Section>

      {/* Safeguards */}
      <div className="space-y-2 rounded-lg border border-border bg-inset px-4 py-3 text-xs text-muted">
        <p>
          <span className="font-medium text-foreground">Review before it goes live.</span> Briefly can
          structure your process, but your team decides what&apos;s required.
        </p>
        <p>
          This structures your workflow — it isn&apos;t legal, migration, or tax advice. A qualified
          professional in your firm should confirm what&apos;s required.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={approve}
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {saving ? "Activating…" : "Approve & activate"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset"
        >
          Start over
        </button>
        {error ? <span className="text-sm text-error">{error}</span> : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function GuidedField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className={`${inputCls} resize-y`}
      />
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function ReviewRow({
  label,
  required,
  source,
  inferred,
  options,
  onLabel,
  onRequired,
  onRemove,
}: {
  label: string;
  required: boolean;
  source: string;
  inferred: boolean;
  options?: string[];
  onLabel: (v: string) => void;
  onRequired: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          placeholder="Name this…"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={required} onChange={(e) => onRequired(e.target.checked)} />
          Required
        </label>
        <button type="button" onClick={onRemove} aria-label="Remove" className="shrink-0 text-sm text-muted hover:text-error">
          ✕
        </button>
      </div>
      <div className="mt-1 text-xs">
        {inferred ? (
          <span className="text-awaiting">⚠ Briefly inferred this — please confirm.</span>
        ) : source ? (
          <span className="text-muted italic">from “{source}”</span>
        ) : null}
      </div>
      {options && options.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((o) => (
            <span key={o} className="rounded-md bg-inset px-2 py-0.5 text-[11px] text-muted">
              {o}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:bg-inset"
    >
      <span className="text-base leading-none">+</span> {label}
    </button>
  );
}

// ── Step: done — connect intake + prepare first matter ────────────────────────
function DoneStep({ intakeAddress, sample }: { intakeAddress: string | null; sample: string }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Your rulebook is live.
        </h1>
        <p className="text-sm text-muted">
          Two things left: point your enquiries at Briefly, then watch one become a prepared matter.
        </p>
      </div>

      {intakeAddress ? (
        <div className="space-y-2 rounded-lg border border-border bg-inset px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Your intake address</div>
          <div className="break-all font-mono text-sm text-accent">{intakeAddress}</div>
          <p className="text-xs text-muted">
            Forward client enquiries here, or point your website form / shared inbox at it. Briefly
            only ever sees what&apos;s sent to this address — never the rest of your inbox.
          </p>
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-accent bg-surface p-4">
        <div className="space-y-1">
          <div className="text-sm font-medium">See it work now</div>
          <p className="text-xs text-muted">
            Here&apos;s a sample enquiry — edit it or paste a real one, then watch Briefly prepare the
            matter against your new rulebook.
          </p>
        </div>
        <form action={createMatterFromSubmission} className="space-y-3">
          <textarea
            name="submission"
            rows={5}
            defaultValue={sample}
            className={`${inputCls} resize-y leading-relaxed`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton idleLabel="Prepare this matter" pendingLabel="Preparing the matter…" />
            <a href="/app" className="text-sm text-muted hover:text-foreground">
              Skip to dashboard
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

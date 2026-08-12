"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveRubric } from "./rubric-actions";
import type { Rubric, FieldType } from "@/lib/types";

interface FieldRow {
  key: string;
  label: string;
  description: string;
  type: FieldType;
  required: boolean;
  optionsText: string;
}
interface DocRow {
  key: string;
  label: string;
  description: string;
  required: boolean;
}

const TYPES: FieldType[] = ["string", "date", "number", "boolean", "enum"];

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function RubricEditor({ initial }: { initial: Rubric }) {
  const [name, setName] = useState(initial.name);
  const [vertical, setVertical] = useState(initial.vertical);
  const [description, setDescription] = useState(initial.description);
  const [fields, setFields] = useState<FieldRow[]>(
    initial.fields.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      type: f.type,
      required: f.required,
      optionsText: (f.options ?? []).join(", "),
    })),
  );
  const [docs, setDocs] = useState<DocRow[]>(
    initial.documents.map((d) => ({
      key: d.key,
      label: d.label,
      description: d.description,
      required: d.required,
    })),
  );
  const [pending, startTransition] = useTransition();

  function addField() {
    setFields((f) => [
      ...f,
      { key: "", label: "", description: "", type: "string", required: true, optionsText: "" },
    ]);
  }
  function updateField(i: number, patch: Partial<FieldRow>) {
    setFields((f) => f.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, j) => j !== i));
  }

  function addDoc() {
    setDocs((d) => [...d, { key: "", label: "", description: "", required: true }]);
  }
  function updateDoc(i: number, patch: Partial<DocRow>) {
    setDocs((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }
  function removeDoc(i: number) {
    setDocs((d) => d.filter((_, j) => j !== i));
  }

  function save() {
    const rubric: Rubric = {
      id: initial.id,
      name,
      vertical,
      description,
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        required: f.required,
        type: f.type,
        options:
          f.type === "enum"
            ? f.optionsText.split(",").map((o) => o.trim()).filter(Boolean)
            : undefined,
      })),
      documents: docs.map((d) => ({
        key: d.key,
        label: d.label,
        description: d.description,
        required: d.required,
      })),
    };
    startTransition(() => saveRubric(rubric));
  }

  return (
    <div className="space-y-8">
      {/* Matter type details */}
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Matter type name</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spousal Visa Application"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Vertical</span>
            <input
              className={inputCls}
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              placeholder="e.g. Immigration"
            />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">
            When to use this (helps classification)
          </span>
          <textarea
            className={`${inputCls} resize-y`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the kind of enquiry this matter type covers."
          />
        </label>
      </section>

      {/* Fields */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Facts to extract</h2>
          <button
            type="button"
            onClick={addField}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
          >
            + Add field
          </button>
        </div>
        {fields.length === 0 ? (
          <p className="text-sm text-muted">No fields yet — add the facts this matter type needs.</p>
        ) : (
          <div className="space-y-3">
            {fields.map((f, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className={inputCls}
                    value={f.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                    placeholder="Field label (e.g. Applicant nationality)"
                  />
                  <div className="flex items-center gap-3">
                    <select
                      className={inputCls}
                      value={f.type}
                      onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => updateField(i, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      className="shrink-0 text-sm text-muted hover:text-error"
                      aria-label="Remove field"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <input
                  className={inputCls}
                  value={f.description}
                  onChange={(e) => updateField(i, { description: e.target.value })}
                  placeholder="Guidance for the extractor (what to look for)"
                />
                {f.type === "enum" ? (
                  <input
                    className={inputCls}
                    value={f.optionsText}
                    onChange={(e) => updateField(i, { optionsText: e.target.value })}
                    placeholder="Allowed values, comma-separated (e.g. Sole trader, Partnership, Limited company)"
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Documents expected</h2>
          <button
            type="button"
            onClick={addDoc}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
          >
            + Add document
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-muted">No documents — add any files the client should provide.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((d, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    className={inputCls}
                    value={d.label}
                    onChange={(e) => updateDoc(i, { label: e.target.value })}
                    placeholder="Document name (e.g. Passport)"
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={d.required}
                      onChange={(e) => updateDoc(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => removeDoc(i)}
                    className="shrink-0 text-sm text-muted hover:text-error"
                    aria-label="Remove document"
                  >
                    ✕
                  </button>
                </div>
                <input
                  className={inputCls}
                  value={d.description}
                  onChange={(e) => updateDoc(i, { description: e.target.value })}
                  placeholder="What this document is / evidences"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={save}
          disabled={pending || !name.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save rubric"}
        </button>
        <Link href="/app/rubrics" className="text-sm text-muted hover:text-foreground">
          Cancel
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMatterDocument, deleteMatterDocument } from "@/app/document-actions";

/**
 * P5b — migration documents. A file attaches to a PARTY (Applicant | Sponsor | Employer)
 * + a rubric item; no person picked → Unassigned (never the principal). Files list
 * grouped by party with a visible Unassigned bucket; sensitive docs (passport / police /
 * medical) carry a tag. Does not touch the existing document viewer.
 */

export interface DocRow { id: string; fileName: string; personId?: string; itemKey?: string; sensitive?: boolean }
export interface PartyOpt { id: string; label: string }
export interface ItemOpt { key: string; label: string }

export function MigrationDocuments({
  matterId, parties, items, docs, defaultPersonId,
}: { matterId: string; parties: PartyOpt[]; items: ItemOpt[]; docs: DocRow[]; defaultPersonId?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // Default to the principal so a single-applicant file binds on attach without fiddling.
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
  const [itemKey, setItemKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onUpload = () =>
    start(async () => {
      setError(null);
      const f = fileRef.current?.files?.[0];
      if (!f) { setError("Choose a PDF first."); return; }
      const fd = new FormData();
      fd.set("file", f);
      if (personId) fd.set("personId", personId);
      if (itemKey) fd.set("itemKey", itemKey);
      const res = await uploadMatterDocument(matterId, fd);
      if (res.ok) { if (fileRef.current) fileRef.current.value = ""; setPersonId(defaultPersonId ?? ""); setItemKey(""); router.refresh(); }
      else setError(res.error ?? "Upload failed.");
    });

  const onDelete = (id: string) => start(async () => { await deleteMatterDocument(matterId, id); router.refresh(); });

  const itemLabel = (k?: string) => items.find((i) => i.key === k)?.label ?? k ?? "";
  const groups = [
    ...parties.map((p) => ({ id: p.id, name: p.label, unassigned: false, rows: docs.filter((d) => d.personId === p.id) })),
    { id: "__un", name: "Unassigned", unassigned: true, rows: docs.filter((d) => !d.personId || !parties.some((p) => p.id === d.personId)) },
  ].filter((g) => g.rows.length || !g.unassigned);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Documents</div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person" className="rounded-lg border border-border bg-raise px-2 py-1.5 text-sm">
          <option value="">Unassigned</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={itemKey} onChange={(e) => setItemKey(e.target.value)} aria-label="Rubric item" className="rounded-lg border border-border bg-raise px-2 py-1.5 text-sm">
          <option value="">(item…)</option>
          {items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        </select>
        <input ref={fileRef} type="file" accept="application/pdf" aria-label="PDF file" className="text-sm" />
        <button type="button" onClick={onUpload} disabled={pending} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? "Uploading…" : "Attach"}
        </button>
      </div>
      {error ? <p className="mt-1 text-sm text-error">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <div key={g.id} className={`rounded-xl border p-3 ${g.unassigned ? "border-awaiting/50 bg-awaiting-soft/40" : "border-border bg-raise"}`}>
            <div className="text-sm font-medium">{g.name}{g.unassigned && g.rows.length ? " — assign before treating as ready" : ""}</div>
            {g.rows.length ? (
              <ul className="mt-1 space-y-1 text-sm text-foreground/85">
                {g.rows.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {d.fileName}
                      {d.itemKey ? <span className="text-muted"> · {itemLabel(d.itemKey)}</span> : null}
                      {d.sensitive ? <span className="ml-2 rounded bg-inset px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">sensitive</span> : null}
                    </span>
                    <button type="button" onClick={() => onDelete(d.id)} disabled={pending} className="text-xs text-muted hover:text-error">remove</button>
                  </li>
                ))}
              </ul>
            ) : <div className="mt-1 text-sm text-muted">No files.</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

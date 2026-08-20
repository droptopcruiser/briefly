# Native Document Reading — Technical Plan (PDF-first)

Status: **PLAN — not yet built.** Scope agreed with Luke: PDF only to start; attachments
stored in **Supabase Storage, Sydney**; build in slices, plan reviewed before any code.

Goal: move Briefly from *"the client said they attached X"* (metadata only) to
*"Briefly read the PDF and extracted these facts, each traceable to a page."* Without
weakening the human gate, and without ever implying comprehension Briefly doesn't have.

---

## 1. Capability confirmation (verified against the Anthropic API)

- **Claude reads PDFs natively.** A PDF goes in as a `document` content block; the model
  reads both text-based and **scanned** PDFs (it rasterises pages + reads them), so we do
  **not** need a separate OCR service for scans.
- **Base64 document block** (no beta header):
  ```jsonc
  { "type": "document",
    "source": { "type": "base64", "media_type": "application/pdf", "data": "<b64, no newlines>" },
    "citations": { "enabled": true } }
  ```
  placed **before** the instruction text block in the user message.
- **Limits:** ≤ 32 MB per request; **≤ 100 pages** on a 200K-context model (Haiku 4.5),
  up to 600 on a 1M-context model. Our current model is `claude-haiku-4-5` → 100-page cap.
- **Citations = the traceability we want** (no beta header): with `citations.enabled`, the
  response is split into `text` blocks; cited blocks carry a `citations[]` array, each with
  `cited_text`, `document_index`, `document_title`, and a **`page_location`**
  (`start_page_number` / `end_page_number`, **1-indexed**). That is the "Page 3" click-to-
  snippet requirement, built in.
- **The one hard constraint:** citations are **incompatible with forced-JSON output**
  (`output_config.format` → HTTP 400). Our text pipeline uses structured JSON (`jsonCall`);
  the document path must use a **different call shape** (citations + parse), see §6.
- **Files API** (beta `files-api-2025-04-14`) is an alternative to base64: upload once, then
  reference `{ "source": { "type": "file", "file_id": "…" } }` across calls. Optional
  optimisation for re-reads; base64 is fine for v1.

Pricing: Haiku 4.5 is $1 / $5 per MTok. A PDF is ~1–3K tokens/page (image + text), so a
20-page statement ≈ 30–60K input tokens ≈ 3–6¢. Acceptable; gate on page count.

---

## 2. Honesty contract (must hold everywhere)

Three distinct states, never conflated in UI or provenance:

| State | Meaning today | After this feature |
|---|---|---|
| **File detected** | client *referenced* a doc in the email text | unchanged (text signal) |
| **File content read** | ✗ not possible | Briefly opened the PDF and read its pages |
| **Fact extracted from file** | ✗ not possible | a value pulled from the PDF, cited to a page |

Provenance strings make the source explicit:
- text fact → `"my house at 5 Oak St"` (as today)
- **document fact → `Document: marriage-cert.pdf · p.2`** (new, page-cited)

A stored file that hasn't been read yet shows **"attached · not yet read"** — never
"provided/verified".

---

## 3. Architecture / data flow

```
Upload (matter page)  ┐
Inbound email attach  ┘─▶  Supabase Storage (Sydney, private bucket)
                            + `documents` row (status: stored)
                                   │
                        [read action / auto on upload]
                                   ▼
                     fetch bytes ▶ Claude (PDF document block + citations)
                                   │  parse cited text blocks
                                   ▼
                     doc facts { key, value, quote, page, confidence }
                                   │  merge into matter.result.fields
                                   ▼
                     recompute gaps + readiness (content-aware)
                                   ▼
        Evidence Drawer: document list + page-cited facts + (slice 3) viewer
```

Human gate unchanged: reading a document never approves or sends anything. It only
enriches the matter that the professional still reviews.

---

## 4. Data model

### New `documents` table (migration `supabase/documents.sql`)
```sql
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null,
  matter_id     uuid not null,
  file_name     text not null,
  mime          text not null,               -- 'application/pdf' for v1
  size_bytes    bigint not null,
  storage_path  text not null,               -- bucket path
  page_count    int,
  status        text not null default 'stored'
                check (status in ('stored','reading','read','unreadable','skipped')),
  read_at       timestamptz,
  cost_cents    numeric default 0,
  created_at    timestamptz not null default now()
);
create index if not exists documents_matter_idx on documents(matter_id);
```
Mirrors the existing store pattern (service-role writes, in-memory fallback for dev, like
`work_briefs`).

### Document facts on the matter
Extend `ExtractedField` provenance rather than a parallel structure, so the whole app
(brief, plan, evidence, traceability) works unchanged:
- add optional `fromDocument?: { docId: string; fileName: string; page: number }` to the
  field (alongside `carried?`). `source` holds the cited snippet; `fromDocument` gives the
  page + file for the drawer's "view page" jump (slice 3).
- readiness/gaps already key off `field.present` — a document-filled field satisfies its
  requirement automatically once merged.

---

## 5. Storage — Supabase Storage (Sydney)

- **One private bucket** `matter-docs` in the existing Sydney project (residency ✔, one
  vendor ✔). One-time setup Luke runs (like the SQL migrations):
  ```sql
  insert into storage.buckets (id, name, public) values ('matter-docs','matter-docs', false)
  on conflict do nothing;
  ```
  No public policy — all access is **service-role**, server-side only. Files are never
  exposed by public URL; the app streams them through a server action/route that checks
  matter ownership first.
- Path convention: `matter-docs/{accountId}/{matterId}/{docId}-{safeFileName}`.
- `src/lib/documents.ts` wraps `getSupabase().storage.from('matter-docs')` for
  upload/download/remove + the `documents` table rows (with a `globalThis` memory fallback
  for keyless dev, matching the rest of the codebase).

---

## 6. The reading call (the crux)

Because citations can't be combined with a JSON schema, extraction is **citations-first,
then parsed** — recommended shape:

1. Build the user message: `[ documentBlock(pdf, citations:true), textBlock(instructions) ]`.
2. System/instructions: list the rubric's fields (key + label + description) and ask Claude
   to output, **one per line**, `『key』: value` **only for fields actually present in the
   document**, quoting the supporting text so the citation attaches. No guessing; skip
   absent fields; flag anything illegible.
3. Response parsing: walk `response.content` text blocks; for each `『key』: value` line, read
   the `citations[]` on that block → `page_location.start_page_number` + `cited_text`.
   Produce `{ key, value, quote: cited_text, page, confidence }`.
4. Map `key` → the rubric field; drop unknown keys; keep only fields the rubric expects.

Main technical risk: line-format ↔ citation alignment reliability. **Prototype this first in
slice 2** on 3–4 real sample PDFs. Fallback if parsing is flaky: a two-call approach — (a) a
normal JSON `jsonCall` over the PDF's extracted text for `{key,value,quote}`, then (b) a
citations pass to resolve each quote to a page — at higher cost/latency.

Model: start on `claude-haiku-4-5` (100-page cap). Route to a 1M-context model only if
`page_count > 100`, or reject with an explicit "document too long to read automatically —
review manually" status.

---

## 7. Merge + guardrails

- Merge doc facts into `result.fields`: **document evidence only fills fields the enquiry
  text left empty** (current stated evidence always wins — same rule as client-memory carry-
  forward). A doc value that *conflicts* with a stated value is **not** silently overwritten;
  it becomes a **review item** ("Document says X; the enquiry said Y — confirm").
- Recompute `gaps` + `readiness` after merge (content-aware readiness: a required field the
  PDF satisfies now counts).
- **Never auto-approve ambiguity.** Low-confidence / illegible / handwriting → the field is
  *not* set from the doc; instead a "Questions to resolve" review item is added
  ("Handwritten signature on p.4 — verify manually"), and the document status is `read` with
  a note, or `unreadable` if nothing usable came out.
- Gap consequences (already grounded, §recent work) stay honest — a required doc that's
  detected-but-unread reads "referenced, not yet read".

---

## 8. Evidence Drawer changes

- **Documents section** becomes real: each `documents` row with its status
  (`attached · not yet read` / `read` / `unreadable`) and a **Read now** action (slice 2).
- Document-sourced facts render with the page-cited provenance (`Document: name · p.2`), and
  the "source" hover shows the cited snippet (reuses the existing traceability interaction).
- **Slice 3:** an inline PDF viewer in the drawer; clicking a document-fact scrolls the
  viewer to its page and highlights the region (extends the connective-tissue pattern).

---

## 9. Privacy / residency

- Files at rest: **private Sydney bucket**, service-role only, streamed through
  ownership-checked server routes (never public URLs).
- In transit to Claude: the Anthropic API **does not train on API inputs** by default. For
  firms needing stronger guarantees, note zero-data-retention as an org-level Anthropic
  config (separate procurement step, not code).
- Deletion: removing a matter/document removes the storage object + row (hard delete is a
  human action, per the safety rules).

---

## 10. Slices & sequencing

1. **Plumbing (no AI):** `documents` table + Sydney bucket + `src/lib/documents.ts` + upload
   control on the matter page + honest "attached · not yet read" in the drawer. Ships real
   value + de-risks storage/ownership/streaming.
2. **Reading:** the citations call + parser (prototype §6 first), merge + guardrails, gaps/
   readiness update, "Read now" action, page-cited facts in the drawer. This is the payload.
3. **Viewer + more formats:** in-drawer PDF viewer with click-to-page; then DOCX
   (convert via a lib) and spreadsheets (parse to text/CSV) as native reads don't cover them.
4. **Inbound email attachments:** capture Postmark attachment payloads in the webhook → store
   + auto-read on ingest, so emailed PDFs are read before the professional opens the matter.

Each slice: `tsc` + `build` clean, a demo-mode harness, and (slice 2) a live-Haiku check on
real sample PDFs. No migration is destructive; the storage bucket + `documents.sql` are the
only setup steps.

---

## 11. Open decisions (for slice 2, not now)

- Auto-read on upload vs. an explicit "Read now" click (cost control vs. immediacy).
- Page-count ceiling for auto-read on Haiku (100) vs. routing big PDFs to a larger model.
- Whether document facts need their own "reviewed" acknowledgement before counting toward
  readiness, or the existing brief/approval gate is sufficient.

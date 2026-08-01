# Briefly

An AI intake layer for professional service firms. A client submits a messy,
unstructured description of their problem; Briefly classifies it, extracts the
facts into a structured matter, builds a sourced timeline, flags what's missing,
scores readiness, and drafts the follow-up — before the professional touches it.
The professional's job shifts from doing intake to **approving** it.

The engine is jurisdiction- and vertical-agnostic: firms author their own
rubrics (extraction schemas), so the same pipeline serves an immigration
adviser, a bookkeeper, and a small legal practice without code changes.

## The core loop (Phase 0)

```
Submission → Classify → Extract (facts + sourced timeline)
           → Gap analysis → Readiness score → Drafted follow-up → Human approval
```

- **Classify** — match the submission to one of the firm's rubrics.
- **Extract** — pull only facts explicitly present; each tagged to its source snippet. Absent data is marked missing, never invented.
- **Gaps & readiness** — computed **deterministically in code** (not by the model) so the score can't be fabricated.
- **Draft** — if anything is missing, a follow-up email requesting exactly the missing items. At 100% no email is drafted and the matter is flagged ready for review.
- **Approve** — every consequential action passes through a human gate. Briefly never sends or acts on its own.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- Anthropic SDK, `claude-haiku-4-5` for extraction (cost ≈ a fraction of a cent per matter)
- Supabase (Postgres, service-role only) for persistence

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste a client enquiry (or click **Use sample**), and
run the intake.

### Configuration (all optional for a local demo)

Copy `.env.example` to `.env.local`:

- **`ANTHROPIC_API_KEY`** — enables the live Haiku-backed pipeline. Without it, a
  deterministic mock extractor runs so the loop is demoable end-to-end.
- **`BRIEFLY_MODEL`** — override the extraction model (default `claude-haiku-4-5`).
- **`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`** — server-side, service-role
  only (never exposed to the browser). Without them, matters are stored in memory
  (lost on restart). Run `supabase/schema.sql` first.

## Project layout

```
src/lib/
  types.ts        domain types (Rubric, Matter, PipelineResult)
  rubrics.ts      seed rubrics (immigration, bookkeeping, legal)
  anthropic.ts    Anthropic client + structured-output helper + cost model
  pipeline.ts     the perceive/reason/act pipeline (live)
  mock.ts         deterministic, key-free fallback pipeline
  gaps.ts         deterministic gap analysis + readiness score
  supabase.ts     server-side service-role client
  store.ts        matter persistence (Supabase or in-memory)
src/app/
  page.tsx              submission form + matter list
  matters/[id]/page.tsx matter review view
  actions.ts            server actions (create matter, approve)
supabase/schema.sql     Postgres schema (RLS on, service-role only)
```

## Roadmap (from the PRD)

- **Phase 1** — inbound email ingestion (auto-create matters from client email).
- **Phase 1.5** — the "Act" step. ✅ Low-infra send shipped: **Approve & send** opens the professional's own mail client with the draft prefilled (mailto), plus **Copy draft**; the human reviews and sends. Full transactional send (Resend) is the follow-on.
- **Phase 2** — rubric authoring & reassignment for misclassified matters.
- **Phase 3** — firm workflow (roles, assignment, senior review).

## Notes for local dev

`npm run dev` uses Turbopack, which spawns a Node worker for PostCSS — that
worker must find `node` on `PATH` (your shell already has it). The bundled
`.claude/launch.json` runs `next dev --webpack` because the sandboxed preview
launcher has a stripped `PATH`; both produce the same app.

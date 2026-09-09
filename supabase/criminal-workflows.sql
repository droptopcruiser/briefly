-- Criminal Chambers workflows reuse the shared work_briefs table by `kind`.
-- Widen the kind CHECK constraint to allow the criminal workflow kinds alongside
-- the existing conveyancing ones. Non-destructive (only permits new values).
--
-- Applied to the Briefly project (czbqupxdbzgivrfsbzpq) on 2026-09-09 via migration
-- `widen_work_briefs_kind_for_criminal_workflows`. Kept here so a fresh database gets it.

alter table public.work_briefs drop constraint if exists work_briefs_kind_check;

alter table public.work_briefs add constraint work_briefs_kind_check
  check (kind in (
    'initial_brief',
    'consultation_packet',
    'file_open',
    'disclosure_pack',
    'disclosure_note',
    'correspondence',
    'hearing_prep',
    'review_pack'
  ));

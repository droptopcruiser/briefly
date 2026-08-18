-- Lifecycle slice one: the Pre-Consultation Packet.
--
-- A matter is ready → the professional sets a consultation date → Briefly compiles
-- a Pre-Consultation Packet (matter summary, source-backed facts, document status,
-- unresolved questions, suggested agenda). The packet is another versioned,
-- source-backed, review-gated artifact — stored in the existing work_briefs table,
-- discriminated by `kind`.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- The field-based trigger — no calendar integration.
alter table matters add column if not exists consultation_at timestamptz;

-- One artifact table, two kinds. Existing rows default to the Initial Work Brief.
alter table work_briefs add column if not exists kind text not null default 'initial_brief';
alter table work_briefs drop constraint if exists work_briefs_kind_check;
alter table work_briefs add constraint work_briefs_kind_check
  check (kind in ('initial_brief', 'consultation_packet'));

select kind, count(*) from work_briefs group by kind;

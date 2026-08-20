-- Slice 2: pending document evidence. Each read document holds the facts it
-- produced, awaiting the professional's confirmation — they do NOT touch the matter
-- or its readiness until confirmed. Safe to re-run.

alter table documents
  add column if not exists pending_facts jsonb not null default '[]'::jsonb;

select count(*) as documents from documents;

-- Migration document attachment binding (P5b made real): a document attaches to a
-- PARTY + rubric item so the outstanding gap drops. Additive; no drops.
alter table if exists documents
  add column if not exists person_id text,
  add column if not exists item_key text,
  add column if not exists sensitive boolean not null default false;

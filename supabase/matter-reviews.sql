-- "Since the last review" — stored review baselines for a matter.
--
-- Each row is a snapshot of the matter's extracted state (facts, documents,
-- gaps, readiness, message count) captured at a genuine review event: approving
-- & sending a follow-up, approving an Initial Work Brief, marking a matter
-- complete, or an explicit "Mark reviewed". The most recent row is the current
-- baseline; the matter view diffs the live matter against it.
--
-- v1 is matter-level. `reviewed_by` is stored (nullable) so we can move to
-- per-professional review cursors later without another migration.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists matter_reviews (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  matter_id   uuid not null,
  reviewed_by uuid,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists matter_reviews_matter_idx on matter_reviews (matter_id, created_at desc);
alter table matter_reviews enable row level security;
-- Service-role only (server-side), like the rest of the schema. No policies.

select count(*) from matter_reviews;

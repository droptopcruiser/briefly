-- Initial Work Brief — Briefly's first prepared-work artifact.
--
-- When a matter meets its rubric's ready criteria, Briefly prepares a concise,
-- source-backed brief for professional review. A brief is versioned and has its
-- own lifecycle (draft → in_review → approved → superseded), kept separate from
-- the matter's workflow state and from the readiness assessment. Refreshing a
-- brief supersedes the prior version, so reviewed/approved history is preserved.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists work_briefs (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  matter_id   uuid not null,
  version     int  not null default 1,
  state       text not null default 'in_review'
                check (state in ('draft', 'in_review', 'approved', 'superseded')),
  content     jsonb not null,
  source_hash text,          -- fingerprint of the matter submission at generation → staleness
  readiness   int,
  cost_cents  numeric default 0,
  mocked      boolean default false,
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid
);
create index if not exists work_briefs_matter_idx on work_briefs (matter_id, version desc);
alter table work_briefs enable row level security;
-- Service-role only (server-side), like the rest of the schema. No policies.

-- Extend the matter workflow states with 'in_progress' (the brief was approved
-- and the work is underway) — a distinct state between ready_for_you and completed.
alter table matters drop constraint if exists matters_status_check;
alter table matters add constraint matters_status_check
  check (status in ('preparing', 'ready_for_review', 'awaiting_client', 'ready_for_you', 'in_progress', 'completed'));

select count(*) from work_briefs;

-- Briefly schema. Run in the Supabase SQL editor (or via the CLI).
--
-- Client submissions are firm data: access is service-role only. RLS is enabled
-- with no policies, so the anon/authenticated keys can read nothing — only the
-- service role (used server-side in src/lib/supabase.ts) bypasses RLS.

create extension if not exists "pgcrypto";

create table if not exists matters (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  client_name  text,
  client_email text,
  submission   text not null,
  result       jsonb,
  status       text not null default 'processing'
                 check (status in ('processing','needs_info','ready_for_review','approved')),
  approved_at  timestamptz
);

create index if not exists matters_created_at_idx on matters (created_at desc);

alter table matters enable row level security;
-- No policies: only the service_role key (server-side) can read/write.

-- Rubrics are firm-authored (BYOR). v1 ships seed rubrics in code
-- (src/lib/rubrics.ts); persist them here when rubric authoring lands (Phase 2).
create table if not exists rubrics (
  id         text primary key,
  name       text not null,
  vertical   text not null,
  definition jsonb not null,
  created_at timestamptz not null default now()
);

alter table rubrics enable row level security;

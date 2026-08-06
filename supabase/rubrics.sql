-- Rubric authoring (BYOR). Firms author their own matter types; each rubric
-- belongs to an account. Run in the Supabase SQL editor.
--
-- The rubrics table already exists (from schema.sql/reset.sql) with:
--   id text pk, name, vertical, definition jsonb, created_at.
-- This adds account ownership + an updated_at stamp. create-if-not-exists makes
-- it safe to run whether or not the table is already present.

create table if not exists rubrics (
  id         text primary key,
  account_id uuid references accounts(id),
  name       text not null,
  vertical   text not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rubrics add column if not exists account_id uuid references accounts(id);
alter table rubrics add column if not exists updated_at timestamptz not null default now();
create index if not exists rubrics_account_idx on rubrics (account_id);

alter table rubrics enable row level security;
-- Service-role only, like the rest.

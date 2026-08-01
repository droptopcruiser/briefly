-- One-time RESET for Briefly. DESTRUCTIVE: drops the existing `matters` and
-- `rubrics` tables (and their data) and recreates them with this build's schema.
-- Use this only when you intend to replace an incompatible/older table.
-- For a non-destructive apply on a fresh project, use schema.sql instead.

create extension if not exists "pgcrypto";

drop table if exists matters cascade;
drop table if exists rubrics cascade;

create table matters (
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

create index matters_created_at_idx on matters (created_at desc);

alter table matters enable row level security;
-- No policies: only the service_role/secret key (server-side) can read/write.

create table rubrics (
  id         text primary key,
  name       text not null,
  vertical   text not null,
  definition jsonb not null,
  created_at timestamptz not null default now()
);

alter table rubrics enable row level security;

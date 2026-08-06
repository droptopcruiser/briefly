-- Metering (provider-agnostic). Accounts own matters and hold a plan + credit
-- balance; usage is counted per account per calendar month and capped by the
-- plan, with purchased credits covering overage. Run in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  plan          text not null default 'trial',
  credits       integer not null default 0,
  owner_user_id uuid,
  created_at    timestamptz not null default now()
);
alter table accounts enable row level security;
-- Service-role only, like matters.

-- The single account for now (multi-tenant firms come later). Fixed id so the
-- app and this migration agree on which account owns existing matters.
insert into accounts (id, name, plan)
values ('00000000-0000-4000-8000-000000000001', 'Default firm', 'trial')
on conflict (id) do nothing;

-- Matters belong to an account.
alter table matters add column if not exists account_id uuid references accounts(id);
update matters set account_id = '00000000-0000-4000-8000-000000000001' where account_id is null;
create index if not exists matters_account_created_idx on matters (account_id, created_at desc);

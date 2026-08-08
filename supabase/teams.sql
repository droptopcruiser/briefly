-- Teams v1: multiple users per account, roles, pending invites, matter assignment.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).

-- Members of a firm. One account per user in v1 (unique user_id). email/name are
-- denormalized for display so we don't need the auth admin API.
create table if not exists account_members (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id    uuid not null,
  email      text,
  name       text,
  role       text not null default 'member',   -- 'owner' | 'admin' | 'member'
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create unique index if not exists account_members_user_key on account_members (user_id);
alter table account_members enable row level security;

-- Pending invites, consumed when the invited email signs in.
create table if not exists account_invites (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  email      text not null,
  role       text not null default 'member',
  invited_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists account_invites_email_key on account_invites (account_id, lower(email));
alter table account_invites enable row level security;

-- Matter assignment (the "hand off to a teammate" field).
alter table matters add column if not exists assigned_to uuid;

-- Backfill: each existing account's owner becomes an 'owner' member.
insert into account_members (account_id, user_id, email, name, role)
select a.id,
       a.owner_user_id,
       u.email,
       coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name'),
       'owner'
from accounts a
join auth.users u on u.id = a.owner_user_id
where a.owner_user_id is not null
on conflict (account_id, user_id) do nothing;

select account_id, email, role from account_members;

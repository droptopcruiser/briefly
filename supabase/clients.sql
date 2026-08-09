-- Client memory: a client is an entity per (account, email). Matters join by
-- client_email; this table gives clients a stable id, name, and last-seen for the
-- Clients pages. Carried-forward facts are derived from matters, not stored here.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists clients (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  email        text not null,
  name         text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists clients_account_email_key on clients (account_id, lower(email));
alter table clients enable row level security;

-- Backfill one client per distinct email from existing matters (latest name/date).
insert into clients (account_id, email, name, last_seen_at)
select distinct on (m.account_id, lower(m.client_email))
       m.account_id,
       lower(m.client_email),
       m.client_name,
       m.created_at
from matters m
where m.account_id is not null and m.client_email is not null and m.client_email <> ''
order by m.account_id, lower(m.client_email), m.created_at desc
on conflict (account_id, lower(email)) do nothing;

select account_id, email, name from clients;

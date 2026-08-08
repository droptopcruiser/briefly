-- Waitlist: emails captured from the public landing / onboarding when someone
-- wants access but doesn't have an invite code yet.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- One row per email (case-insensitive).
create unique index if not exists waitlist_email_key on waitlist (lower(email));

alter table waitlist enable row level security;
-- Service-role only (no policies), like matters/accounts.

select count(*) from waitlist;

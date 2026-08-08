-- Matter lifecycle: an activity trail (matter_events) + an updated_at so active
-- matters sort to the top. Client replies thread into the existing matter and
-- re-score it (handled in app code, not SQL).
--
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists matter_events (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  matter_id  uuid not null,
  type       text not null,   -- created | client_replied | readiness_changed | became_ready | approved | sent | assigned
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists matter_events_matter_idx on matter_events (matter_id, created_at);
alter table matter_events enable row level security;

alter table matters add column if not exists updated_at timestamptz;
update matters set updated_at = created_at where updated_at is null;

select count(*) from matter_events;

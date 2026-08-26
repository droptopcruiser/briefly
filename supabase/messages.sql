-- Conversation log: every message exchanged on a matter, both directions, so the
-- Evidence drawer can show the real back-and-forth (not just facts extracted from
-- it). Inbound = the client's words; outbound = what the firm sent via Briefly.
-- Service-role only (RLS on, no public policies), like matter_events.

create table if not exists matter_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  matter_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  subject text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists matter_messages_matter_idx
  on matter_messages (matter_id, created_at);

alter table matter_messages enable row level security;

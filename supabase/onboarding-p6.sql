-- P6 onboarding — additive only (no drops, safe on the live DB).
--
-- Firm gets a practice type and the list of rulebooks it started with; the
-- per-user profile records when onboarding finished; a matter can be flagged as
-- the seeded sample so the home page can hide the "load sample" button and the
-- list can badge it.

alter table if exists accounts
  add column if not exists practice_type text,           -- 'immigration' | 'conveyancing'
  add column if not exists firm_books text[] not null default '{}'::text[];

alter table if exists account_members
  add column if not exists onboarded_at timestamptz;

alter table if exists matters
  add column if not exists sample boolean not null default false;

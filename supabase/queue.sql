-- Needs Attention queue: manual queue controls on a matter.
-- Additive and safe to re-run. Until this is applied, the queue still works from
-- computed signals; only Snooze and Change-priority need these columns to persist.

alter table matters add column if not exists snoozed_until timestamptz;
alter table matters add column if not exists priority_override text
  check (priority_override in ('critical', 'review', 'waiting', 'ready', 'parked'));

-- The queue reads all active matters for an account; the existing account_id +
-- updated_at ordering already covers it, so no new index is required here.

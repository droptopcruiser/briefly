-- Follow-up reminders + the lifecycle status refactor.
--
-- 1) Track when Briefly last drafted a chase for a stuck matter (throttle + drives
--    the "noticed it's been waiting" banner/bell) and how many times, so a repeat
--    chase can differ from the first.
-- 2) Remap existing matter statuses to the corrected lifecycle where "approved" is
--    no longer a state: preparing / ready_for_review / awaiting_client /
--    ready_for_you / completed. The old status CHECK constraint is dropped and
--    re-added with the new set.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table matters drop constraint if exists matters_status_check;

alter table matters add column if not exists last_nudged_at timestamptz;
alter table matters add column if not exists nudge_count int not null default 0;

-- Status remap (order matters: free up 'ready_for_review' before reusing it).
update matters set status = 'ready_for_you'   where status = 'ready_for_review';
update matters set status = 'ready_for_review' where status = 'needs_info';
update matters set status = 'awaiting_client'
  where status = 'approved' and coalesce((result->>'readiness')::int, 0) < 100;
update matters set status = 'completed'        where status = 'approved';
update matters set status = 'preparing'        where status = 'processing';

alter table matters add constraint matters_status_check
  check (status in ('preparing', 'ready_for_review', 'awaiting_client', 'ready_for_you', 'completed'));

select status, count(*) from matters group by status;

-- Per-account timezone, so "this month" usage + stats align with the firm's
-- local calendar instead of UTC. Null = UTC (no behaviour change until set).
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table accounts add column if not exists timezone text;

select id, name, timezone from accounts;

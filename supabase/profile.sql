-- User profile picture. Display name reuses account_members.name.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table account_members add column if not exists avatar_url text;

select user_id, name, avatar_url from account_members;

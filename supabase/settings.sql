-- Account settings for outbound follow-ups: an email signature/footer appended
-- to every sent draft, and a Reply-To preference (where client replies land).
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).

alter table accounts add column if not exists email_signature text;
-- 'firm'  -> replies go to reply_to_email; 'intake' -> replies loop into Briefly
-- (the account's inbound intake address); null -> no explicit Reply-To.
alter table accounts add column if not exists reply_to_mode  text;
alter table accounts add column if not exists reply_to_email text;

select id, name, email_signature, reply_to_mode, reply_to_email from accounts;

-- Multi-tenant Phase A: accounts get an owner, a readable slug, and a unique
-- inbound intake token (the localpart of their intake email address).
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).

-- 1. New columns.
alter table accounts add column if not exists slug          text;
alter table accounts add column if not exists inbound_token text;

-- 2. Claim the existing default account for Luke, and give it a slug + token so
--    getCurrentAccount() (owner_user_id) and inbound routing both resolve it.
update accounts
set
  owner_user_id = coalesce(
    owner_user_id,
    (select id from auth.users
      where email in ('heyluke24@gmail.com', 'luke@brieflyhub.app')
      order by created_at asc
      limit 1)
  ),
  slug          = coalesce(slug, 'briefly'),
  inbound_token = coalesce(inbound_token, 'briefly-' || substr(md5(random()::text), 1, 6))
where id = '00000000-0000-4000-8000-000000000001';

-- 3. One account per owner (teams come later); tokens are globally unique.
create unique index if not exists accounts_owner_user_id_key
  on accounts (owner_user_id)
  where owner_user_id is not null;

create unique index if not exists accounts_inbound_token_key
  on accounts (inbound_token)
  where inbound_token is not null;

-- Existing matters/rubrics already carry account_id = the default account, so no
-- backfill is needed. Check the result:
select id, name, slug, inbound_token, owner_user_id from accounts;

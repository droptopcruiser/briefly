-- Slice 1: attachments plumbing. A PRIVATE bucket in the Sydney project + a
-- documents table. No RLS policy on the bucket — all access is service-role,
-- server-side only (files are streamed through ownership-checked routes, never
-- exposed by public URL). Safe to re-run.

-- The private bucket.
insert into storage.buckets (id, name, public)
values ('matter-docs', 'matter-docs', false)
on conflict (id) do nothing;

-- The document records.
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null,
  matter_id     uuid not null,
  file_name     text not null,
  mime          text not null,               -- 'application/pdf' for v1
  size_bytes    bigint not null,
  storage_path  text not null,               -- path within the matter-docs bucket
  page_count    int,
  status        text not null default 'attached'
                check (status in ('attached', 'reading', 'read', 'unreadable')),
  read_at       timestamptz,
  cost_cents    numeric default 0,
  created_at    timestamptz not null default now()
);
create index if not exists documents_matter_idx on documents(matter_id);

select count(*) as documents from documents;

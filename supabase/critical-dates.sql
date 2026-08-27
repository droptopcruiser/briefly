-- Typed critical dates (settlement first). Stores only the HUMAN DECISION about a
-- matter's date (confirm / reject); the suggestion itself is derived on read from
-- the extracted facts, so nothing here is written on ingest. Additive; safe to re-run.

create table if not exists matter_critical_dates (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null,
  matter_id     uuid not null,
  kind          text not null default 'settlement' check (kind in ('settlement')),
  status        text not null check (status in ('confirmed', 'rejected')),
  value         text,                    -- human display, e.g. "13 Mar 2027"
  iso           text,                    -- YYYY-MM-DD when parseable, else null
  source        text,                    -- the verbatim quote / provenance
  from_document jsonb,                   -- { fileName, page } when from a read doc
  confirmed_by  uuid,
  confirmed_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (matter_id, kind)
);

create index if not exists matter_critical_dates_account_idx
  on matter_critical_dates (account_id, kind);

-- Service-role only (the app uses the service key); RLS on with no public policy.
alter table matter_critical_dates enable row level security;

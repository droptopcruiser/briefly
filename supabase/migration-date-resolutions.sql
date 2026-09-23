-- Human's date-conflict picks for a migration matter (slotKey → chosen ISO). Kept off
-- result so a re-extract never wipes a decision. Additive.
alter table if exists matters
  add column if not exists migration_date_resolutions jsonb not null default '{}'::jsonb;

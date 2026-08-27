-- Add the finance/unconditional date kind to the typed critical-dates table.
-- Widens the kind CHECK from ('settlement') to ('settlement','finance').
-- Additive and safe to re-run.

alter table matter_critical_dates drop constraint if exists matter_critical_dates_kind_check;
alter table matter_critical_dates
  add constraint matter_critical_dates_kind_check check (kind in ('settlement', 'finance'));

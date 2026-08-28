-- Records which candidate dates were known when a critical date was confirmed, so
-- a LATER source introducing a genuinely new/different date can reopen (mark stale)
-- the resolution — without a losing candidate the user already dismissed re-triggering it.
-- Additive; safe to re-run.

alter table matter_critical_dates add column if not exists known_isos jsonb;

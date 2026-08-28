-- RELEASE B (stale / third-date detection). NOT needed for the conflict resolver.
-- Records which candidate dates were known when a critical date was confirmed, so a
-- LATER source introducing a genuinely new/different date can reopen (mark stale) the
-- resolution — without a losing candidate the user already dismissed re-triggering it.
--
-- ORDER OF OPERATIONS to enable stale safely:
--   1. Run this migration.
--   2. Set env CRITICAL_DATE_STALE=1 (the feature flag) and redeploy.
--   3. Verify against real persistence (confirm a date, add a new conflicting date).
-- Until the flag is on, stale is fully disabled and known_isos is never written.
-- Additive; safe to re-run.

alter table matter_critical_dates add column if not exists known_isos jsonb;

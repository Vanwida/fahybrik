-- FAHYBRIK migration 0081: auto-import give-up guard — additive columns on `races`.
--
-- WHY
-- ---
-- The auto-result cron (web/lib/cron/auto-import-results.ts) re-pulls an athlete's
-- FULL hyresult history whenever they have a passed pending target with no result.
-- Without a give-up signal an UNMATCHABLE target — the athlete never raced it, a
-- DNS, a format/venue the importer can't reconcile — keeps that athlete "due"
-- FOREVER: the cron re-scrapes their whole history every single run, indefinitely.
--
-- WHAT (both additive, both read/written ONLY by the cron — no other reader changes)
-- ----
--   * auto_import_attempts — how many times the cron has chased this pending target.
--     The due query skips targets at/over the app-level cap
--     (MAX_AUTO_IMPORT_ATTEMPTS in lib/cron/auto-import-results.ts), so an
--     unmatchable target is dropped after N tries.
--   * last_auto_import_at   — when the cron last chased it (observability; lets a
--     future change throttle retries — the cap is the primary give-up lever).
--
-- The cron ALSO floors by race_date (only chases recently-passed targets), so a
-- target ages out of the due set regardless of attempts. Two independent bounds:
-- attempts (the chased-but-unmatchable case) and the window (the simply-old case).
--
-- Idempotent (add column if not exists). Existing rows default to 0 attempts /
-- null last-checked → eligible exactly as before for the first post-migration run,
-- then bounded.
begin;

alter table races
  add column if not exists auto_import_attempts int not null default 0,
  add column if not exists last_auto_import_at   timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'races_auto_import_attempts_chk') then
    alter table races add constraint races_auto_import_attempts_chk
      check (auto_import_attempts >= 0);
  end if;
end $$;

commit;

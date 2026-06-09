-- FAHYBRIK migration 0005: athlete intake (Pablo handoff ritual)
--
-- UX spec /docs/ux/11-coach-athlete-intake.md (signed off 2026-05-07).
--
-- After an athlete completes onboarding, Pablo runs a 5-step intake review:
--   profile review → macrocycle config → level assignment → baseline tests
--   → welcome message. The athlete is *not* fully active in the cohort until
--   intake is committed (defines `intake_completed_at`).
--
-- Columns:
--   * `intake_completed_at` — when Pablo signed off; null = pending intake
--   * `intake_by_coach_id`  — which coach ran the intake (auditable)
--   * `intake_notes_json`   — Pablo's snapshot of decisions: assigned level,
--                             chosen block_specs, baseline tests scheduled,
--                             warnings acknowledged. Free-form so the spec
--                             can evolve without migrations.

begin;

alter table athletes
  add column intake_completed_at timestamptz,
  add column intake_by_coach_id  bigint references coaches(id) on delete set null,
  add column intake_notes_json   jsonb not null default '{}'::jsonb;

-- Pendientes intake list — partial index over the coach view.
create index athletes_pending_intake_idx
  on athletes (coach_id, onboarded_at desc)
  where intake_completed_at is null and onboarded_at is not null;

commit;

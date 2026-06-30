-- 0090_workout_origin_libre.sql
-- PROVENANCE for a workout_assignment: who ORIGINATED it — the coach's plan, or
-- the athlete's own "entreno libre / no prescrito".
--
-- WHY
-- ---
-- The athlete can now build + execute their OWN workout (modality + format +
-- bouts) on-device. The locked model persists it through the EXISTING assignment
-- path (a real templates + template_segments + workout_assignments + execution),
-- so every reader (plan-week, analytics, the coach's joins) keeps working with
-- ZERO new branches. But a self-made session must NOT be confused with prescribed
-- coach work: it COMPLEMENTS the plan, it never alters compliance. That requires a
-- first-class discriminator on the assignment — this column.
--
-- THE MODEL
-- ---------
--   'coach' (DEFAULT) — the assignment came from the coach's plan (every existing
--                       row inherits this, preserving current behaviour exactly).
--   'self'            — the athlete originated it (entreno libre). Excluded from
--                       coach-plan adherence; surfaced to the coach as the
--                       'workout_libre' attention signal; tagged "Libre" on iOS.
--
-- Designed EXTENSIBLE: the enum can later grow (e.g. 'imported' for a 3rd-party
-- import) without a type rewrite. Only the two values needed today are added now.
--
-- ADDITIVE + idempotent: a guarded `create type`, an `add column if not exists`
-- with a safe default, and an `if not exists` partial index for fast libre
-- lookups. Journaled by filename stem (0090_workout_origin_libre); re-running is a
-- no-op. Harmless to existing data — defaulting to 'coach' makes every current
-- assignment read exactly as before.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workout_origin') then
    create type workout_origin as enum ('coach', 'self');
  end if;
end $$;

alter table workout_assignments
  add column if not exists origin workout_origin not null default 'coach';

-- Fast lookups of an athlete's libre sessions, newest first (the 'workout_libre'
-- signal CTE + any future libre history read). Partial: indexes only self rows.
create index if not exists workout_assignments_self_origin_idx
  on workout_assignments (athlete_id, scheduled_for desc)
  where origin = 'self';

comment on column workout_assignments.origin is
  'Who originated the assignment: coach (prescribed plan; default) | self (athlete''s entreno libre — complements the plan, excluded from coach-plan adherence, surfaced as the workout_libre signal).';

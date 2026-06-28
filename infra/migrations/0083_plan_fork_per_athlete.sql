-- 0083: Per-athlete plan BIFURCATION (fork) — data-model foundation.
--
-- A workout/plan lives as a TEMPLATE (`templates` + `template_segments`, the
-- coach's reusable library). Assigning a template to an athlete must produce an
-- INDEPENDENT per-athlete COPY (a fork) so that:
--   • editing one athlete's copy never touches the library template nor any
--     other athlete's copy, and
--   • editing the library template never propagates to already-assigned athletes
--     (the fork is FROZEN at assign time).
--
-- The content model (templates + template_segments, referenced by
-- workout_assignments.template_id) is already the right shape and is already
-- per-assignment for inline-materialized sessions. This migration:
--   1. tags instances (instance_athlete_id / instance_of_template_id),
--   2. backfills every EXISTING assignment so it owns a private 1:1 instance.
--
-- Additive + idempotent (IF NOT EXISTS + guarded backfill). Mirrors the runtime
-- fork helper `web/lib/dashboard/coach/template-instance.ts` (keep column lists
-- in sync).

begin;

-- =============================================================================
-- 1. Provenance columns
-- =============================================================================
--  instance_athlete_id      NON-NULL ⇒ this `templates` row is a per-athlete fork
--                           (an instance), owned by that athlete's assignment.
--                           NULL ⇒ a library template. ON DELETE CASCADE: an
--                           athlete's instances die with the athlete (their
--                           workout_assignments already cascade the same way).
--  instance_of_template_id  the library template this instance was cloned from
--                           (informational lineage; the fork is decoupled, so
--                           ON DELETE SET NULL keeps the frozen copy if the
--                           source library template is later deleted). NULL for
--                           inline-authored instances and for library rows.
alter table templates
  add column if not exists instance_athlete_id bigint
    references athletes(id) on delete cascade,
  add column if not exists instance_of_template_id bigint
    references templates(id) on delete set null;

-- Library lookups filter on `instance_athlete_id is null`; instances are read
-- only through their assignment (workout_assignments.template_id). Partial index
-- keeps the coach library list small + fast.
create index if not exists templates_library_idx
  on templates (coach_id)
  where archived_at is null and instance_athlete_id is null;

create index if not exists templates_instance_athlete_idx
  on templates (instance_athlete_id)
  where instance_athlete_id is not null;

-- =============================================================================
-- 2a. Backfill — tag the PRIVATE templates in place (no clone, no id churn).
-- =============================================================================
-- A template referenced by exactly ONE assignment is already private to that
-- assignment (the dominant case: inline-materialized per-session content). Tag
-- it as that athlete's instance in place — no clone, no orphan, ids preserved
-- (so already-correct plans stay byte-identical). Guarded by `is null` so a
-- re-run is a no-op.
update templates t
set instance_athlete_id = wa.athlete_id
from workout_assignments wa
where wa.template_id = t.id
  and t.instance_athlete_id is null
  and (select count(*) from workout_assignments x where x.template_id = t.id) = 1;

-- =============================================================================
-- 2b. Backfill — CLONE the SHARED templates per assignment (freeze + isolate).
-- =============================================================================
-- Any assignment still pointing at a template that is NOT its own instance is a
-- shared reference (a library workout reused across days/athletes, e.g. the
-- legacy `session.template_id` path). Give each such assignment its own private
-- clone and leave the library original intact (instance_athlete_id stays NULL on
-- it, so it remains reusable). Cloning never tags the original, so the original
-- is preserved regardless of how its reference count drops during the loop.
-- Idempotent: after this, every assignment points at an instance owned by its
-- athlete, so a re-run selects nothing.
do $$
declare
  rec record;
  v_new_id bigint;
begin
  for rec in
    select wa.id as assignment_id, wa.athlete_id, wa.template_id
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where t.instance_athlete_id is distinct from wa.athlete_id
    order by wa.id
  loop
    insert into templates (
      coach_id, name, description, format, target_block, target_level,
      version, day_position, is_draft, is_partner_workout, warmup, cooldown,
      coach_notes, meta_json, demo_video_url, methodology_group_id,
      instance_athlete_id, instance_of_template_id
    )
    select
      coach_id, name, description, format, target_block, target_level,
      version, day_position, is_draft, is_partner_workout, warmup, cooldown,
      coach_notes, meta_json, demo_video_url, methodology_group_id,
      rec.athlete_id, coalesce(instance_of_template_id, id)
    from templates
    where id = rec.template_id
    returning id into v_new_id;

    insert into template_segments (
      template_id, position, exercise_id, params_json, notes,
      block_position, block_format, block_title, prescription_json
    )
    select
      v_new_id, position, exercise_id, params_json, notes,
      block_position, block_format, block_title, prescription_json
    from template_segments
    where template_id = rec.template_id
    order by position;

    update workout_assignments
    set template_id = v_new_id,
        template_version = (select version from templates where id = v_new_id),
        updated_at = now()
    where id = rec.assignment_id;
  end loop;
end $$;

commit;

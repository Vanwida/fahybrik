import 'server-only';

import type { Sql } from '@/lib/db';

/**
 * Per-athlete plan BIFURCATION — the fork primitive.
 *
 * A workout/plan lives as a TEMPLATE (`templates` + `template_segments`, the
 * coach's reusable library). Assigning a template to an athlete must produce an
 * INDEPENDENT per-athlete COPY (a fork) so that:
 *   • editing one athlete's copy never touches the library template nor any other
 *     athlete's copy, and
 *   • editing the library template never propagates to already-assigned athletes
 *     (the fork is FROZEN at assign time).
 *
 * This is the SINGLE SOURCE OF TRUTH for the fork. Every place that points a
 * `workout_assignments` row at a library template (assign-month/week, manual
 * day creation, week-adjustment swaps) routes through here so the invariant
 * "every assignment owns a private 1:1 instance" holds across the whole system.
 * The 0083 backfill performs the SAME clone in SQL for historical rows — keep
 * the column lists below in sync with that migration.
 *
 * An INSTANCE is a `templates` row with `instance_athlete_id` set (NON-NULL);
 * a LIBRARY template has it NULL. `instance_of_template_id` records the library
 * template the instance was cloned from (informational lineage only — the fork
 * is fully decoupled; the source may even be deleted, hence ON DELETE SET NULL).
 *
 * Returns the new instance's `{ template_id, version }`, or `null` when the
 * source template no longer exists (caller then skips the assignment).
 */
export async function cloneTemplateAsInstance(params: {
  client: Sql;
  source_template_id: number | bigint;
  athlete_id: number | bigint;
}): Promise<{ template_id: number; version: number } | null> {
  const src = Number(params.source_template_id);
  const ath = Number(params.athlete_id);

  // Deep-copy the template's content columns into a fresh row tagged as this
  // athlete's instance. Identity/versioning/pairing columns are intentionally
  // reset: `parent_template_id` (version lineage) and `paired_with_template_id`
  // (dobles pairing) are library concepts, not instance concepts; `archived_at`
  // and the timestamps default fresh. `meta_json` IS copied — its
  // `store_results` drives the athlete week endpoint's is_test flag.
  const tplRows = await params.client<Array<{ id: string; version: number }>>`
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
      ${ath}, coalesce(instance_of_template_id, id)
    from templates
    where id = ${src}
    returning id::text as id, version
  `;
  if (!tplRows[0]) return null;
  const newId = Number(tplRows[0].id);

  await params.client`
    insert into template_segments (
      template_id, position, exercise_id, params_json, notes,
      block_position, block_format, block_title, prescription_json
    )
    select
      ${newId}, position, exercise_id, params_json, notes,
      block_position, block_format, block_title, prescription_json
    from template_segments
    where template_id = ${src}
    order by position
  `;

  return { template_id: newId, version: tplRows[0].version };
}

import 'server-only';

import { z } from 'zod';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  TemplateError,
  templateSegmentInputSchema,
  updateTemplate,
} from './templates';

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
      coach_id, name, description, format, target_level,
      version, day_position, is_draft, is_partner_workout, warmup, cooldown,
      coach_notes, meta_json, demo_video_url, methodology_group_id,
      instance_athlete_id, instance_of_template_id
    )
    select
      coach_id, name, description, format, target_level,
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

// ── Per-athlete day edit (Fase 2) ─────────────────────────────────────────────
// The coach edits ONE day of an athlete's plan. A day's content is an INSTANCE
// `templates` row (`template_segments`), so editing reuses the exact session
// editor + serializer the library uses (SessionEditor → serializeSessionSegments)
// and the SAME segment writer (updateTemplate). The ONLY thing added here is the
// ISOLATION BOUNDARY: the write may target the row ONLY if it is THIS athlete's
// instance, owned by THIS coach, AND actually assigned to this athlete on this
// date. Fase 1 guarantees isolation by construction (clone-on-assign); this
// re-enforces it at the write boundary so the per-athlete route can never reach a
// library template or another athlete's copy.
//
// The editor emits ordered segments WITHOUT a global `position` (block order +
// item order IS the array order — see serializeSessionSegments); `position` is
// assigned here as the array index so the unique (template_id, position) key and
// the load ordering hold.
const athleteInstanceSegmentSchema = templateSegmentInputSchema.omit({
  position: true,
});

export const athleteDayContentSchema = z.object({
  /** The athlete's instance template id (the day being edited). */
  template_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  /** Workout title (templates.name) — the name the athlete reads. */
  name: z.string().min(1).max(200).optional(),
  segments: z.array(athleteInstanceSegmentSchema).max(120),
});
export type AthleteDayContent = z.infer<typeof athleteDayContentSchema>;

export async function updateAthleteInstanceDay(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  iso_date: string;
  payload: unknown;
  client?: Sql;
}): Promise<{ template_id: number }> {
  const parsed = athleteDayContentSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new TemplateError('invalid_payload', parsed.error.message, 400);
  }
  const body = parsed.data;
  const client = params.client ?? defaultSql;
  const coach = Number(params.coach_id);
  const ath = Number(params.athlete_id);

  // ISOLATION GUARD — the row MUST be this athlete's instance, owned by this
  // coach, assigned to this athlete on this date. Rejects library rows
  // (instance_athlete_id IS NULL) and any other athlete's instance.
  const guard = await client<Array<{ id: string }>>`
    select t.id::text as id
    from templates t
    join workout_assignments wa on wa.template_id = t.id
    where t.id = ${body.template_id}
      and t.coach_id = ${coach}
      and t.instance_athlete_id = ${ath}
      and t.archived_at is null
      and wa.athlete_id = ${ath}
      and wa.scheduled_for = ${params.iso_date}::date
    limit 1
  `;
  if (!guard[0]) {
    throw new TemplateError(
      'not_found',
      'Entreno del atleta no encontrado para ese día',
      404,
    );
  }

  const segments = body.segments.map((seg, i) => ({ ...seg, position: i }));
  // DRY: reuse the single segment writer (delete + re-insert in a tx) +
  // coach-scoped update. The name update keeps the workout title in sync.
  await updateTemplate({
    coach_id: coach,
    template_id: body.template_id,
    payload: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      segments,
    },
    client,
  });

  return { template_id: body.template_id };
}

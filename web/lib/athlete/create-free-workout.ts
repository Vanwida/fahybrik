import 'server-only';

import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import {
  recordWorkoutExecution,
  type ExecutionMetricsInput,
} from '@/lib/sync/record-workout-execution';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

// ENTRENO LIBRE — persist an athlete's OWN ("no prescrito") workout.
//
// THE LOCKED MODEL: a free workout is a SELF-ORIGIN ASSIGNMENT through the EXISTING
// path (maximum reuse, every invariant intact). On save, in ONE transaction:
//   1. a `templates` row (coach-owned, but `instance_athlete_id = athleteId` keeps
//      it OUT of the coach library — the library lists `instance_athlete_id is
//      null`, reusing the mig-0083 per-athlete-instance mechanism). The template's
//      self-origin provenance lives in `meta_json.origin` ('self'): the templates
//      table carries no `origin` column — origin is a property of the ASSIGNMENT
//      (mig 0090), which is the single source every reader keys off.
//   2. a `template_segments` row — the canonical modality exercise (by slug) +
//      the validated Prescription in `prescription_json`.
//   3. a `workout_assignments` row — `origin = 'self'`, scheduled for today (box
//      tz), no microcycle (it is not part of the coach's periodization).
//   4. the EXISTING shared recorder (`recordWorkoutExecution`) writes the
//      execution + segment actuals and flips the assignment to completed/partial.
//      Reused verbatim, run inside the SAME tx — there is one execution model.
//
// WHY a real template+assignment (not a nullable assignment_id): the free workout
// must render as a ROW IN THE ATHLETE'S PLAN (plan-week returns assignments),
// segment_executions.template_segment_id must reference a real segment, and every
// analytics/coach reader joins assignments→templates. Keeping the invariant = zero
// reader breakage.

/** The four MEASURED modalities a free workout can target → their canonical
 *  exercise SLUG (the single source resolved to an exercise_id at save time). */
export const FREE_WORKOUT_MODALITY_SLUGS = {
  row: 'row',
  ski: 'ski-erg',
  bike: 'bike-erg',
  run: 'run',
} as const;

export type FreeWorkoutModality = keyof typeof FREE_WORKOUT_MODALITY_SLUGS;

/** Provenance marker stored on the instance template's `meta_json` (the templates
 *  table has no origin column — see header). The functional origin lives on the
 *  assignment (workout_assignments.origin). */
const SELF_ORIGIN = 'self' as const;

/** A recoverable, request-mappable failure (→ 422 at the route boundary). */
export class FreeWorkoutError extends Error {
  constructor(
    public readonly code: 'exercise_not_found' | 'record_failed',
    message: string,
  ) {
    super(message);
    this.name = 'FreeWorkoutError';
  }
}

export async function createFreeWorkout(args: {
  athleteId: number;
  coachId: number;
  title: string;
  modality: FreeWorkoutModality;
  /** The prescription scheme — already validated as a measured templates.format. */
  scheme: string;
  /** The validated, typed Prescription (persisted verbatim into prescription_json). */
  prescriptionJson: Prescription;
  metrics: ExecutionMetricsInput;
}): Promise<{ assignment_id: string; execution_id: string }> {
  const { athleteId, coachId, title, modality, scheme, prescriptionJson, metrics } = args;

  const slug = FREE_WORKOUT_MODALITY_SLUGS[modality];
  const scheduledFor = isoDateString(startOfDayInBox(new Date()));

  // Resolve the canonical modality exercise BY SLUG (single source).
  const exRows = await defaultSql<Array<{ id: string }>>`
    select id::text as id from exercises where slug = ${slug} limit 1
  `;
  const exerciseId = exRows[0]?.id;
  if (!exerciseId) {
    throw new FreeWorkoutError(
      'exercise_not_found',
      `No exercise found for modality '${modality}' (slug '${slug}')`,
    );
  }

  // Serialize the prescription to a plain JSON object once (defends against any
  // bigint / non-serializable value reaching the jsonb column), per the same
  // pattern the template writers use.
  const prescriptionForDb = JSON.parse(JSON.stringify(prescriptionJson)) as Parameters<
    typeof defaultSql.json
  >[0];

  const ids = await defaultSql.begin(async (tx) => {
    // 1. Instance template (OUT of the coach library via instance_athlete_id).
    const tplRows = await tx<Array<{ id: string }>>`
      insert into templates (
        coach_id, name, format, target_block, version,
        is_draft, is_partner_workout, instance_athlete_id, meta_json
      )
      values (
        ${coachId}, ${title}, ${scheme}::template_format, 'any'::target_block, 1,
        false, false, ${athleteId}, ${tx.json({ origin: SELF_ORIGIN })}
      )
      returning id::text as id
    `;
    const templateId = Number(tplRows[0]!.id);

    // 2. The single modality segment carrying the structured prescription.
    await tx`
      insert into template_segments (
        template_id, position, exercise_id, params_json,
        block_position, block_format, block_title, prescription_json
      )
      values (
        ${templateId}, 1, ${Number(exerciseId)}, '{}'::jsonb,
        1, ${scheme}, ${title}, ${tx.json(prescriptionForDb)}
      )
    `;

    // 3. Self-origin assignment for today (status defaults to 'scheduled'; the
    //    recorder flips it to completed/partial in step 4). No microcycle — a
    //    free workout is not part of the coach's periodization.
    const asgRows = await tx<Array<{ id: string }>>`
      insert into workout_assignments (
        athlete_id, scheduled_for, template_id, template_version, microcycle_id, origin
      )
      values (
        ${athleteId}, ${scheduledFor}::date, ${templateId}, 1, null, ${SELF_ORIGIN}::workout_origin
      )
      returning id::text as id
    `;
    const assignmentId = Number(asgRows[0]!.id);

    // 4. REUSE the shared recorder (executions + segment actuals + status flip),
    //    on the SAME transaction client. Do not fork it.
    const rec = await recordWorkoutExecution({
      athleteId,
      assignmentId,
      input: metrics,
      sql: tx,
    });
    if (!rec.ok) {
      throw new FreeWorkoutError('record_failed', `Could not record execution: ${rec.reason}`);
    }

    return { assignment_id: rec.assignment_id, execution_id: rec.execution_id };
  });

  // Refresh the coach attention queue AFTER the tx commits — the recorder's own
  // fire-and-forget recompute runs INSIDE the tx on a different (pooled)
  // connection and therefore can't see the uncommitted rows, so it no-ops on the
  // workout_libre signal. This awaited, post-commit pass computes against
  // committed data so the coach's "entreno libre" card appears immediately.
  // Best-effort: never throws into the caller.
  await recomputeAthlete({ athlete_id: athleteId }).catch(() => {});

  return ids;
}

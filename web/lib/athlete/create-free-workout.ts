import 'server-only';

import { sql as defaultSql, type Sql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import { visibleToCoach } from '@/lib/exercises/coach-override';
import {
  recordWorkoutExecution,
  type ExecutionMetricsInput,
} from '@/lib/sync/record-workout-execution';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import {
  FREE_WORKOUT_MODALITY_SLUGS,
  type MeasuredModality,
} from '@/lib/athlete/free-workout-validate';

// ENTRENO LIBRE — persist an athlete's OWN ("no prescrito") workout.
//
// THE LOCKED MODEL: a free workout is a SELF-ORIGIN ASSIGNMENT through the EXISTING
// path (maximum reuse, every invariant intact). On save, in ONE transaction:
//   1. a `templates` row (coach-owned, but `instance_athlete_id = athleteId` keeps
//      it OUT of the coach library — the library lists `instance_athlete_id is
//      null`, reusing the mig-0083 per-athlete-instance mechanism). The template's
//      self-origin provenance lives in `meta_json.origin` ('self'): the templates
//      table carries no `origin` column — origin is a property of the ASSIGNMENT
//      (mig 0090), which is the single source every reader keys off. `format` is
//      the workout's scheme (a measured scheme | 'sets' | the shared metcon).
//   2. N `template_segments` rows in EXECUTION ORDER (position 1..N), one per
//      exercise line, each carrying its validated Prescription in
//      `prescription_json`. Three shapes feed this uniformly:
//        · MEASURED (row|ski|bike|run): exactly ONE segment — the canonical
//          modality exercise resolved BY SLUG, prescription persisted verbatim.
//        · ITEM-built (strength|functional): N segments — one per `items[]`
//          exercise (resolved by id). The exercise is the single source of truth
//          for modality (mig 0053), so the server OVERRIDES each prescription's
//          modality with the exercise's before persisting — prescription_json can
//          never drift from its exercise.
//        · CLOCK (functional, nothing declared): ZERO segments. A segment needs an
//          exercise (`template_segments.exercise_id` is NOT NULL) and there is no
//          honest one to name — inventing a placeholder would put a movement the
//          athlete never did into their per-exercise analytics. The session's real
//          shape (scheme + rounds/work/rest/window) is preserved on the template's
//          `meta_json.prescription`, which is what the week reader uses to colour
//          the day and time the session. Readers that need EXERCISES (the coach's
//          per-exercise deep dive) correctly see nothing to analyse.
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
//
// The modality vocabulary + the pre-DB structured validation live in
// free-workout-validate.ts (DB-free, unit-tested); this module owns the exercise
// resolution + the persistence.

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

/** The persisted-shape prescription (a plain JSON object). */
type JsonParam = Parameters<typeof defaultSql.json>[0];

/** Serialize a prescription to a plain JSON object once (defends against any
 *  bigint / non-serializable value reaching the jsonb column), per the same
 *  pattern the template writers use. */
function toJson(value: unknown): JsonParam {
  return JSON.parse(JSON.stringify(value)) as JsonParam;
}

/** An ordered segment to persist: an exercise_id + the prescription JSON. */
interface ResolvedSegment {
  exerciseId: number;
  prescriptionForDb: JsonParam;
  /** 'warmup' → bloque «Calentamiento»; ausente → el principal. */
  part?: 'warmup';
}

/** The measured-single-segment input (canonical exercise resolved by slug). */
interface MeasuredInput {
  kind: 'measured';
  modality: MeasuredModality;
  /** The validated, typed Prescription (persisted verbatim into prescription_json). */
  prescription: Prescription;
}

/** The item-built input (N exercises resolved by id, modality overridden). */
interface ItemsInput {
  kind: 'items';
  items: Array<{ exerciseId: number; prescription: Prescription; part?: 'warmup' }>;
}

/** The CLOCK input — a functional format run bare, with no movements named. No
 *  exercise exists to persist a segment for, so the prescription travels on the
 *  template's `meta_json` instead of a `template_segments.prescription_json`. */
interface ClockInput {
  kind: 'clock';
  /** The folded block the live engine ran: scheme + structure, never sets. */
  prescription: Prescription;
}

export type CreateFreeWorkoutInput = {
  athleteId: number;
  /** Null for a FREE athlete (athletes.coach_id null): the instance template is
   *  athlete-owned (templates_owner_chk, mig 0141), exercise resolution falls
   *  back to the BASE catalog (visibleToCoach) and the post-commit attention
   *  recompute no-ops — there is no coach to surface the libre to. */
  coachId: number | null;
  title: string;
  /** The `templates.format` to persist — an already-validated scheme. */
  scheme: string;
  metrics: ExecutionMetricsInput;
  /** Injectable client so a test can run against an ephemeral branch; the route
   *  omits it and the module pool is used. */
  sql?: Sql;
} & (MeasuredInput | ItemsInput | ClockInput);

export async function createFreeWorkout(
  input: CreateFreeWorkoutInput,
): Promise<{ assignment_id: string; execution_id: string }> {
  const { athleteId, coachId, title, scheme, metrics } = input;
  const db = input.sql ?? defaultSql;
  const scheduledFor = isoDateString(startOfDayInBox(new Date()));

  // Resolve the ordered segment list (exercise ids validated; modality coherence
  // applied for item-built workouts) BEFORE opening the transaction.
  const segments = await resolveSegments(db, input);

  // The instance template's metadata. A CLOCK has no segments, so its shape (the
  // scheme + structure the athlete actually ran, and with it the real modality)
  // would be lost otherwise — it rides here, the same carrier `origin` uses.
  const metaJson =
    input.kind === 'clock'
      ? { origin: SELF_ORIGIN, prescription: toJson(input.prescription) }
      : { origin: SELF_ORIGIN };

  const ids = await db.begin(async (tx) => {
    // 1. Instance template (OUT of the coach library via instance_athlete_id).
    const tplRows = await tx<Array<{ id: string }>>`
      insert into templates (
        coach_id, name, format, target_block, version,
        is_draft, is_partner_workout, instance_athlete_id, meta_json
      )
      values (
        ${coachId}, ${title}, ${scheme}::template_format, 'any'::target_block, 1,
        false, false, ${athleteId}, ${tx.json(metaJson)}
      )
      returning id::text as id
    `;
    const templateId = Number(tplRows[0]!.id);

    // 2. The ordered segments (position 1..N) carrying each structured prescription.
    //    Calentamiento opcional (petición de Alex entrenando): los items marcados
    //    part='warmup' van a su PROPIO bloque «Calentamiento» (posición 1) y el
    //    trabajo al bloque 2 — así el coach lee calentar como calentar, nunca como
    //    trabajo. Sin warmup, todo sigue en un bloque como siempre.
    const hasWarmup = segments.some((s) => s.part === 'warmup');
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isWarm = seg.part === 'warmup';
      await tx`
        insert into template_segments (
          template_id, position, exercise_id, params_json,
          block_position, block_format, block_title, prescription_json
        )
        values (
          ${templateId}, ${i + 1}, ${seg.exerciseId}, '{}'::jsonb,
          ${hasWarmup ? (isWarm ? 1 : 2) : 1}, ${scheme},
          ${hasWarmup ? (isWarm ? 'Calentamiento' : title) : title},
          ${tx.json(seg.prescriptionForDb)}
        )
      `;
    }

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
  await recomputeAthlete({ athlete_id: athleteId, client: db }).catch(() => {});

  return ids;
}

/**
 * Resolve the ordered `template_segments` to persist. MEASURED → the one canonical
 * exercise by slug (prescription verbatim). ITEM-built → each `items[]` exercise
 * by id, with the modality COHERENCE override (mig 0053): the exercise is the
 * single source of truth for modality, so the persisted prescription's modality is
 * set to the exercise's (when it has one). CLOCK → none: no movement was named, so
 * there is no exercise to resolve and no query to run. Throws `exercise_not_found`
 * for any unknown slug/id.
 */
async function resolveSegments(db: Sql, input: CreateFreeWorkoutInput): Promise<ResolvedSegment[]> {
  if (input.kind === 'clock') return [];

  if (input.kind === 'measured') {
    const slug = FREE_WORKOUT_MODALITY_SLUGS[input.modality];
    // Scoped to what this athlete's coach can see — the canonical modality
    // exercise is always base, but this stays consistent with the item-built
    // path below and never resolves into another coach's catalog.
    const exRows = await db<Array<{ id: string }>>`
      select e.id::text as id from exercises e
      where e.slug = ${slug} and ${visibleToCoach(db, input.coachId)}
      limit 1
    `;
    const exerciseId = exRows[0]?.id;
    if (!exerciseId) {
      throw new FreeWorkoutError(
        'exercise_not_found',
        `No exercise found for modality '${input.modality}' (slug '${slug}')`,
      );
    }
    return [{ exerciseId: Number(exerciseId), prescriptionForDb: toJson(input.prescription) }];
  }

  // ITEM-built: fetch every referenced exercise in ONE query (id + modality),
  // scoped to what this athlete's coach can see. These ids come straight from
  // the athlete's request body — without this scope an athlete could reference
  // ANOTHER coach's private exercise (IDOR). An out-of-scope id simply doesn't
  // come back here, so it falls through to the same exercise_not_found below —
  // never a "belongs to another coach" leak.
  const ids = input.items.map((it) => it.exerciseId);
  const rows = await db<Array<{ id: string; modality: string | null }>>`
    select e.id::text as id, e.modality from exercises e
    where e.id = any(${ids}::bigint[]) and ${visibleToCoach(db, input.coachId)}
  `;
  const modalityById = new Map<number, string | null>();
  for (const r of rows) modalityById.set(Number(r.id), r.modality);

  return input.items.map((it) => {
    if (!modalityById.has(it.exerciseId)) {
      throw new FreeWorkoutError('exercise_not_found', `No exercise found for id ${it.exerciseId}`);
    }
    // COHERENCE (mig 0053): the exercise is the single source of truth for
    // modality — override the prescription's modality so it can never drift.
    const exModality = modalityById.get(it.exerciseId) ?? null;
    const prescription: Prescription = exModality
      ? { ...it.prescription, modality: exModality as Modality }
      : it.prescription;
    return {
      exerciseId: it.exerciseId,
      prescriptionForDb: toJson(prescription),
      ...(it.part ? { part: it.part } : {}),
    };
  });
}

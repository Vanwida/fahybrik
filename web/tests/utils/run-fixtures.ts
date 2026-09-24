/**
 * Running fixtures for real-DB tests, built on `db-fixtures.ts`.
 *
 * What the running readers (session detail, per-tramo compliance, weekly
 * volume, the coach's running aggregates) look for in the database: a
 * prescribed line with its prescription, the athlete's pace-zone profile, and
 * an execution with its tramos. Everything hangs off a `Fixture`'s coach and
 * athlete, so `fx.cleanup()` removes it all: executions, tramos and the zone
 * profile cascade with the athlete, templates and their lines go with the
 * coach's templates, and the exercise is registered for teardown.
 */

import type { Fixture } from './db-fixtures';
import { makeExercise } from './db-fixtures';

type Json = Parameters<Fixture['sql']['json']>[0];

/**
 * A run pace-zone profile: six bands in s/km, the shape the zones CHECK
 * requires (`jsonb_array_length(zones_json) = 6`). Z4 is 4:30–5:00/km.
 */
export const RUN_ZONES = [
  { code: 'Z1', label: 'Recuperación', color: '#8aa', role: 'recovery', sort_order: 1, fast_s: 360, slow_s: null },
  { code: 'Z2', label: 'Base aeróbica', color: '#8a8', role: 'aerobic_base', sort_order: 2, fast_s: 330, slow_s: 360 },
  { code: 'Z3', label: 'Umbral aeróbico', color: '#aa8', role: 'aerobic_threshold', sort_order: 3, fast_s: 300, slow_s: 330 },
  { code: 'Z4', label: 'Umbral', color: '#da8', role: 'threshold', sort_order: 4, fast_s: 270, slow_s: 300 },
  { code: 'Z5', label: 'VO2max', color: '#d88', role: 'vo2max', sort_order: 5, fast_s: 240, slow_s: 270 },
  { code: 'Z6', label: 'Sprint', color: '#d55', role: 'sprint', sort_order: 6, fast_s: 200, slow_s: 240 },
] as const;

/** The athlete's tested run profile, so a zone target resolves to a pace band. */
export async function makeRunZoneProfile(fx: Fixture): Promise<void> {
  await fx.sql`
    insert into athlete_zone_profiles (athlete_id, modality, threshold_s, pace_unit, zones_json, version, source)
    values (${fx.athleteId}, 'run', 285, 'per_km', ${fx.sql.json(RUN_ZONES as unknown as Json)}, 1, 'coach_test')
  `;
}

/** A catalog run exercise (cardio / run), registered for teardown. */
export function makeRunExercise(fx: Fixture): Promise<number> {
  return makeExercise({ fx, category: 'cardio', modality: 'run' });
}

/** One prescribed line of a template, carrying its structured prescription. */
export async function makeTemplateSegment(params: {
  fx: Fixture;
  templateId: number;
  exerciseId: number;
  position: number;
  prescription: Record<string, unknown>;
}): Promise<number> {
  const { fx } = params;
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into template_segments (template_id, position, exercise_id, prescription_json)
    values (${params.templateId}, ${params.position}, ${params.exerciseId}, ${fx.sql.json(params.prescription as Json)})
    returning id::text
  `;
  return Number(rows[0]!.id);
}

/** Structured-run attribution of a tramo (mig 0146): all three or none. */
export interface RunLegAttribution {
  index: number;
  role: 'work' | 'recovery';
  phase: 'warmup' | 'main' | 'cooldown';
}

/** One executed tramo. Tramos run back to back from the execution start. */
export interface RunLap {
  duration_s: number;
  /** The prescribed line this tramo executes (`item_uid` = `segment-{id}`). */
  template_segment_id?: number | null;
  distance_m?: number | null;
  pace_s_per_km?: number | null;
  avg_hr?: number | null;
  leg?: RunLegAttribution | null;
  /** Defaults to 'run'. */
  modality?: string;
  /** Per-tramo apparatus token. Defaults to 'gps'. */
  source?: string;
}

/**
 * An execution with its tramos, inserted as the live engine stores them. With
 * an assignment, the execution hangs off it and the session is marked done;
 * without one it is an imported workout (assignment-less, mig 0191).
 */
export async function makeRunExecution(params: {
  fx: Fixture;
  assignmentId: number | null;
  startedAtIso: string;
  laps: readonly RunLap[];
}): Promise<number> {
  const { fx, laps } = params;
  const sql = fx.sql;
  const start = new Date(params.startedAtIso).getTime();
  const total = laps.reduce((s, l) => s + l.duration_s, 0);
  const at = (offsetS: number) => new Date(start + offsetS * 1000).toISOString();
  const recordedVia = params.assignmentId != null ? 'live' : 'imported';

  const rows = await sql<Array<{ id: string }>>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, recorded_via
    ) values (
      ${params.assignmentId}, ${fx.athleteId}, ${at(0)}::timestamptz, ${at(total)}::timestamptz, ${Math.round(total)},
      'gps'::biometric_source, ${recordedVia}::execution_recording_method
    )
    returning id::text
  `;
  const executionId = Number(rows[0]!.id);

  let offset = 0;
  for (const [position, lap] of laps.entries()) {
    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position, started_at, ended_at, modality,
        distance_meters, avg_pace_s_per_km, avg_hr, source, leg_index, leg_role, leg_phase
      ) values (
        ${executionId}, ${lap.template_segment_id ?? null}, ${position},
        ${at(offset)}::timestamptz, ${at(offset + lap.duration_s)}::timestamptz, ${lap.modality ?? 'run'},
        ${lap.distance_m ?? null}, ${lap.pace_s_per_km ?? null}, ${lap.avg_hr ?? null}, ${lap.source ?? 'gps'},
        ${lap.leg?.index ?? null}, ${lap.leg?.role ?? null}, ${lap.leg?.phase ?? null}
      )
    `;
    offset += lap.duration_s;
  }

  if (params.assignmentId != null) {
    await sql`update workout_assignments set status = 'completed' where id = ${params.assignmentId}`;
  }
  return executionId;
}

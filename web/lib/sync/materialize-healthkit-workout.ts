// Un workout de Apple Salud se convierte en sesión cuando nadie lo había
// prescrito. El plan no se toca: assignment_id queda NULL. Las comparativas
// (zonas, carga) leen ejecuciones, no el marcador de biometric_streams.
//
// DE-DUPE: source_workout_ref + solape de ventana. Un live del mismo rato gana:
// no inventamos una segunda sesión. El reenvío simultáneo del mismo lote (las dos
// peticiones pasan el «¿ya existe?» antes de que ninguna escriba) lo para el
// índice único de 0276 (atleta, fuente, ref de las importaciones sin asignación):
// la que pierde la carrera no inserta y devuelve la fila que ya existe.

import type { Sql } from '@/lib/db';
import { computeExecutionZoneSeconds } from '@/lib/zones/segment-zone-seconds';
import { existsOverlappingExecution } from './execution-time-dedupe';
import { healthkitActivityToModality } from './healthkit-activity';
import type { HKWorkoutDTO } from './schema';

export type MaterializeOutcome = 'inserted' | 'exists' | 'skipped';

function intOrNull(n: number | null | undefined, min: number, max: number): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

function numOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/** La ejecución del atleta que ya lleva este entreno de Salud, o null. */
async function executionWithRef(sql: Sql, athleteId: number, ref: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id::text from workout_executions
    where athlete_id = ${athleteId}
      and source_workout_ref = ${ref}
    limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function materializeHealthkitWorkout(args: {
  sql: Sql;
  athlete_id: bigint;
  workout: HKWorkoutDTO;
  /** Por defecto sí: un lote vivo es una sesión. El backfill masivo lo apaga
   *  y deja las zonas al reconstructor, que no hace 2.000 viajes seguidos. */
  computeZones?: boolean;
}): Promise<{ outcome: MaterializeOutcome; execution_id: string | null }> {
  const { sql, athlete_id, workout } = args;
  const id = athlete_id as unknown as number;

  const already = await executionWithRef(sql, id, workout.source_workout_id);
  if (already) return { outcome: 'exists', execution_id: already };

  if (await existsOverlappingExecution(sql, athlete_id, workout.started_at, workout.ended_at)) {
    return { outcome: 'skipped', execution_id: null };
  }

  const duration = Number.isFinite(workout.duration_seconds)
    ? Math.round(workout.duration_seconds)
    : null;
  const avgHr = intOrNull(workout.avg_heart_rate_bpm, 30, 260);
  const maxHr = intOrNull(workout.max_heart_rate_bpm, 30, 260);
  const distance = numOrNull(workout.total_distance_meters);
  const calories = numOrNull(workout.total_energy_burned_kcal);
  const modality = healthkitActivityToModality(workout.workout_activity_type);
  const paceKm =
    modality === 'run' && distance != null && duration != null && distance > 0
      ? duration / (distance / 1000)
      : null;

  // tenancy: athlete-session — athlete_id sale del bearer de /api/sync/healthkit (o del histórico del propio atleta).
  const inserted = await sql<{ id: string }[]>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
      source, source_workout_ref, recorded_via,
      avg_hr, max_hr, total_distance_m, total_calories
    ) values (
      null,
      ${id},
      ${workout.started_at},
      ${workout.ended_at},
      ${duration},
      'healthkit',
      ${workout.source_workout_id},
      'imported'::execution_recording_method,
      ${avgHr},
      ${maxHr},
      ${distance},
      ${calories}
    )
    on conflict (athlete_id, source, source_workout_ref)
      where assignment_id is null
        and recorded_via = 'imported'
        and source_workout_ref is not null
      do nothing
    returning id::text
  `;
  const executionId = inserted[0]?.id;
  if (!executionId) {
    // Otra petición con el mismo entreno ganó la carrera: su fila es la buena.
    return { outcome: 'exists', execution_id: await executionWithRef(sql, id, workout.source_workout_id) };
  }

  await sql`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, calories, avg_hr, max_hr,
      modality, avg_pace_s_per_km, source, hr_source, context_source
    ) values (
      ${executionId}::bigint,
      0,
      ${workout.started_at},
      ${workout.ended_at},
      ${distance},
      ${calories},
      ${avgHr},
      ${maxHr},
      ${modality},
      ${paceKm},
      'healthkit',
      ${avgHr != null ? 'healthkit' : null},
      'session'
    )
  `;

  if (args.computeZones !== false) {
    try {
      await computeExecutionZoneSeconds({ execution_id: Number(executionId), client: sql });
    } catch {
      // Una zona rota no puede tumbar el lote. El reconstructor las rellena.
    }
  }

  return { outcome: 'inserted', execution_id: executionId };
}

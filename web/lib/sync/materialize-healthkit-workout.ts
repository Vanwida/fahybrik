// UN WORKOUT DE APPLE SALUD SE CONVIERTE EN SESIÓN. Con asignación o sin ella, y
// escribiendo LO MISMO en los dos casos — que es lo que no pasaba.
//
// EL FALLO QUE ESTO CIERRA (debugger 29-ago, Z2 de Alex, asignación 494). Había DOS
// escritores para el mismo HKWorkout y escribían cosas distintas:
//
//   · huérfano (aquí): duración + `avg_hr` / `max_hr` / `total_distance_m` /
//     `total_calories`, UNA fila de `segment_executions` con sus metros, su pulso y
//     su ritmo, y las zonas calculadas.
//   · con asignación (`linkExecution`, borrado): duración de reloj de pared y
//     procedencia. **Y nada más.** Ni km, ni pulso, ni calorías, ni un solo tramo, ni
//     zonas.
//
// O sea: el MISMO entreno, casado con la sesión que el coach prescribió, salía PEOR
// que si no hubiera existido esa sesión — «22:40 y cero bloques» donde el huérfano
// habría guardado 3,78 km y 153 ppm. Ahora hay un escritor y una fila.
//
// SIN RAMA PARA EL CASO CON ASIGNACIÓN: la restricción es `unique (assignment_id)` y
// en SQL los NULL no colisionan entre sí, así que el mismo `on conflict
// (assignment_id)` sirve para los dos — para el huérfano simplemente nunca dispara.
//
// DE-DUPE: source_workout_ref (índice 0191) + solape de ventana. Un live del
// mismo rato gana: no inventamos una segunda sesión.

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

export async function materializeHealthkitWorkout(args: {
  sql: Sql;
  athlete_id: bigint;
  workout: HKWorkoutDTO;
  /** La sesión que el coach prescribió, cuando este workout casa con una. Ausente =
   *  nadie lo prescribió y nace como sesión importada (`assignment_id` NULL): el
   *  pasado existe aunque no estuviera en el plan. */
  assignment_id?: string;
  /** Por defecto sí: un lote vivo es una sesión. El backfill masivo lo apaga
   *  y deja las zonas al reconstructor, que no hace 2.000 viajes seguidos. */
  computeZones?: boolean;
}): Promise<{ outcome: MaterializeOutcome; execution_id: string | null }> {
  const { sql, athlete_id, workout, assignment_id } = args;
  const id = athlete_id as unknown as number;

  const already = await sql<{ id: string }[]>`
    select id::text from workout_executions
    where athlete_id = ${id}
      and source_workout_ref = ${workout.source_workout_id}
    limit 1
  `;
  if (already[0]) return { outcome: 'exists', execution_id: already[0].id };

  // El solape sólo descalifica al HUÉRFANO. Con asignación el llamante ya resolvió
  // que ESTA sesión es su sitio y ya apartó lo que no debe pisarse (un live, un
  // garmin); ahí un solape es la fila de la propia asignación, y saltar por él es
  // justo lo que dejaba la sesión sin km ni pulso.
  if (
    assignment_id == null &&
    (await existsOverlappingExecution(sql, athlete_id, workout.started_at, workout.ended_at))
  ) {
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

  // UN SOLO UPSERT PARA LOS DOS CASOS. `unique (assignment_id)` con NULL no colisiona,
  // así que el huérfano nunca entra en el `do update` y no hace falta ramificar.
  //
  // Cuando SÍ hay asignación, la regla de quién gana es la que ya estaba en
  // `linkExecution`: un `garmin` o un `manual` no se pisan (mejor precisión de laps /
  // lo dijo una persona); lo demás se refresca con lo que acaba de llegar. Y
  // `recorded_via` / la procedencia sólo se RELLENAN si estaban vacías: una sesión
  // grabada en vivo no se convierte en importación porque su HKWorkout llegue después.
  const inserted = await sql<{ id: string }[]>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
      source, source_workout_ref, recorded_via,
      avg_hr, max_hr, total_distance_m, total_calories
    ) values (
      ${assignment_id ?? null},
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
    on conflict (assignment_id) do update
      set started_at = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.started_at
            else excluded.started_at
          end,
          ended_at = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.ended_at
            else excluded.ended_at
          end,
          total_duration_seconds = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.total_duration_seconds
            else excluded.total_duration_seconds
          end,
          source = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.source
            else excluded.source
          end,
          source_workout_ref = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.source_workout_ref
            else excluded.source_workout_ref
          end,
          -- LO MEDIDO. Lo que el escritor con asignación no escribía nunca, y por lo
          -- que la misma carrera casada con su sesión salía sin km y sin pulso. Sólo
          -- RELLENA: un número que ya estaba (el live, un garmin) no se sustituye.
          avg_hr = coalesce(workout_executions.avg_hr, excluded.avg_hr),
          max_hr = coalesce(workout_executions.max_hr, excluded.max_hr),
          total_distance_m = coalesce(workout_executions.total_distance_m, excluded.total_distance_m),
          total_calories = coalesce(workout_executions.total_calories, excluded.total_calories),
          recorded_via = coalesce(workout_executions.recorded_via, excluded.recorded_via),
          updated_at = now()
    returning id::text
  `;
  const executionId = inserted[0]?.id;
  if (!executionId) return { outcome: 'exists', execution_id: null };

  // EL TRAMO, que es lo que hace que la sesión tenga un bloque en vez de «0 en orden».
  // Sólo se escribe si la ejecución no tiene ya tramos propios: los del motor en vivo
  // (con sus piernas, su ritmo por tramo y sus zonas congeladas) son mejores que este
  // agregado de uno, y pisarlos con él sería cambiar una carrera por su resumen.
  await sql`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, calories, avg_hr, max_hr,
      modality, avg_pace_s_per_km, source, hr_source, context_source
    )
    select
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
    where not exists (
      select 1 from segment_executions where execution_id = ${executionId}::bigint
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

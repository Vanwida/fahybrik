// HealthKit ingest pipeline.
//
// Inputs come from POST /api/sync/healthkit, validated by hkSyncBatchSchema.
// Output: rows in biometric_streams + (when a workout maps to an assignment)
// a workout_executions row.
//
// Dedupe key for samples:
//   (athlete_id, source='healthkit', metric_type, recorded_at, value_numeric)
// Dedupe key for workouts:
//   (athlete_id, source='healthkit', source_workout_id, started_at±5min)
// We rely on application-level dedupe (no unique index) because Garmin can
// produce a workout for the *same* underlying HKWorkout with a different
// source_workout_id — application dedupe is the only place that can compare
// across sources.
//
// LOTES HISTÓRICOS. Desde que el atleta puede traerse su histórico de Apple Salud
// (ios/FAHYBRIK/HealthKit/HealthKitHistoryImport.swift), aquí no aterrizan tres
// muestras de esta mañana: aterrizan páginas de 500 muestras de hace dos años, miles
// de veces. Eso cambió dos cosas:
//
//   1. LAS MUESTRAS SE INSERTAN EN BLOQUE. Una consulta por muestra (un SELECT de
//      de-dupe y un INSERT) son 400.000 viajes a la base para un import de dos años.
//      Ahora es UNA sentencia por lote, con el mismo criterio de de-dupe metido en un
//      `not exists` — misma semántica, tres órdenes de magnitud menos de latencia.
//   2. SE RECALCULAN LAS ZONAS DE LO QUE TOQUEN. Un pulso de hace ocho meses cae
//      dentro de la ventana de un tramo que hoy figura como «sin pulso». Recalcular
//      al final del lote (no por muestra) es lo que convierte ese gris en dato.
//      OJO a la distinción del modelo: esto RELLENA un hueco con evidencia nueva, que
//      no es lo mismo que recalcular el histórico porque el coach movió las anclas —
//      eso sigue siendo un botón que alguien pulsa, nunca un efecto silencioso.

import type { Sql } from '@/lib/db';
import { toJsonValue } from '@/lib/json-column';
import { markAssignmentDoneFromDevice } from './assignment-status';
import { existsOverlappingExecution } from './execution-time-dedupe';
import { canonicalizeHealthkitMetric } from './metric-map';
import { materializeHealthkitWorkout } from './materialize-healthkit-workout';
import { recomputeZonesForSampleWindow } from './recompute-zones-window';
import type { HKBiometricSampleDTO, HKSyncBatch, HKWorkoutDTO } from './schema';

export type HealthkitIngestResult = {
  workouts_received: number;
  workouts_inserted: number;
  workouts_skipped_duplicate: number;
  samples_received: number;
  samples_inserted: number;
  samples_skipped_unknown_metric: number;
  samples_skipped_duplicate: number;
  executions_linked: number;
  /** Ejecuciones cuyo reparto por zonas se rehízo porque el lote trajo pulso suyo. */
  executions_zones_recomputed: number;
};

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Filas por sentencia al insertar muestras. El importador de iOS pagina de 500 en
 * 500, así que un lote normal cabe en una; el tope está para que un cliente que
 * mande más no arme una consulta desmedida.
 */
const SAMPLE_INSERT_CHUNK = 1000;

export async function ingestHealthkitBatch(args: {
  sql: Sql;
  athlete_id: bigint;
  batch: HKSyncBatch;
}): Promise<HealthkitIngestResult> {
  const { sql, athlete_id, batch } = args;
  const result: HealthkitIngestResult = {
    workouts_received: batch.workouts.length,
    workouts_inserted: 0,
    workouts_skipped_duplicate: 0,
    samples_received: batch.samples.length,
    samples_inserted: 0,
    samples_skipped_unknown_metric: 0,
    samples_skipped_duplicate: 0,
    executions_linked: 0,
    executions_zones_recomputed: 0,
  };

  for (const w of batch.workouts) {
    const inserted = await ingestWorkout({ sql, athlete_id, workout: w });
    if (inserted.duplicate) result.workouts_skipped_duplicate += 1;
    else result.workouts_inserted += 1;
    if (inserted.linked_execution) result.executions_linked += 1;
  }

  const samples = await ingestSamples({ sql, athlete_id, samples: batch.samples });
  result.samples_inserted = samples.inserted;
  result.samples_skipped_duplicate = samples.duplicate;
  result.samples_skipped_unknown_metric = samples.unknown_metric;

  // Sólo cuando ha entrado pulso NUEVO, y sólo sobre la ventana que abarca. Un lote
  // vivo de esta mañana toca una ejecución (la de hoy); una página de histórico toca
  // las de aquel rato de hace ocho meses. Cero pulso nuevo, cero trabajo.
  if (samples.hr_window) {
    result.executions_zones_recomputed = await recomputeZonesForSampleWindow({
      sql,
      athlete_id,
      from: samples.hr_window.from,
      to: samples.hr_window.to,
    });
  }

  return result;
}

async function ingestWorkout(args: {
  sql: Sql;
  athlete_id: bigint;
  workout: HKWorkoutDTO;
}): Promise<{ duplicate: boolean; linked_execution: boolean }> {
  const { sql, athlete_id, workout } = args;

  const existing = await sql<{ id: string }[]>`
    select id::text from biometric_streams
    where athlete_id = ${athlete_id as unknown as number}
      and source = 'healthkit'
      and source_workout_id = ${workout.source_workout_id}
      and recorded_at between
        ${new Date(new Date(workout.started_at).getTime() - FIVE_MIN_MS).toISOString()}
        and ${new Date(new Date(workout.started_at).getTime() + FIVE_MIN_MS).toISOString()}
    limit 1
  `;
  if (existing.length > 0) {
    // El marcador ya está. La sesión importada puede no: los lotes viejos
    // dejaban el pasado solo en biometric_streams. Reintentar aquí es lo que
    // convierte un re-sync en comparativa, no en un no-op.
    const linked = await linkExecution({ sql, athlete_id, workout });
    return { duplicate: true, linked_execution: linked };
  }

  // Persist a "training_load" marker row carrying the full payload as raw
  // payload — gives downstream consumers a single biometric_streams row to
  // anchor the workout summary to.
  if (Number.isFinite(workout.duration_seconds)) {
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'healthkit',
        ${workout.source_workout_id},
        'training_load'::biometric_metric,
        ${workout.started_at},
        ${workout.duration_seconds},
        'seconds',
        ${sql.json(toJsonValue(workout))}
      )
    `;
  }

  if (Number.isFinite(workout.avg_heart_rate_bpm) && workout.avg_heart_rate_bpm != null) {
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'healthkit',
        ${workout.source_workout_id},
        'hr'::biometric_metric,
        ${workout.started_at},
        ${workout.avg_heart_rate_bpm},
        'bpm',
        null
      )
    `;
  }

  if (Number.isFinite(workout.total_energy_burned_kcal) && workout.total_energy_burned_kcal != null) {
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'healthkit',
        ${workout.source_workout_id},
        'calories_active'::biometric_metric,
        ${workout.started_at},
        ${workout.total_energy_burned_kcal},
        'kcal',
        null
      )
    `;
  }

  // Casa con el assignment del día si lo hay. Si no, nace una sesión
  // importada (assignment_id NULL): el pasado existe aunque nadie lo prescribió.
  const linked = await linkExecution({ sql, athlete_id, workout });

  return { duplicate: false, linked_execution: linked };
}

async function linkExecution(args: {
  sql: Sql;
  athlete_id: bigint;
  workout: HKWorkoutDTO;
}): Promise<boolean> {
  const { sql, athlete_id, workout } = args;
  const startedAt = workout.started_at;
  const endedAt = workout.ended_at;

  // Double-transport guard (source_workout_ref). A watchOS session reaches the
  // backend TWICE: (1) the structured execution relayed watch→iPhone→
  // /api/sync/workout-execution (carries source_workout_ref = the HKWorkout
  // UUID), and (2) the raw HKWorkout imported here later. If path 1 already
  // recorded THIS exact workout, skip the link/flip entirely. Biometric streams,
  // ingested above, are not duplicated by path 1, so they stay.
  const alreadyRecorded = await sql<{ id: string }[]>`
    select id::text from workout_executions
    where athlete_id = ${athlete_id as unknown as number}
      and source_workout_ref = ${workout.source_workout_id}
    limit 1
  `;
  if (alreadyRecorded.length > 0) return false;

  // TIME-WINDOW DE-DUPE (core data-integrity guard, shared helper). Complements
  // the exact-UUID guard above, but keyed on TIME overlap: if the
  // athlete already has ANY execution whose window intersects this workout's
  // [started_at, ended_at], the session is already accounted for. Skip the link
  // AND the assignment-complete flip so a passive wearable import never files a
  // phantom second execution (or flips a second assignment) for a session a
  // manual/phone log — or an earlier sync — already recorded.
  if (await existsOverlappingExecution(sql, athlete_id, startedAt, endedAt)) return false;

  // A QUÉ SESIÓN PERTENECE ESTO, Y CUÁNDO NO SE SABE (cards 144/145).
  //
  // Esto elegía «la última asignación del día, desempatando por id» — o sea, en
  // un día con dos sesiones, una de las dos AL AZAR con cara de determinismo.
  // El 24-ago costó caro: el atleta tenía fuerza y ski el mismo día, hizo el
  // ski, y el volcado de Salud aterrizó sobre la sesión de FUERZA. Resultado:
  // la de fuerza marcada como completa con nada dentro, y el trabajo real
  // colgado de la otra.
  //
  // Atribuir mal es PEOR que no atribuir: el atleta abre su entreno y no está,
  // y el entrenador ve hecha una sesión que nadie tocó. Así que con más de una
  // sesión ese día NO se adivina — el entreno se archiva por su cuenta y queda
  // a la vista para que alguien lo case.
  const day = startedAt.slice(0, 10);
  const rows = await sql<{ id: string; existing_source: string | null; existing_via: string | null }[]>`
    select wa.id::text as id,
           we.source::text as existing_source,
           we.recorded_via::text as existing_via
    from workout_assignments wa
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
    order by wa.scheduled_for desc, wa.id desc
  `;
  const asignacionesDelDia = new Set(rows.map((r) => r.id)).size;
  const assign = asignacionesDelDia === 1 ? rows[0] : undefined;
  if (!assign) {
    const standalone = await materializeHealthkitWorkout({ sql, athlete_id, workout });
    return standalone.outcome === 'inserted' || standalone.outcome === 'exists';
  }
  // Skip if a Garmin-sourced execution already exists — Garmin wins (better
  // lap precision per spec).
  if (assign.existing_source === 'garmin') return true;

  // Y NUNCA POR ENCIMA DE LO QUE EL ATLETA GRABÓ EN LA APP. Un volcado de Salud
  // trae duración y poco más; la sesión que se grabó en vivo trae sus bloques,
  // su pulso y sus calorías. Pisarla la deja en un resumen vacío que además
  // dice «sesión completa», que es exactamente lo que vio el atleta el 24-ago.
  //
  // La guarda de arriba (`existing_source`) sólo miraba QUÉ midió; ésta mira
  // CÓMO se grabó, que es la pregunta que faltaba.
  if (assign.existing_via === 'live') return true;

  // EL MISMO ESCRITOR QUE EL HUÉRFANO, y ahí estaba el fallo. Aquí vivía un `insert`
  // propio que escribía la duración y la procedencia, **y nada más**: ni km, ni pulso,
  // ni calorías, ni un solo tramo, ni zonas. O sea que el MISMO entreno salía PEOR
  // casado con la sesión que el coach prescribió que si no hubiera existido esa sesión
  // — «22:40 y cero bloques» donde el huérfano guardaba 3,78 km y 153 ppm.
  await materializeHealthkitWorkout({ sql, athlete_id, workout, assignment_id: assign.id });

  // Close the loop: a synced HealthKit workout proves the session was done, so
  // promote a still-'scheduled' assignment to 'completed'. Never clobbers an
  // explicit manual 'partial'/'completed' or a coach 'skipped'/'missed' (the
  // helper guards on status='scheduled'). This is the fix for the "done workout
  // still shows Empezar" bug — the insert above filed actuals but left status.
  await markAssignmentDoneFromDevice(sql, assign.id, athlete_id);
  return true;
}

type SampleIngestOutcome = {
  inserted: number;
  duplicate: number;
  unknown_metric: number;
  /** Ventana que cubren las muestras de PULSO que entraron nuevas. `null` si ninguna. */
  hr_window: { from: string; to: string } | null;
};

/**
 * Las muestras de un lote, en bloque.
 *
 * DE-DUPE, DOS VECES Y POR EL MISMO CRITERIO. Dentro del propio lote (dos páginas
 * solapadas del importador pueden traer la misma lectura) y contra lo ya guardado
 * (`not exists`), ambas por (atleta, fuente, métrica, instante, valor).
 *
 * EL VALOR SE COMPARA REDONDEADO A LA PRECISIÓN DE LA COLUMNA. `value_numeric` es
 * `numeric(12,4)`: un HRV de 45,678901 ms se guarda como 45,6789, así que compararlo
 * contra el 45,678901 que llega por el cable NUNCA casa y la fila se reinsertaba en
 * cada re-sync. Es el origen de buena parte de las 106.880 filas que hay para 46.366
 * instantes reales, y con un import de dos años detrás dejaba de ser una molestia.
 */
async function ingestSamples(args: {
  sql: Sql;
  athlete_id: bigint;
  samples: readonly HKBiometricSampleDTO[];
}): Promise<SampleIngestOutcome> {
  const { sql, athlete_id, samples } = args;
  const out: SampleIngestOutcome = {
    inserted: 0,
    duplicate: 0,
    unknown_metric: 0,
    hr_window: null,
  };

  type Row = {
    metric: string;
    recorded_at: string;
    value: number;
    unit: string;
    source_workout_id: string | null;
  };
  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const s of samples) {
    const canonical = canonicalizeHealthkitMetric(s.metric_type);
    if (!canonical) {
      out.unknown_metric += 1;
      continue;
    }
    // La clave usa el instante NORMALIZADO (epoch), no el texto: el mismo momento
    // escrito con otro desplazamiento horario es el mismo momento.
    const at = new Date(s.recorded_at).getTime();
    const key = `${canonical}|${at}|${s.value_numeric}`;
    if (seen.has(key)) {
      out.duplicate += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      metric: canonical,
      recorded_at: s.recorded_at,
      value: s.value_numeric,
      unit: s.unit || '',
      source_workout_id: s.source_workout_id ?? null,
    });
  }

  if (rows.length === 0) return out;

  const insertedHrTimes: number[] = [];
  for (let i = 0; i < rows.length; i += SAMPLE_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + SAMPLE_INSERT_CHUNK);
    const inserted = await insertSampleChunk({ sql, athlete_id, chunk });
    out.inserted += inserted.length;
    out.duplicate += chunk.length - inserted.length;
    // Sólo el pulso mueve las zonas. El peso o los pasos no tienen nada que
    // recalcular, y arrastrarlos aquí dispararía trabajo por nada.
    for (const r of inserted) {
      if (r.metric_type === 'hr') insertedHrTimes.push(r.recorded_at.getTime());
    }
  }

  if (insertedHrTimes.length > 0) {
    // Recorrido, no `Math.min(...array)`: el esquema no le pone techo al número de
    // muestras de un lote, y desparramar decenas de miles de argumentos en una
    // llamada es una forma tonta de reventar la pila.
    let from = insertedHrTimes[0]!;
    let to = insertedHrTimes[0]!;
    for (const t of insertedHrTimes) {
      if (t < from) from = t;
      if (t > to) to = t;
    }
    out.hr_window = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  return out;
}

async function insertSampleChunk(args: {
  sql: Sql;
  athlete_id: bigint;
  chunk: ReadonlyArray<{
    metric: string;
    recorded_at: string;
    value: number;
    unit: string;
    source_workout_id: string | null;
  }>;
}): Promise<Array<{ metric_type: string; recorded_at: Date }>> {
  const { sql, athlete_id, chunk } = args;
  const id = athlete_id as unknown as number;

  // Los valores viajan como texto y se convierten en Postgres: así el número que se
  // compara y el que se guarda son EXACTAMENTE el mismo, sin pasar por un float
  // intermedio que podría desviar el último decimal.
  return sql<Array<{ metric_type: string; recorded_at: Date }>>`
    insert into biometric_streams (
      athlete_id, source, source_workout_id, metric_type, recorded_at,
      value_numeric, unit, raw_payload_json
    )
    select
      ${id},
      'healthkit',
      t.workout_id,
      t.metric::biometric_metric,
      t.at::timestamptz,
      t.val::numeric(12,4),
      t.unit,
      null
    from unnest(
      ${chunk.map((r) => r.metric)}::text[],
      ${chunk.map((r) => r.recorded_at)}::text[],
      ${chunk.map((r) => String(r.value))}::text[],
      ${chunk.map((r) => r.unit)}::text[],
      ${chunk.map((r) => r.source_workout_id)}::text[]
    ) as t(metric, at, val, unit, workout_id)
    where not exists (
      select 1 from biometric_streams b
      where b.athlete_id = ${id}
        and b.source = 'healthkit'
        and b.metric_type = t.metric::biometric_metric
        and b.recorded_at = t.at::timestamptz
        and b.value_numeric = t.val::numeric(12,4)
    )
    returning metric_type::text as metric_type, recorded_at
  `;
}

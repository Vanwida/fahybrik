// El materializador del importador FIT: de una `CanonicalActivity` (el
// contrato del parser, `./canonical.ts`) a una sesión REAL en las tablas de
// siempre — la misma `workout_executions` / `segment_executions` /
// `workout_routes` / `biometric_streams` que escribe una sesión en vivo.
//
// ESPEJOS ESTUDIADOS ANTES DE ESCRIBIR ESTO (docs/DECISIONS.md, 2026-08-13
// «El histórico rico entra por FICHERO FIT»):
//   · materialize-healthkit-workout.ts  → el patrón base: sesión sin
//     assignment, `recorded_via='imported'`, tramo resumen si no hay detalle.
//   · record-workout-execution.ts       → cómo se escribe `workout_routes`.
//   · execution-time-dedupe.ts          → el solape de ventana, compartido.
//   · segment-zone-seconds.ts           → el motor de zonas, sin reinventar.
//   · segment-work.ts (mig 0146)        → is_structural / leg_role.
//   · ingest-garmin.ts                  → el precedente MÁS cercano: un
//     reloj Garmin ya escribe `source='garmin'` + `recorded_via='imported'`
//     hoy mismo, y es la razón de la decisión de abajo sobre `source`.
//
// FRICCIÓN CON EL ESQUEMA REAL, DECIDIDA AQUÍ (no hay vuelta atrás sin tocar
// una migración, así que queda documentada en el sitio que la resuelve):
//
//   1. `source='fit_import'` no es legal. `workout_executions.source` y
//      `biometric_streams.source` son el enum CERRADO `biometric_source`
//      (0001 + 0135/0143/0180), y no incluye `fit_import`. La migración 0144
//      es explícita sobre qué pregunta responde `source` — QUÉ APARATO midió,
//      no CÓMO llegó el registro (eso es `recorded_via`, que sí es
//      'imported') — y `garmin` YA existe con ese significado exacto: es el
//      mismo valor que escribe hoy `ingest-garmin.ts` para un reloj Garmin
//      que llega por la API. Un FIT de Garmin y una actividad de la API de
//      Garmin son el MISMO aparato por dos tuberías distintas; lo que las
//      distingue es `source_workout_ref` (prefijo `fit:`), no `source`. Se usa
//      `'garmin'` en las tres columnas de procedencia (ejecución, tramo,
//      muestra de pulso) en vez de inventar un valor nuevo.
//
//   2. `hr_source` (segment_executions, CHECK cerrado a 'strap'|'healthkit'|
//      'pm5', mig 0153) no tiene un valor honesto para "el sensor propio de
//      un reloj Garmin, óptico o correa emparejada, no lo sabemos por el FIT".
//      Forzar cualquiera de los tres mentiría sobre el aparato. Se deja NULL
//      — el mismo significado que ya tiene la columna para "no se sabe".
//
//   3. `segment_executions` no tiene una columna de desnivel POR TRAMO
//      (`elevation_gain_m` solo existe a nivel de EJECUCIÓN, mig 0154).
//      `CanonicalLap.elevation_gain_m` no tiene dónde ir; no se fuerza a
//      `avg_gradient_pct` (mig 0185) porque esa columna es cambio NETO de
//      altitud, una magnitud distinta de un acumulado siempre positivo —
//      escribir una en la otra sería inventar un dato. El desnivel del lap se
//      pierde hasta que exista una columna para él.
//
//   4. La MAYOR: `leg_role` (0146, «work»/«recovery» — justo la distinción
//      que separa una serie de su trote de vuelta) solo se puede guardar
//      junto con `leg_index` y `leg_phase` — el CHECK de la 0146 exige los
//      tres o ninguno. `leg_phase` (warmup/main/cooldown) es información que
//      el CONTRATO ya no lleva: `CanonicalLap.role` es binario porque el
//      parser colapsa ahí el vocabulario FIT (active/rest/warmup/cooldown/
//      recovery, ver canonical.ts) y el materializador tiene prohibido
//      reinterpretar. No hay forma honesta de rellenar `leg_phase` aquí. Se
//      deja el trío NULL: un lap de recuperación de una sesión de series
//      importada cuenta, hoy, como trabajo — ni mejor ni peor que CUALQUIER
//      tramo anterior a la 0146, así que no es una regresión, pero SÍ es la
//      capacidad que se pierde al importar en vez de vivir la sesión en la
//      app. Marcar esos laps `is_structural=true` sería peor: esa columna
//      también los saca del VOLUMEN (0146: la recuperación sí cuenta ahí), y
//      unos metros de trote de verdad desaparecerían del total semanal.
//      Seguimiento propuesto (no ejecutado aquí): separar `leg_role` del
//      trío en una migración, o darle al parser una señal de fase.
//
// TRANSACCIÓN POR ACTIVIDAD (regla del encargo): el borrado del blob que se
// reemplaza y la escritura completa de la nueva sesión son una sola
// transacción — o entra la rica entera, o no cambia nada. Las comprobaciones
// de dedupe/solape van ANTES, con el cliente normal (mismo patrón que
// `ingest-garmin.ts`): no hace falta que compartan transacción con la
// escritura, y así `execution-time-dedupe.ts` no necesita aceptar también un
// `TransactionClient`. El cómputo de zonas va DESPUÉS del commit, igual que
// en `materialize-healthkit-workout.ts`: una zona rota no debe tumbar la
// sesión que sí se guardó, y el propio `computeExecutionZoneSeconds` ya
// protege eso con su try/catch.

import type { Sql, TransactionClient } from '@/lib/db';
import { withOwnOrAmbientTx } from '@/lib/db';
import { computeExecutionZoneSeconds } from '@/lib/zones/segment-zone-seconds';
import { findOverlappingExecution } from '@/lib/sync/execution-time-dedupe';
import { encodePolyline } from '@/lib/sync/polyline';
import { deriveLapIntensity } from '@/lib/garmin/lap-mapping';
import type { CanonicalActivity, CanonicalLap } from './canonical';

/** El aparato que hay detrás de un import FIT — ver friction #1 arriba. */
const FIT_DEVICE_SOURCE = 'garmin';

/** Filas por sentencia al insertar muestras de pulso (mismo tope que
 *  `ingest-healthkit.ts`: un lote normal cabe en una, y protege de una
 *  consulta desmedida si un FIT trajera un histórico enorme de pulso). */
const HR_SAMPLE_INSERT_CHUNK = 1000;

export type FitMaterializeOutcome = 'inserted' | 'superseded' | 'exists' | 'skipped_live';

export type FitMaterializeResult = {
  outcome: FitMaterializeOutcome;
  execution_id: string | null;
};

/** Entero acotado [min,max] o NULL — nunca un valor imposible en disco.
 *  Mismo patrón que `materialize-healthkit-workout.ts`. */
function intOrNull(n: number | null | undefined, min: number, max: number): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

/** Número no-negativo finito o NULL. Mismo patrón que el espejo de HealthKit. */
function numOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Guardas de coherencia que SÍ tumban la actividad entera: sin una ventana
 *  temporal válida no hay nada que atribuir a nada (zonas, tramos, ruta). Un
 *  campo numérico suelto roto se resuelve a NULL (arriba); una ventana rota
 *  no se puede arreglar a null porque la sesión ENTERA depende de ella. */
function assertCoherentWindow(activity: CanonicalActivity): void {
  if (!activity.source_ref || activity.source_ref.trim().length === 0) {
    throw new Error('materializeFitActivity: source_ref vacío');
  }
  const start = activity.started_at?.getTime();
  const end = activity.ended_at?.getTime();
  if (start == null || Number.isNaN(start)) {
    throw new Error(`materializeFitActivity: started_at inválido (${activity.source_ref})`);
  }
  if (end == null || Number.isNaN(end)) {
    throw new Error(`materializeFitActivity: ended_at inválido (${activity.source_ref})`);
  }
  if (end <= start) {
    throw new Error(`materializeFitActivity: ended_at <= started_at (${activity.source_ref})`);
  }
}

/**
 * Convierte una actividad canónica (un FIT ya parseado) en una sesión real.
 * Ver la cabecera del fichero para las decisiones de diseño y las fricciones
 * con el esquema.
 */
export async function materializeFitActivity(args: {
  sql: Sql | TransactionClient;
  athlete_id: bigint;
  activity: CanonicalActivity;
  /** Por defecto sí: una actividad importada es una sesión con zonas. El
   *  backfill masivo lo apaga, igual que en el espejo de HealthKit. */
  computeZones?: boolean;
}): Promise<FitMaterializeResult> {
  const { sql, athlete_id, activity } = args;
  const id = athlete_id as unknown as number;

  assertCoherentWindow(activity);

  // ── 1) Dedupe EXACTO — la clave propia del FIT (canonical.ts: `fit:<serial>:
  // <epoch>` o `fit:sha1(bytes):<epoch>`). Idempotente: subir el mismo fichero
  // dos veces no crea una segunda fila. ──────────────────────────────────────
  const already = await sql<Array<{ id: string }>>`
    select id::text from workout_executions
    where athlete_id = ${id} and source_workout_ref = ${activity.source_ref}
    limit 1
  `;
  if (already[0]) return { outcome: 'exists', execution_id: already[0].id };

  // ── 2) Solape de ventana — la regla de fidelidad del DECISIONS.md: el blob
  // plano de Apple Salud SE REEMPLAZA; cualquier otra cosa (viva, asignada,
  // otro import ya archivado) gana y el FIT se salta. ────────────────────────
  let supersedeExecutionId: string | null = null;
  const overlap = await findOverlappingExecution(
    sql as Sql,
    athlete_id,
    activity.started_at,
    activity.ended_at,
  );
  if (overlap) {
    const owner = await sql<
      Array<{ source: string | null; recorded_via: string | null; assignment_id: string | null }>
    >`
      select source::text as source, recorded_via::text as recorded_via, assignment_id::text as assignment_id
      from workout_executions where id = ${overlap.id}::bigint limit 1
    `;
    const row = owner[0];
    // El "blob plano" es ESPECÍFICAMENTE la sesión histórica sin assignment que
    // nace en `materialize-healthkit-workout.ts` (source=healthkit,
    // recorded_via=imported, assignment_id NULL). Si esa MISMA combinación
    // tiene un assignment (un Apple Watch que sincronizó una sesión que el
    // coach sí había programado), no es el blob plano descartable: es la
    // sesión asignada del atleta, y "la viva SIEMPRE gana" la protege igual
    // que a una 'live' o 'manual'. El nombre `skipped_live` cubre las tres.
    const isFlatHealthkitBlob =
      row?.source === 'healthkit' && row.recorded_via === 'imported' && row.assignment_id === null;
    if (!isFlatHealthkitBlob) {
      return { outcome: 'skipped_live', execution_id: null };
    }
    supersedeExecutionId = overlap.id;
  }

  // ── 3) Escritura atómica. Los laps válidos primero: uno con `ended_at` antes
  // que `started_at` es un lap corrupto del fichero, no un dato a fabricar —
  // se descarta y el resto conserva su orden (posiciones contiguas). ─────────
  const validLaps = activity.laps.filter((lap) => lap.ended_at.getTime() >= lap.started_at.getTime());

  const executionId = await withOwnOrAmbientTx(sql, async (tx) => {
    if (supersedeExecutionId) {
      // `on delete cascade` en TODAS las FKs reales de workout_executions.id
      // (segment_executions → set_executions/segment_zone_seconds,
      // workout_routes, workout_traces, workout_sensor_captures — verificado
      // en infra/migrations, ninguna usa `set null` ni `restrict`). Un solo
      // delete se lleva la ejecución plana y todo lo que colgaba de ella.
      await tx`delete from workout_executions where id = ${supersedeExecutionId}::bigint`;
    }

    const wallSeconds = Math.round(
      (activity.ended_at.getTime() - activity.started_at.getTime()) / 1000,
    );
    // `moving_seconds` es el timer time SIN pausas que trae el propio FIT
    // (`duration_s`); el CHECK de la 0154 exige que nunca supere el tiempo de
    // pared, así que un fichero incoherente se resuelve a NULL, no a un
    // valor que reventaría el insert.
    const movingSeconds =
      activity.duration_s != null &&
      Number.isFinite(activity.duration_s) &&
      activity.duration_s >= 0 &&
      Math.round(activity.duration_s) <= wallSeconds
        ? Math.round(activity.duration_s)
        : null;

    const execRows = await tx<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, source_workout_ref, recorded_via,
        avg_hr, max_hr, total_distance_m, total_calories,
        elevation_gain_m, elevation_loss_m, moving_seconds
      ) values (
        null,
        ${id},
        ${activity.started_at.toISOString()}::timestamptz,
        ${activity.ended_at.toISOString()}::timestamptz,
        ${wallSeconds},
        ${FIT_DEVICE_SOURCE}::biometric_source,
        ${activity.source_ref},
        'imported'::execution_recording_method,
        ${intOrNull(activity.avg_hr, 30, 260)},
        ${intOrNull(activity.max_hr, 30, 260)},
        ${numOrNull(activity.distance_m)},
        ${numOrNull(activity.calories_kcal)},
        ${numOrNull(activity.elevation_gain_m)},
        ${numOrNull(activity.elevation_loss_m)},
        ${movingSeconds}
      )
      returning id::text
    `;
    const executionId = execRows[0]!.id;

    // ── Tramos: un lap por fila, o el tramo resumen si el fichero no trae
    // detalle (mismo fallback que el espejo de HealthKit). ──────────────────
    if (validLaps.length > 0) {
      for (let i = 0; i < validLaps.length; i++) {
        await insertLapSegment({
          tx: tx as TransactionClient,
          executionId,
          position: i,
          lap: validLaps[i]!,
          modality: activity.modality,
        });
      }
    } else {
      await insertSummarySegment({ tx: tx as TransactionClient, executionId, activity });
    }

    // ── Ruta GPS: mismo formato exacto que `record-workout-execution.ts`
    // (execution_id, polyline, point_count) para que el lector actual la
    // pinte sin tocarlo. ─────────────────────────────────────────────────────
    if (activity.route.length > 0) {
      const polyline = encodePolyline(activity.route);
      await tx`
        insert into workout_routes (execution_id, polyline, point_count)
        values (${executionId}::bigint, ${polyline}, ${activity.route.length})
        on conflict (execution_id) do update set
          polyline = excluded.polyline,
          point_count = excluded.point_count
      `;
    }

    // ── Muestras de pulso: SOLO si el atleta no tiene ya pulso ahí — no se
    // duplican las de Apple Salud (duplicarlas doblaría las zonas). ─────────
    if (activity.hr_samples.length > 0) {
      const existingHr = await tx<Array<{ has_samples: boolean }>>`
        select exists(
          select 1 from biometric_streams
          where athlete_id = ${id}
            and metric_type = 'hr'
            and recorded_at >= ${activity.started_at.toISOString()}::timestamptz
            and recorded_at <= ${activity.ended_at.toISOString()}::timestamptz
        ) as has_samples
      `;
      if (!existingHr[0]!.has_samples) {
        await insertHrSamples({
          tx: tx as TransactionClient,
          athleteId: id,
          sourceRef: activity.source_ref,
          samples: activity.hr_samples,
        });
      }
    }

    return executionId;
  });

  if (args.computeZones !== false) {
    try {
      await computeExecutionZoneSeconds({ execution_id: Number(executionId), client: sql as Sql });
    } catch {
      // Una zona rota no puede tumbar el lote ya guardado. Mismo try/catch que
      // el espejo de HealthKit; el reconstructor las rellena más tarde.
    }
  }

  return { outcome: supersedeExecutionId ? 'superseded' : 'inserted', execution_id: executionId };
}

/** Un tramo por lap real, con la intensidad derivada por el mismo mapeador
 *  que ya usan las vueltas de Garmin (`lib/garmin/lap-mapping.ts`) — misma
 *  fórmula, un solo sitio, nada reinventado. */
async function insertLapSegment(args: {
  tx: TransactionClient;
  executionId: string;
  position: number;
  lap: CanonicalLap;
  modality: CanonicalActivity['modality'];
}): Promise<void> {
  const { tx, executionId, position, lap, modality } = args;
  // El pace se deriva con el timer time del lap (`duration_s`, sin pausas)
  // cuando el fichero lo trae; si no, con el tiempo de pared del propio lap.
  // Preferir el timer time es lo que hace que un lap con auto-pausa no salga
  // más lento de lo que de verdad corrió el atleta.
  const elapsedS = Math.round((lap.ended_at.getTime() - lap.started_at.getTime()) / 1000);
  const durationForPace = lap.duration_s ?? elapsedS;
  const intensity = deriveLapIntensity({
    modality,
    distance_meters: lap.distance_m,
    duration_seconds: durationForPace,
    run_cadence_spm: lap.run_cadence_spm,
  });
  // El propio lap manda si el reloj ya traía su pace; si no, el derivado.
  const avgPace = lap.avg_pace_s_per_km ?? intensity.avg_pace_s_per_km;

  await tx`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, avg_hr, max_hr, modality,
      avg_pace_s_per_km, run_cadence_spm, source, context_source
    ) values (
      ${executionId}::bigint,
      ${position},
      ${lap.started_at.toISOString()}::timestamptz,
      ${lap.ended_at.toISOString()}::timestamptz,
      ${numOrNull(lap.distance_m)},
      ${intOrNull(lap.avg_hr, 30, 260)},
      ${intOrNull(lap.max_hr, 30, 260)},
      ${modality},
      ${avgPace ?? null},
      ${intensity.run_cadence_spm},
      ${FIT_DEVICE_SOURCE},
      'session'
    )
  `;
}

/** El tramo único cuando el fichero no trae laps — el mismo fallback que
 *  `materialize-healthkit-workout.ts` usa para un HKWorkout sin detalle. */
async function insertSummarySegment(args: {
  tx: TransactionClient;
  executionId: string;
  activity: CanonicalActivity;
}): Promise<void> {
  const { tx, executionId, activity } = args;
  const paceKm =
    activity.modality === 'run' &&
    activity.distance_m != null &&
    activity.distance_m > 0 &&
    activity.duration_s != null &&
    activity.duration_s > 0
      ? activity.duration_s / (activity.distance_m / 1000)
      : null;

  await tx`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, calories, avg_hr, max_hr,
      modality, avg_pace_s_per_km, source, context_source
    ) values (
      ${executionId}::bigint,
      0,
      ${activity.started_at.toISOString()}::timestamptz,
      ${activity.ended_at.toISOString()}::timestamptz,
      ${numOrNull(activity.distance_m)},
      ${numOrNull(activity.calories_kcal)},
      ${intOrNull(activity.avg_hr, 30, 260)},
      ${intOrNull(activity.max_hr, 30, 260)},
      ${activity.modality},
      ${paceKm},
      ${FIT_DEVICE_SOURCE},
      'session'
    )
  `;
}

/** Inserta las muestras de pulso en bloque, con el mismo patrón `unnest` que
 *  `ingest-healthkit.ts` — una sentencia por lote de hasta 1000 filas, en vez
 *  de un viaje a la base por muestra (un FIT largo trae miles). */
async function insertHrSamples(args: {
  tx: TransactionClient;
  athleteId: number;
  sourceRef: string;
  samples: CanonicalActivity['hr_samples'];
}): Promise<void> {
  const { tx, athleteId, sourceRef, samples } = args;
  for (let i = 0; i < samples.length; i += HR_SAMPLE_INSERT_CHUNK) {
    const chunk = samples.slice(i, i + HR_SAMPLE_INSERT_CHUNK);
    await tx`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      )
      select
        ${athleteId},
        ${FIT_DEVICE_SOURCE}::biometric_source,
        ${sourceRef},
        'hr'::biometric_metric,
        t.at::timestamptz,
        t.bpm::numeric(12,4),
        'bpm',
        null
      from unnest(
        ${chunk.map((s) => s.at.toISOString())}::text[],
        ${chunk.map((s) => String(s.bpm))}::text[]
      ) as t(at, bpm)
    `;
  }
}

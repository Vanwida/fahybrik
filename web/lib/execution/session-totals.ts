import 'server-only';

// LOS TOTALES DE CABECERA DE UNA SESIÓN — card 126.
//
// `workout_executions.avg_hr` / `max_hr` / `total_distance_m` / `total_calories`
// existen desde la migración 0154 y, para las ejecuciones grabadas EN VIVO por
// la app (`recorded_via = 'live'`), estaban las cuatro vacías: verificado el
// 20-ago-2026, 0 de 55. El motor en vivo manda tramos (`segment_executions`) y a
// veces trazas (`workout_traces`), pero nadie los AGREGABA a la cabecera — cada
// pantalla los habría tenido que sumar por su cuenta, y eso es exactamente lo
// que este módulo evita: un solo sitio que decide qué significa "la FC media de
// la sesión" o "la distancia total", reusado por cualquier pantalla que lea
// `workout_executions` sin volver a calcular nada.
//
// LA ESCALERA DE EVIDENCIA PARA FC (regla 1). Igual que `bestHrTrace` en
// `zones/segment-zone-seconds.ts` para el reparto de zonas:
//   1. TRAZA de pulso (`workout_traces.signal = 'hr'`, la de mejor fidelidad —
//      `loadExecutionTraces` ya aplica ese orden). Es la medida cruda, la mejor
//      que hay: media aritmética y máximo de las muestras.
//   2. TRAMOS con pulso (`segment_executions.avg_hr` / `max_hr`). Media
//      ponderada por la duración de cada tramo — un tramo de 11 min pesa más
//      que uno de 4 — y máximo el mayor `max_hr` de los tramos.
//   3. NADA. Null, nunca cero: "no se sabe" es un valor de primera clase (ver
//      docs/DECISIONS.md, 28-jul).
// Las bandas fisiológicas (30..260, el mismo CHECK que ya protege la fila) se
// respetan aquí TAMBIÉN en el camino de traza: una traza no pasa por
// `sanitizeHrBpm` al guardarse (guarda la serie cruda), así que un pico de
// artefacto podría colarse en la media/máximo si no se acotara aquí.
//
// LA DISTANCIA TOTAL (regla 2) — la que NO se puede relajar. Solo se rellena
// cuando UNA SOLA modalidad (`segment_executions.modality`, ya canónica: run |
// row | ski | bike | strength | other) midió distancia en toda la sesión.
// Sumar metros de correr con metros de remo no es una distancia, es un número
// sin significado — y la pantalla ya sabe enseñar la distancia por tramo
// cuando eso pasa. Como la modalidad en `segment_executions` ya es granular
// (row/ski/bike son valores DISTINTOS, nunca un "ergómetro" genérico), no hace
// falta ninguna regla extra para que un remo y un ski cuenten como dos
// modalidades: lo son de fábrica.
//
// LAS CALORÍAS (regla 3) — suma de `segment_executions.calories` cuando algún
// tramo las trae. Nunca una estimación desde pulso o peso: eso sería inventar
// un dato que el aparato no midió.
//
// UNA RECOMPUTACIÓN, NO UN CAMPO DEL INSERT. `computeSessionTotals` es una
// función separada que RELEE la evidencia ya persistida (tramos + trazas) y
// REESCRIBE la cabecera — el mismo patrón que `computeMeasuredHeader` para
// deriva/desnivel/recuperación. No entra en el INSERT/ON CONFLICT de
// `record-workout-execution.ts` a propósito: ese insert escribe la fila ANTES
// de que los tramos de ESTE MISMO payload existan en `segment_executions`, así
// que calcular ahí solo vería tramos de una sincronización anterior. Llamando
// a esto DESPUÉS de `ingestExecutionSegments` (y también cuando llega una
// traza de pulso por `ingest-workout-traces.ts`) se recalcula sobre el estado
// completo y real, y un reenvío da SIEMPRE el mismo resultado — la idempotencia
// que pedía la card no depende de ninguna cláusula `coalesce`/`excluded` en el
// insert, depende de que la misma evidencia produce siempre el mismo cálculo.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadExecutionTraces } from '@/lib/execution/execution-traces';
import { HR_MIN_BPM, HR_MAX_BPM } from '@/lib/sync/ingest-execution-segments';

/** Redondea a bpm entero y descarta lo que se sale de la banda fisiológica —
 *  nunca un valor imposible, nunca un cero fabricado. */
function clampHrOrNull(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= HR_MIN_BPM && r <= HR_MAX_BPM ? r : null;
}

/** Redondea una cantidad no-negativa (metros, calorías) a 2 decimales. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface SegmentHrEvidence {
  avg_hr: number | null;
  max_hr: number | null;
  /** Duración del tramo en segundos — el peso de su media en la ponderada.
   *  `null` cuando el tramo no tiene ventana medible: no pesa (no aporta ni
   *  resta), nunca se trata como 0 s con evidencia real. */
  duration_s: number | null;
}

export interface SessionHr {
  avg_hr: number | null;
  max_hr: number | null;
}

/**
 * FC media y máxima de la sesión — regla 1. `traceValues` ya viene de la mejor
 * traza disponible (o vacío si no hay ninguna); `segments` es el fallback.
 */
export function resolveSessionHr(args: {
  traceValues: readonly number[];
  segments: readonly SegmentHrEvidence[];
}): SessionHr {
  const { traceValues, segments } = args;

  if (traceValues.length > 0) {
    const avg = traceValues.reduce((sum, v) => sum + v, 0) / traceValues.length;
    const max = Math.max(...traceValues);
    return { avg_hr: clampHrOrNull(avg), max_hr: clampHrOrNull(max) };
  }

  const withAvg = segments.filter((s) => s.avg_hr != null);
  let avg_hr: number | null = null;
  if (withAvg.length > 0) {
    const totalWeight = withAvg.reduce((sum, s) => sum + (s.duration_s ?? 0), 0);
    if (totalWeight > 0) {
      const weightedSum = withAvg.reduce((sum, s) => sum + s.avg_hr! * (s.duration_s ?? 0), 0);
      avg_hr = clampHrOrNull(weightedSum / totalWeight);
    } else {
      // Ningún tramo con pulso tiene una duración utilizable (caso raro): media
      // simple en vez de dividir por cero. Sigue siendo la mejor evidencia que
      // hay, solo que sin forma de pesarla.
      const simpleSum = withAvg.reduce((sum, s) => sum + s.avg_hr!, 0);
      avg_hr = clampHrOrNull(simpleSum / withAvg.length);
    }
  }

  const maxes = segments.map((s) => s.max_hr).filter((v): v is number => v != null);
  const max_hr = maxes.length > 0 ? clampHrOrNull(Math.max(...maxes)) : null;

  return { avg_hr, max_hr };
}

export interface SegmentDistanceEvidence {
  modality: string;
  distance_meters: number | null;
}

/**
 * Distancia total de la sesión — regla 2. `null` A PROPÓSITO cuando más de una
 * modalidad midió distancia: sumarlas sería un número sin significado.
 */
export function resolveTotalDistance(segments: readonly SegmentDistanceEvidence[]): number | null {
  const modalitiesWithDistance = new Set(
    segments.filter((s) => s.distance_meters != null).map((s) => s.modality),
  );
  if (modalitiesWithDistance.size !== 1) return null;
  const [onlyModality] = modalitiesWithDistance;
  const sum = segments
    .filter((s) => s.modality === onlyModality && s.distance_meters != null)
    .reduce((acc, s) => acc + (s.distance_meters ?? 0), 0);
  return round2(sum);
}

export interface SegmentCaloriesEvidence {
  calories: number | null;
}

/** Calorías totales de la sesión — regla 3. `null` si ningún tramo las trae. */
export function resolveTotalCalories(segments: readonly SegmentCaloriesEvidence[]): number | null {
  const withCalories = segments.filter((s) => s.calories != null);
  if (withCalories.length === 0) return null;
  return round2(withCalories.reduce((acc, s) => acc + (s.calories ?? 0), 0));
}

export interface SessionTotalsResult {
  execution_id: number;
  written: boolean;
  avg_hr: number | null;
  max_hr: number | null;
  total_distance_m: number | null;
  total_calories: number | null;
}

function notWritten(execution_id: number): SessionTotalsResult {
  return {
    execution_id,
    written: false,
    avg_hr: null,
    max_hr: null,
    total_distance_m: null,
    total_calories: null,
  };
}

type SegmentRow = {
  modality: string;
  distance_meters: string | null;
  calories: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  started_at: Date | null;
  ended_at: Date | null;
};

/**
 * Recalcula y reescribe `avg_hr` / `max_hr` / `total_distance_m` /
 * `total_calories` de una ejecución a partir de sus tramos y su mejor traza de
 * pulso. Idempotente: la misma evidencia produce siempre el mismo resultado.
 *
 * Llamar tras cualquier escritura que pueda cambiar la evidencia: al terminar
 * de ingerir los tramos de un guardado (`record-workout-execution.ts`) y al
 * llegar una traza de pulso (`ingest-workout-traces.ts`).
 *
 * `written: false` cuando la ejecución no existe o no tiene ni tramos ni
 * ninguna traza — nada que recalcular, nada que tocar.
 */
export async function computeSessionTotals(args: {
  execution_id: number;
  client?: Sql | TransactionClient;
}): Promise<SessionTotalsResult> {
  const client = args.client ?? defaultSql;
  const { execution_id } = args;

  const executions = await client<Array<{ started_at: Date | null }>>`
    select started_at from workout_executions where id = ${execution_id} limit 1
  `;
  const execution = executions[0];
  if (!execution) return notWritten(execution_id);

  const segmentRows = await client<SegmentRow[]>`
    select modality, distance_meters::text, calories::text, avg_hr, max_hr, started_at, ended_at
    from segment_executions
    where execution_id = ${execution_id}
  `;

  // `loadExecutionTraces` está tipado sobre `Sql`; un `TransactionClient` es
  // estructuralmente el mismo cliente etiquetado dentro de una transacción
  // (mismo patrón que `ingestExecutionSegments`, que acepta `Sql |
  // TransactionClient` y reenvía tal cual).
  const traces = await loadExecutionTraces({
    execution_id,
    started_at: execution.started_at,
    client: client as Sql,
  });

  if (segmentRows.length === 0 && !traces.hasAnyTrace) return notWritten(execution_id);

  const hrSegments: SegmentHrEvidence[] = segmentRows.map((r) => ({
    avg_hr: r.avg_hr,
    max_hr: r.max_hr,
    duration_s:
      r.started_at && r.ended_at
        ? Math.max(0, Math.round((r.ended_at.getTime() - r.started_at.getTime()) / 1000))
        : null,
  }));
  const { avg_hr, max_hr } = resolveSessionHr({ traceValues: traces.hr.values, segments: hrSegments });

  const total_distance_m = resolveTotalDistance(
    segmentRows.map((r) => ({
      modality: r.modality,
      distance_meters: r.distance_meters != null ? Number(r.distance_meters) : null,
    })),
  );
  const total_calories = resolveTotalCalories(
    segmentRows.map((r) => ({ calories: r.calories != null ? Number(r.calories) : null })),
  );

  await client`
    update workout_executions
    set
      avg_hr = ${avg_hr},
      max_hr = ${max_hr},
      total_distance_m = ${total_distance_m},
      total_calories = ${total_calories},
      updated_at = now()
    where id = ${execution_id}
  `;

  return { execution_id, written: true, avg_hr, max_hr, total_distance_m, total_calories };
}

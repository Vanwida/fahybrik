import 'server-only';

// Carga y normaliza las trazas de UNA ejecución — el paso que necesitan tanto
// quien ESCRIBE la cabecera derivada (`measured-header.ts`: deriva aeróbica,
// desnivel, recuperación de pulso) como quien LA LEE para pintar
// (`session-trace.ts`: splits + curva). Extraído a un único sitio para que
// las dos rutas no tengan cada una su propia copia de "cómo se alinean las
// señales" — exactamente el error que ya se evitó una vez reusando
// `bestHrTrace` en vez de duplicarlo.
//
// EL EJE COMÚN. `hr`/`speed`/`altitude`/`distance` llegan cada una con su
// propio `started_at` (pueden diferir en milisegundos entre señales). Todo se
// re-expresa en segundos desde el `started_at` que pasa el llamador —
// normalmente el de `workout_executions` — para que una muestra de pulso y
// un tramo de `segment_executions` hablen del mismo instante.
//
// ZOD EN EL BORDE. Cada fila leída de `workout_traces` se valida contra
// `workoutTraceSchema` antes de usarse; una fila que no encaje (arrays
// desalineados, un valor fuera de tipo) se descarta en vez de propagar
// basura — tolerante, nunca lanza.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { bestHrTrace, type TraceRow } from '@/lib/zones/segment-zone-seconds';
import { workoutTraceSchema } from '@fahybrid/shared/schema/workouts';

export interface RunningTraceSeries {
  offsets_s: number[];
  values: number[];
}

export interface ExecutionTraces {
  distance: RunningTraceSeries;
  speed: RunningTraceSeries;
  hr: RunningTraceSeries;
  altitude: RunningTraceSeries;
  /** true si había AL MENOS una fila válida en `workout_traces` para esta
   *  ejecución, en cualquiera de las cuatro señales. */
  hasAnyTrace: boolean;
}

const EMPTY_SERIES: RunningTraceSeries = { offsets_s: [], values: [] };

function emptyTraces(): ExecutionTraces {
  return { distance: EMPTY_SERIES, speed: EMPTY_SERIES, hr: EMPTY_SERIES, altitude: EMPTY_SERIES, hasAnyTrace: false };
}

/** Serie en segundos absolutos (epoch), antes de re-anclar. */
function toEpochSeries(trace: TraceRow): RunningTraceSeries {
  const base = trace.started_at.getTime() / 1000;
  const n = Math.min(trace.offsets_s.length, trace.values.length);
  const offsets_s: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const offset = trace.offsets_s[i];
    const value = trace.values[i];
    if (offset == null || value == null) continue;
    offsets_s.push(base + offset);
    values.push(value);
  }
  return { offsets_s, values };
}

/** Re-ancla una serie en epoch-seconds a segundos desde `anchorEpochS`. */
function reanchor(series: RunningTraceSeries, anchorEpochS: number): RunningTraceSeries {
  return { offsets_s: series.offsets_s.map((t) => t - anchorEpochS), values: series.values };
}

/** Valida una fila de traza contra el esquema compartido antes de confiar en
 *  ella. Tolerante: una fila corrupta se descarta (null), nunca lanza. */
function validated(row: TraceRow, signal: string): TraceRow | null {
  const parsed = workoutTraceSchema.safeParse({
    signal,
    source: row.source,
    started_at: row.started_at.toISOString(),
    offsets_s: row.offsets_s,
    values: row.values,
  });
  return parsed.success ? row : null;
}

async function latestTrace(client: Sql, execution_id: number, signal: string): Promise<TraceRow | null> {
  const rows = await client<TraceRow[]>`
    select source, started_at, offsets_s, values
    from workout_traces
    where execution_id = ${execution_id} and signal = ${signal}
    order by id desc limit 1
  `;
  const row = rows[0];
  return row ? validated(row, signal) : null;
}

/**
 * Carga las cuatro señales de una ejecución (la mejor traza de `hr` por
 * fidelidad, la más reciente de las demás) y las alinea al mismo eje. Nunca
 * lanza: una ejecución sin ninguna traza guardada da `hasAnyTrace: false` y
 * cuatro series vacías — la respuesta honesta, no un error.
 */
export async function loadExecutionTraces(args: {
  execution_id: number;
  /** El ancla del eje — normalmente `workout_executions.started_at`. */
  started_at: Date | null;
  client?: Sql;
}): Promise<ExecutionTraces> {
  if (!args.started_at) return emptyTraces();
  const client = args.client ?? defaultSql;
  const anchorEpochS = args.started_at.getTime() / 1000;

  const hrTrace = await bestHrTrace(client, args.execution_id);
  const validatedHr = hrTrace ? validated(hrTrace, 'hr') : null;
  const speedTrace = await latestTrace(client, args.execution_id, 'speed');
  const altitudeTrace = await latestTrace(client, args.execution_id, 'altitude');
  const distanceTrace = await latestTrace(client, args.execution_id, 'distance');

  const hasAnyTrace = validatedHr != null || speedTrace != null || altitudeTrace != null || distanceTrace != null;
  if (!hasAnyTrace) return emptyTraces();

  return {
    hr: validatedHr ? reanchor(toEpochSeries(validatedHr), anchorEpochS) : EMPTY_SERIES,
    speed: speedTrace ? reanchor(toEpochSeries(speedTrace), anchorEpochS) : EMPTY_SERIES,
    altitude: altitudeTrace ? reanchor(toEpochSeries(altitudeTrace), anchorEpochS) : EMPTY_SERIES,
    distance: distanceTrace ? reanchor(toEpochSeries(distanceTrace), anchorEpochS) : EMPTY_SERIES,
    hasAnyTrace: true,
  };
}

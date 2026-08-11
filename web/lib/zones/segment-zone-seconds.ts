import 'server-only';

// EL MOTOR: de los pulsos de un entreno a segundos por zona, tramo a tramo.
//
// Escribe `segment_zone_seconds` (mig 0168). Es el único sitio que decide de qué
// fuente salen los segundos de un tramo, y el orden no es una preferencia: es
// una escalera de evidencia, igual que la del ancla.
//
//   1. EL REPARTO CONGELADO DEL MÓVIL (`raw_lap_data_json -> zone_seconds`). Lo
//      midió el motor en vivo latido a latido, con las bandas que el servidor le
//      dio, y luego tiró la serie. Es medida y se respeta tal cual: recalcularla
//      desde muestras más pobres sería cambiar un dato bueno por uno peor.
//   2. LA TRAZA (`workout_traces`, señal `hr`). La serie entera con su eje. La
//      clasificamos NOSOTROS. Si hay dos —la correa y el reloj— gana la de más
//      fidelidad, para no contar el mismo minuto dos veces.
//   3. LAS MUESTRAS SUELTAS (`biometric_streams`, `hr`) cruzadas POR VENTANA con
//      el tramo. Es el histórico que ya está guardado y que nadie usaba.
//   4. NADA. Y eso también se guarda: «se miró y no había pulso» es una
//      respuesta, distinta de no tener fila.
//
// SOLO PULSO DE ENTRENO. Las muestras se cruzan con la ventana de CADA TRAMO, no
// con el día. Medido el 10-ago-2026: de las 106.880 lecturas de pulso guardadas,
// 105.894 caen fuera de cualquier tramo ejecutado — el 99 %. Son el pulso de
// dormir, de estar sentado y de vivir. La lectura de polarización que había hasta
// hoy las metía todas en la base aeróbica del atleta.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { parseZoneSeconds, ZONE_KEYS, type ZoneSeconds } from '@/lib/execution/zone-seconds';
import { hrTraceFidelity } from '@fahybrid/shared/domain/execution-merge';
import {
  HR_ZONES,
  timeInZone,
  type AthleteHrZones,
  type HrSampleAt,
  type HrZone,
  type ZoneSecondsByZone,
} from '@fahybrid/shared/domain/methodology';
import type { BiometricSource } from '@fahybrid/shared/schema';

/** De dónde salieron los segundos de una fila. Espeja el CHECK de la tabla. */
export const HR_ORIGINS = ['frozen_segment', 'trace', 'samples', 'none'] as const;
export type HrOrigin = (typeof HR_ORIGINS)[number];

export interface ZoneComputeSummary {
  execution_id: number;
  /** Tramos con ventana medible — los únicos a los que se les puede atribuir tiempo. */
  segments: number;
  rows_written: number;
  /** Filas con al menos un segundo clasificado. El resto son gris honesto. */
  rows_with_zones: number;
  by_origin: Record<HrOrigin, number>;
}

function emptySummary(execution_id: number): ZoneComputeSummary {
  return {
    execution_id,
    segments: 0,
    rows_written: 0,
    rows_with_zones: 0,
    by_origin: { frozen_segment: 0, trace: 0, samples: 0, none: 0 },
  };
}

type SegmentRow = {
  id: string;
  started_at: Date;
  ended_at: Date;
  raw_lap_data_json: unknown;
};

export type TraceRow = {
  source: BiometricSource;
  started_at: Date;
  offsets_s: number[];
  values: number[];
};

/** Un tramo resuelto, listo para escribir. */
interface ComputedRow {
  segment_execution_id: number;
  by_zone: ZoneSecondsByZone;
  no_hr_s: number;
  origin: HrOrigin;
  provider: BiometricSource | null;
}

const epochSeconds = (d: Date): number => d.getTime() / 1000;

/**
 * Reparte las muestras entre los tramos, cada una a UNO solo.
 *
 * `segments` llega ordenado por inicio, así que recorrerlo del final hacia el
 * principio devuelve el tramo que empezó más tarde de los que contienen la
 * muestra — la regla de la costura. Una muestra que no cae en ninguno (el
 * descanso entre tramos) no se atribuye a nadie: ese tiempo no es de ningún
 * tramo y no tiene por qué inflar el de al lado.
 */
function attributeSamples(
  samples: readonly HrSampleAt[],
  segments: readonly SegmentRow[],
): Map<number, HrSampleAt[]> {
  const windows = segments.map((s) => ({
    id: Number(s.id),
    start: epochSeconds(s.started_at),
    end: epochSeconds(s.ended_at),
  }));
  const out = new Map<number, HrSampleAt[]>();
  for (const w of windows) out.set(w.id, []);
  for (const sample of samples) {
    for (let i = windows.length - 1; i >= 0; i--) {
      const w = windows[i]!;
      if (sample.at_s >= w.start && sample.at_s <= w.end) {
        out.get(w.id)!.push(sample);
        break;
      }
    }
  }
  return out;
}

/**
 * El reparto congelado del móvil, en el modelo. Sin ancla vuelve a cero: la
 * tabla prohíbe segundos clasificados sin un umbral que los explique, y esa
 * prohibición es la regla del modelo, no una restricción técnica.
 *
 * La zona sale del propio nombre de la clave (`z3` → 3) y no de la posición en
 * dos listas paralelas, que es la clase de acoplamiento que se rompe callado el
 * día que alguien reordena una de las dos.
 */
function frozenToByZone(frozen: ZoneSeconds, hasAnchor: boolean): ZoneSecondsByZone {
  const by_zone: ZoneSecondsByZone = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!hasAnchor) return by_zone;
  for (const key of ZONE_KEYS) {
    const zone = Number(key.slice(1)) as HrZone;
    by_zone[zone] = Math.max(0, Math.round(frozen[key]));
  }
  return by_zone;
}

/**
 * Recalcula y reescribe el reparto por zonas de TODOS los tramos de una
 * ejecución. Idempotente: vuelve a escribir las mismas filas con los mismos
 * números mientras no cambie ni el dato ni el método.
 *
 * `zones` se puede pasar ya resuelto (el reconstructor lo cachea por atleta, que
 * si no serían dos consultas por ejecución para la misma respuesta).
 */
export async function computeExecutionZoneSeconds(args: {
  execution_id: number;
  client?: Sql;
  zones?: AthleteHrZones | null;
}): Promise<ZoneComputeSummary> {
  const client = args.client ?? defaultSql;
  const summary = emptySummary(args.execution_id);

  const executions = await client<Array<{ athlete_id: string }>>`
    select athlete_id::text as athlete_id from workout_executions where id = ${args.execution_id} limit 1
  `;
  const athleteId = executions[0]?.athlete_id;
  if (!athleteId) return summary;

  // Sólo tramos con ventana: sin `started_at`/`ended_at` no hay a qué cruzar las
  // muestras, y meterles la ventana de la ejecución entera repartiría el pulso de
  // toda la sesión sobre un tramo que quizá duró un minuto.
  const segments = await client<SegmentRow[]>`
    select id::text as id, started_at, ended_at, raw_lap_data_json
    from segment_executions
    where execution_id = ${args.execution_id}
      and started_at is not null and ended_at is not null
    order by started_at asc, id asc
  `;
  if (segments.length === 0) return summary;
  summary.segments = segments.length;

  const zones =
    args.zones !== undefined ? args.zones : await loadAthleteHrZones(Number(athleteId), client);

  const trace = await bestHrTrace(client, args.execution_id);
  const traceSamples = trace ? traceToSamples(trace) : [];

  const windowStart = Math.min(...segments.map((s) => epochSeconds(s.started_at)));
  const windowEnd = Math.max(...segments.map((s) => epochSeconds(s.ended_at)));
  const stream =
    traceSamples.length > 0
      ? { samples: [] as HrSampleAt[], provider: null }
      : await loadStreamSamples(client, Number(athleteId), windowStart, windowEnd);
  const fromTrace = traceSamples.length > 0;
  const pool = fromTrace ? traceSamples : stream.samples;

  // ATRIBUCIÓN EXCLUSIVA. Un segundo de la vida del atleta sólo se vive una vez,
  // así que una muestra pertenece a UN tramo. Hay 3 pares de tramos con ventanas
  // solapadas en producción (medido el 10-ago-2026): sin esto, sus minutos se
  // contarían dos veces en la suma semanal.
  //
  // Gana el tramo que EMPEZÓ MÁS TARDE, porque en ese instante es el que está
  // corriendo. Importa en la costura: el pulso justo en el segundo en el que
  // acaba un tramo y arranca el siguiente pertenece al que arranca, y si fuera al
  // revés el nuevo empezaría ciego durante una cadencia entera.
  const samplesBySegment = attributeSamples(pool, segments);
  const rows: ComputedRow[] = [];

  for (const seg of segments) {
    const segmentId = Number(seg.id);
    const start = epochSeconds(seg.started_at);
    const end = epochSeconds(seg.ended_at);
    const window_s = Math.max(0, Math.round(end - start));
    const frozen = parseZoneSeconds(seg.raw_lap_data_json);

    if (frozen) {
      const by_zone = frozenToByZone(frozen, zones != null);
      const measured = HR_ZONES.reduce((sum, z) => sum + by_zone[z], 0);
      rows.push({
        segment_execution_id: segmentId,
        by_zone,
        // El hueco es lo que le falta a la ventana para cubrir lo medido, y
        // nunca negativo: hay tramos con la ventana rota (`ended_at` igual a
        // `started_at`) y cientos de segundos de zonas medidos dentro.
        //
        // Sin ancla, esos segundos medidos no se pueden apilar —las bandas de la
        // gráfica SON el ancla— así que se conservan como tiempo sin zona, que es
        // lo único que se sigue sabiendo de ellos. No debería ocurrir: el móvil
        // pinta las zonas que le da el servidor, y sin ancla no le da ninguna.
        no_hr_s: zones ? Math.max(0, window_s - measured) : Math.max(window_s, measured),
        origin: 'frozen_segment',
        // El aparato que midió ese pulso ya está en el propio tramo
        // (`segment_executions.hr_source`). Copiarlo aquí sería abrir la puerta a
        // que los dos se contradigan.
        provider: null,
      });
      continue;
    }

    const mine = samplesBySegment.get(segmentId) ?? [];
    const origin: HrOrigin = mine.length === 0 ? 'none' : fromTrace ? 'trace' : 'samples';
    const computed = timeInZone({
      samples: mine,
      window_start_s: start,
      window_end_s: end,
      zones,
    });
    rows.push({
      segment_execution_id: segmentId,
      by_zone: computed.by_zone,
      no_hr_s: computed.no_hr_s,
      origin,
      provider: origin === 'trace' ? (trace?.source ?? null) : origin === 'samples' ? stream.provider : null,
    });
  }

  await writeRows(client, rows, zones);
  for (const r of rows) {
    summary.rows_written += 1;
    summary.by_origin[r.origin] += 1;
    if (HR_ZONES.some((z) => r.by_zone[z] > 0)) summary.rows_with_zones += 1;
  }
  return summary;
}

/**
 * Recalcula el histórico ENTERO de un atleta. Es un gesto explícito y nunca un
 * efecto de corregirle las anclas: una gráfica que cambia de forma sin que nadie
 * la toque deja de ser evidencia.
 */
export async function recomputeAthleteZoneSeconds(args: {
  athlete_id: number;
  client?: Sql;
}): Promise<ZoneComputeSummary[]> {
  const client = args.client ?? defaultSql;
  const zones = await loadAthleteHrZones(args.athlete_id, client);
  const executions = await client<Array<{ id: string }>>`
    select id::text as id from workout_executions where athlete_id = ${args.athlete_id} order by id asc
  `;
  const out: ZoneComputeSummary[] = [];
  for (const e of executions) {
    out.push(
      await computeExecutionZoneSeconds({ execution_id: Number(e.id), client, zones }),
    );
  }
  return out;
}

// ── Las fuentes ──────────────────────────────────────────────────────────────

/**
 * La mejor serie de FC de una ejecución. Un mismo entreno puede traer la de la
 * correa y la del reloj: se elige por fidelidad del sensor
 * (`hrTraceFidelity`) para no apilar el mismo minuto dos veces. Los empates los
 * rompe la fila más reciente, así que un re-sync gana a lo que había.
 *
 * Exportada: `measured-header.ts` (deriva aeróbica / recuperación de pulso)
 * necesita EXACTAMENTE esta misma selección — reusarla evita una segunda copia
 * que se prometa "igual" y acabe divergiendo (la lección de `segment-modality.ts`).
 */
export async function bestHrTrace(client: Sql, execution_id: number): Promise<TraceRow | null> {
  const rows = await client<TraceRow[]>`
    select source, started_at, offsets_s, values
    from workout_traces
    where execution_id = ${execution_id} and signal = 'hr'
    order by id desc
  `;
  let best: TraceRow | null = null;
  let bestRank = 0; // 0 = no puede aportar pulso: una traza así nunca gana
  for (const row of rows) {
    const rank = hrTraceFidelity(row.source);
    if (rank > bestRank) {
      best = row;
      bestRank = rank;
    }
  }
  return best;
}

/** Los dos arrays paralelos de una traza, en segundos absolutos. */
function traceToSamples(trace: TraceRow): HrSampleAt[] {
  const base = epochSeconds(trace.started_at);
  const out: HrSampleAt[] = [];
  const n = Math.min(trace.offsets_s.length, trace.values.length);
  for (let i = 0; i < n; i++) {
    const offset = trace.offsets_s[i];
    const bpm = trace.values[i];
    if (offset == null || bpm == null) continue;
    out.push({ at_s: base + offset, bpm });
  }
  return out;
}

/**
 * Las muestras de pulso del atleta dentro de la ventana de la sesión.
 *
 * `distinct on (recorded_at)` porque la tabla no tiene unique y un re-sync de
 * Apple Health reinserta lo mismo: 106.880 filas para 46.366 instantes reales.
 * La integración por intervalo ya es inmune al duplicado (dos lecturas del mismo
 * instante aportan cero segundos), pero traer un tercio de las filas es gratis.
 */
async function loadStreamSamples(
  client: Sql,
  athlete_id: number,
  from_s: number,
  to_s: number,
): Promise<{ samples: HrSampleAt[]; provider: BiometricSource | null }> {
  const rows = await client<Array<{ at: Date; bpm: number; source: BiometricSource }>>`
    select distinct on (recorded_at) recorded_at as at, value_numeric::float8 as bpm, source
    from biometric_streams
    where athlete_id = ${athlete_id}
      and metric_type = 'hr'
      and recorded_at >= to_timestamp(${from_s})
      and recorded_at <= to_timestamp(${to_s})
      and value_numeric is not null
    order by recorded_at asc, id asc
  `;
  // Quién midió, sólo si hay UNA respuesta. Con varias fuentes en la misma
  // ventana no hay un dueño y se dice null, en vez de coronar a la primera.
  const sources = new Set(rows.map((r) => r.source));
  return {
    samples: rows.map((r) => ({ at_s: epochSeconds(r.at), bpm: r.bpm })),
    provider: sources.size === 1 ? [...sources][0]! : null,
  };
}

// ── La escritura ─────────────────────────────────────────────────────────────

async function writeRows(
  client: Sql,
  rows: readonly ComputedRow[],
  zones: AthleteHrZones | null,
): Promise<void> {
  // Sin ancla no se estampa ninguna: la tabla lo exige, y por eso las cinco
  // bandas vienen ya a cero desde `timeInZone`.
  const anchor = zones?.source ?? null;
  const lthr = zones?.lthr_bpm ?? null;
  for (const r of rows) {
    await client`
      insert into segment_zone_seconds (
        segment_execution_id, z1_s, z2_s, z3_s, z4_s, z5_s, no_hr_s,
        hr_origin, hr_provider, computed_with_anchor, computed_with_lthr_bpm, computed_at
      ) values (
        ${r.segment_execution_id},
        ${r.by_zone[1]}, ${r.by_zone[2]}, ${r.by_zone[3]}, ${r.by_zone[4]}, ${r.by_zone[5]},
        ${r.no_hr_s},
        ${r.origin},
        ${r.provider},
        ${anchor},
        ${lthr},
        now()
      )
      on conflict (segment_execution_id) do update set
        z1_s = excluded.z1_s,
        z2_s = excluded.z2_s,
        z3_s = excluded.z3_s,
        z4_s = excluded.z4_s,
        z5_s = excluded.z5_s,
        no_hr_s = excluded.no_hr_s,
        hr_origin = excluded.hr_origin,
        hr_provider = excluded.hr_provider,
        computed_with_anchor = excluded.computed_with_anchor,
        computed_with_lthr_bpm = excluded.computed_with_lthr_bpm,
        computed_at = now()
    `;
  }
}

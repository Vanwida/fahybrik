// Escribir en `segment_executions` las vueltas que manda un aparato SIN destruir
// lo que la app midió. Es el lado de base de datos de `planSegmentFusion`
// (@fahybrid/shared/domain/execution-merge/segment-fusion), que es quien decide.
//
// Lo que sustituye: la ingesta de Garmin hacía
//     delete from segment_executions where execution_id = …
// y reescribía sus vueltas planas encima. Con la fila padre se iban los
// `zone_seconds` congelados por el móvil dentro de `raw_lap_data_json`, las filas
// de `segment_zone_seconds` y las de `set_executions` (las dos cuelgan con
// `on delete cascade`), la atribución de la serie y el enlace a la prescripción.
//
// Aquí no se borra nada. Dos caminos, y el modelo elige cuál:
//   · el aparato manda en el troceado (la app no midió ningún tramo) → sus
//     vueltas se UPSERTAN por (execution_id, position, round_index) — conservan su
//     `id` entre reenvíos, así que lo que cuelgue de ellas sobrevive — y se podan
//     las filas SUYAS que sobren de un envío anterior más largo;
//   · manda la app → las vueltas solo rellenan huecos de los tramos con los que
//     casan por tiempo, y la vuelta entera se guarda verbatim bajo su propia clave
//     dentro de `raw_lap_data_json`, sin tocar `zone_seconds` ni el detalle de ergo.

import type { Sql, TransactionClient } from '@/lib/db';
import { toJsonValue } from '@/lib/json-column';
import {
  planSegmentFusion,
  type DeviceLap,
  type SegmentMeasuredField,
  type StoredSegment,
} from '@fahybrid/shared/domain/execution-merge';

/** Una vuelta lista para la base: lo que el modelo mira + lo que solo se escribe. */
export type DeviceLapRow = DeviceLap & {
  /** El payload tal cual lo mandó el aparato, para dejar la evidencia entera. */
  raw: unknown;
};

export type FuseDeviceLapsResult = {
  /** Filas nuevas o reescritas como tramos del aparato. */
  written: number;
  /** Tramos de la app enriquecidos con lo que les faltaba. */
  merged: number;
  /** Vueltas descartadas por no poder distinguirlas de trabajo ya contado. */
  dropped: number;
  /** Filas del aparato podadas por sobrar de un envío anterior. */
  pruned: number;
};

/**
 * Fusiona las vueltas de `deviceSource` en los tramos de una ejecución.
 * Idempotente: el mismo envío dos veces deja exactamente el mismo estado.
 */
export async function fuseDeviceLaps(args: {
  sql: Sql | TransactionClient;
  executionId: string | number;
  deviceSource: string;
  /** La ejecución es esta misma actividad del aparato (ver `planSegmentFusion`). */
  deviceOwnsExecution: boolean;
  laps: readonly DeviceLapRow[];
}): Promise<FuseDeviceLapsResult> {
  const { sql, executionId, deviceSource, deviceOwnsExecution, laps } = args;
  const result: FuseDeviceLapsResult = { written: 0, merged: 0, dropped: 0, pruned: 0 };
  if (laps.length === 0) return result;

  // `timestamptz` vuelve como Date y `numeric` como texto (postgres.js): se
  // normalizan aquí a ISO y a número para que el modelo puro reciba un solo
  // vocabulario y no tenga que saber de driver ninguno.
  const rows = await sql<
    Array<{
      id: string;
      source: string | null;
      started_at: Date | null;
      ended_at: Date | null;
      distance_meters: string | null;
      calories: string | null;
      avg_hr: number | null;
      max_hr: number | null;
      avg_pace_s_per_km: string | null;
      avg_pace_s_per_500m: string | null;
      avg_power_w: string | null;
      stroke_rate_spm: string | null;
      run_cadence_spm: number | null;
      modality: string | null;
    }>
  >`
    select id::text, source,
           started_at, ended_at,
           distance_meters, calories,
           avg_hr, max_hr,
           avg_pace_s_per_km, avg_pace_s_per_500m,
           avg_power_w, stroke_rate_spm,
           run_cadence_spm, modality
    from segment_executions
    where execution_id = ${String(executionId)}::bigint
    order by position, round_index
  `;

  const existing: StoredSegment[] = rows.map((r) => ({
    id: Number(r.id),
    source: r.source,
    started_at: iso(r.started_at),
    ended_at: iso(r.ended_at),
    measured: {
      distance_meters: num(r.distance_meters),
      calories: num(r.calories),
      avg_hr: r.avg_hr,
      max_hr: r.max_hr,
      avg_pace_s_per_km: num(r.avg_pace_s_per_km),
      avg_pace_s_per_500m: num(r.avg_pace_s_per_500m),
      avg_power_w: num(r.avg_power_w),
      stroke_rate_spm: num(r.stroke_rate_spm),
      run_cadence_spm: r.run_cadence_spm,
      modality: r.modality,
    },
  }));

  const plan = planSegmentFusion({ existing, laps, deviceSource, deviceOwnsExecution });
  result.dropped = plan.droppedLapIndexes.length;
  const lapByIndex = new Map(laps.map((l) => [l.index, l]));

  if (plan.deviceOwnsSlicing) {
    for (const index of plan.newLapIndexes) {
      const lap = lapByIndex.get(index)!;
      await upsertDeviceLap({ sql, executionId, deviceSource, lap });
      result.written += 1;
    }
    // Poda: si un envío anterior traía MÁS vueltas, las filas sobrantes son de
    // este mismo aparato y ya no describen nada. Acotado a `source` para no rozar
    // jamás una fila de la app (que aquí, por definición, no existe — el guard es
    // frente a una carrera con una sincronización del móvil a media escritura).
    const pruned = await sql<Array<{ id: string }>>`
      delete from segment_executions
      where execution_id = ${String(executionId)}::bigint
        and source = ${deviceSource}
        and position >= ${plan.newLapIndexes.length}
      returning id::text
    `;
    result.pruned = pruned.length;
    return result;
  }

  for (const merge of plan.merges) {
    const lap = lapByIndex.get(merge.lapIndex)!;
    const changed = await mergeIntoAppSegment({
      sql,
      segmentId: merge.segmentId,
      deviceSource,
      patch: merge.patch,
      raw: lap.raw,
    });
    if (changed) result.merged += 1;
  }
  return result;
}

/**
 * Rellena en un tramo de la app los campos MEDIDA que estaban vacíos y guarda la
 * vuelta verbatim bajo `<fuente>_lap` dentro de `raw_lap_data_json`.
 *
 * `raw_lap_data_json` se FUNDE a nivel de objeto (`||`), nunca se reemplaza: ahí
 * viven los `zone_seconds` congelados por el móvil y el detalle del PM5.
 *
 * El `where` final es lo que hace idempotente el reenvío: con los huecos ya
 * rellenos el patch sale vacío y la clave del aparato ya está guardada, así que
 * la sentencia no toca ninguna fila (ni siquiera `updated_at`).
 */
async function mergeIntoAppSegment(args: {
  sql: Sql | TransactionClient;
  segmentId: number;
  deviceSource: string;
  patch: Partial<Record<SegmentMeasuredField, number | string>>;
  raw: unknown;
}): Promise<boolean> {
  const { sql, segmentId, deviceSource, patch, raw } = args;
  const lapKey = `${deviceSource}_lap`;
  const lapJson = sql.json(toJsonValue(raw) as Parameters<typeof sql.json>[0]);

  const n = (f: SegmentMeasuredField) => (patch[f] as number | undefined) ?? null;

  const updated = await sql<Array<{ id: string }>>`
    update segment_executions set
      distance_meters     = coalesce(distance_meters, ${n('distance_meters')}),
      calories            = coalesce(calories, ${n('calories')}),
      avg_hr              = coalesce(avg_hr, ${n('avg_hr')}),
      max_hr              = coalesce(max_hr, ${n('max_hr')}),
      avg_pace_s_per_km   = coalesce(avg_pace_s_per_km, ${n('avg_pace_s_per_km')}),
      avg_pace_s_per_500m = coalesce(avg_pace_s_per_500m, ${n('avg_pace_s_per_500m')}),
      avg_power_w         = coalesce(avg_power_w, ${n('avg_power_w')}),
      stroke_rate_spm     = coalesce(stroke_rate_spm, ${n('stroke_rate_spm')}),
      run_cadence_spm     = coalesce(run_cadence_spm, ${n('run_cadence_spm')}),
      modality            = coalesce(modality, ${(patch.modality as string | undefined) ?? null}),
      raw_lap_data_json   = coalesce(raw_lap_data_json, '{}'::jsonb)
                            || jsonb_build_object(${lapKey}::text, ${lapJson}::jsonb),
      updated_at          = now()
    where id = ${segmentId}::bigint
      and (
        ${Object.keys(patch).length > 0}::boolean
        or coalesce(raw_lap_data_json, '{}'::jsonb) -> ${lapKey}::text
             is distinct from ${lapJson}::jsonb
      )
    returning id::text
  `;
  return updated.length > 0;
}

/**
 * Escribe una vuelta como tramo propio del aparato. UPSERT por la clave viva
 * (execution_id, position, round_index) para que la fila conserve su `id` entre
 * reenvíos — si se borrara y reinsertara, `segment_zone_seconds` y
 * `set_executions` se irían con ella por el `on delete cascade`.
 *
 * El `where` del DO UPDATE es un cinturón: aunque el móvil sincronizara sus
 * tramos entre la lectura y esta escritura, una fila de la app nunca se
 * sobrescribe con una vuelta de reloj.
 */
async function upsertDeviceLap(args: {
  sql: Sql | TransactionClient;
  executionId: string | number;
  deviceSource: string;
  lap: DeviceLapRow;
}): Promise<void> {
  const { sql, executionId, deviceSource, lap } = args;
  const m = lap.measured;
  await sql`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, calories, avg_hr, max_hr,
      modality, avg_pace_s_per_km, avg_pace_s_per_500m,
      avg_power_w, stroke_rate_spm, run_cadence_spm, source,
      raw_lap_data_json
    ) values (
      ${String(executionId)}::bigint,
      ${lap.index},
      ${lap.started_at}::timestamptz,
      ${lap.ended_at}::timestamptz,
      ${(m.distance_meters as number | null) ?? null},
      ${(m.calories as number | null) ?? null},
      ${(m.avg_hr as number | null) ?? null},
      ${(m.max_hr as number | null) ?? null},
      ${(m.modality as string | null) ?? null},
      ${(m.avg_pace_s_per_km as number | null) ?? null},
      ${(m.avg_pace_s_per_500m as number | null) ?? null},
      ${(m.avg_power_w as number | null) ?? null},
      ${(m.stroke_rate_spm as number | null) ?? null},
      ${(m.run_cadence_spm as number | null) ?? null},
      ${deviceSource},
      ${sql.json(toJsonValue(lap.raw) as Parameters<typeof sql.json>[0])}
    )
    on conflict (execution_id, position, round_index) do update set
      started_at          = excluded.started_at,
      ended_at            = excluded.ended_at,
      distance_meters     = excluded.distance_meters,
      calories            = excluded.calories,
      avg_hr              = excluded.avg_hr,
      max_hr              = excluded.max_hr,
      modality            = excluded.modality,
      avg_pace_s_per_km   = excluded.avg_pace_s_per_km,
      avg_pace_s_per_500m = excluded.avg_pace_s_per_500m,
      avg_power_w         = excluded.avg_power_w,
      stroke_rate_spm     = excluded.stroke_rate_spm,
      run_cadence_spm     = excluded.run_cadence_spm,
      -- En SU propia fila la vuelta es el dato crudo de la fila y va al nivel de
      -- arriba (contrato de siempre para los tramos de aparato). En un tramo de la
      -- app va de invitada, bajo la clave de su fuente, para no pisar los
      -- zone_seconds -- ver mergeIntoAppSegment. Fundido de objeto, nunca
      -- reemplazo: si otro camino dejo algo aqui, se conserva.
      raw_lap_data_json   = coalesce(segment_executions.raw_lap_data_json, '{}'::jsonb)
                            || excluded.raw_lap_data_json,
      updated_at          = now()
    where segment_executions.source = ${deviceSource}
  `;
}

/** `numeric` vuelve de postgres.js como texto: a número, o null si no se sabe. */
function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `timestamptz` vuelve como Date: a ISO, que es el vocabulario del modelo. */
function iso(v: Date | null): string | null {
  return v ? v.toISOString() : null;
}

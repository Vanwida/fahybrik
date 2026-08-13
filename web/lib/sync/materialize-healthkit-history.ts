// El histórico que YA está en biometric_streams (training_load) no vuelve a
// pasar por el ingest: ese camino lo marca duplicado y se iba. Esto recorre
// esos marcadores y nace la sesión importada que las comparativas saben leer.

import type { Sql } from '@/lib/db';
import { materializeHealthkitWorkout } from './materialize-healthkit-workout';
import type { HKWorkoutDTO } from './schema';

export interface HistoryMaterializeResult {
  seen: number;
  inserted: number;
  exists: number;
  skipped: number;
}

type StreamRow = {
  athlete_id: string;
  source_workout_id: string | null;
  recorded_at: string;
  value_numeric: string | number | null;
  payload: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asIso(v: unknown, fallback: string): string {
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  return fallback;
}

function workoutFromStream(row: StreamRow): HKWorkoutDTO | null {
  const id = row.source_workout_id?.trim();
  if (!id) return null;
  const p = asRecord(row.payload) ?? {};
  const started = asIso(p.started_at, row.recorded_at);
  const duration = asNumber(p.duration_seconds) ?? asNumber(row.value_numeric) ?? 0;
  const endedFromPayload = typeof p.ended_at === 'string' ? p.ended_at : null;
  const ended =
    endedFromPayload && !Number.isNaN(Date.parse(endedFromPayload))
      ? endedFromPayload
      : new Date(new Date(started).getTime() + Math.max(0, duration) * 1000).toISOString();
  return {
    source_workout_id: id,
    workout_activity_type: asNumber(p.workout_activity_type) ?? 3000,
    started_at: started,
    ended_at: ended,
    duration_seconds: duration,
    total_energy_burned_kcal: asNumber(p.total_energy_burned_kcal),
    total_distance_meters: asNumber(p.total_distance_meters),
    avg_heart_rate_bpm: asNumber(p.avg_heart_rate_bpm),
    max_heart_rate_bpm: asNumber(p.max_heart_rate_bpm),
    lap_markers: [],
    source: 'healthkit',
  };
}

export async function materializeHealthkitHistory(args: {
  sql: Sql;
  athlete_id?: number;
}): Promise<HistoryMaterializeResult> {
  const { sql } = args;
  const rows = args.athlete_id
    ? await sql<StreamRow[]>`
        select athlete_id::text, source_workout_id, recorded_at::text,
               value_numeric, raw_payload_json as payload
        from biometric_streams
        where source = 'healthkit'
          and metric_type = 'training_load'
          and athlete_id = ${args.athlete_id}
        order by recorded_at asc
      `
    : await sql<StreamRow[]>`
        select athlete_id::text, source_workout_id, recorded_at::text,
               value_numeric, raw_payload_json as payload
        from biometric_streams
        where source = 'healthkit'
          and metric_type = 'training_load'
        order by athlete_id asc, recorded_at asc
      `;

  const out: HistoryMaterializeResult = { seen: 0, inserted: 0, exists: 0, skipped: 0 };

  for (const row of rows) {
    const workout = workoutFromStream(row);
    if (!workout) {
      out.skipped += 1;
      continue;
    }
    const athlete = Number(row.athlete_id);
    if (!Number.isFinite(athlete)) {
      out.skipped += 1;
      continue;
    }
    out.seen += 1;
    const result = await materializeHealthkitWorkout({
      sql,
      athlete_id: BigInt(athlete),
      workout,
      computeZones: false,
    });
    if (result.outcome === 'inserted') out.inserted += 1;
    else if (result.outcome === 'exists') out.exists += 1;
    else out.skipped += 1;
  }
  return out;
}

// ANALYTICS · DRILL-DOWN · HYROX — `hyrox.race` opens the 16 race segments
// (8 runs + 8 stations) in race order; `hyrox.scores` opens the scored sim /
// metcon training sessions behind the history card.

import 'server-only';

import type { Sql } from '@/lib/db';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { HYROX_STATION_LABELS } from '@fahybrid/shared/schema';
import {
  buildRaceTransfer,
  transferDeltaPctStr,
  transferTierLabel,
  transferValueStr,
} from '../../race-transfer';
import {
  type DrillDownResult,
  type ResolvedPeriod,
  type SourceSession,
  clockStr,
  dayMonthEs,
  numOrNull,
} from '../core';
import { scoreValue, SCORE_FORMAT_ES } from '../hyrox';

// ── HYROX race — the 16 segments (8 runs + 8 stations) one by one ────────────
export async function hyroxRaceDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult | null> {
  const raceId = params.race_id;
  if (!raceId) return null;
  const rows = await client<Array<{
    name: string;
    race_date: string | null;
    run_splits: number[] | null;
    station_splits: Array<{ index: number; seconds: number | null; rank: number | null }> | null;
    roxzone: number | null;
    run_total: number | null;
    result: number | null;
  }>>`
    select name, to_char(race_date, 'YYYY-MM-DD') as race_date,
      run_splits_json as run_splits, station_splits_json as station_splits,
      roxzone_seconds as roxzone, run_total_seconds as run_total, result_time_seconds as result
    from races
    where id = ${Number(raceId)} and athlete_id = ${athleteId}
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;

  const runs = Array.isArray(r.run_splits) ? r.run_splits : [];
  const stations = Array.isArray(r.station_splits) ? r.station_splits : [];
  const sessions: SourceSession[] = [];

  // Interleave the canonical HYROX order: Run 1, Station 1 (idx 2), Run 2, … so
  // the list reads as the race unfolded.
  const stationByIndex = new Map(stations.map((s) => [s.index, s]));
  const STATION_INDICES = [2, 4, 6, 8, 10, 12, 14, 16];
  for (let i = 0; i < 8; i++) {
    const runSecs = numOrNull(runs[i]);
    sessions.push({
      id: `run-${i + 1}`,
      date: r.race_date,
      title_es: `Run ${i + 1}`,
      detail_es: '1 km',
      value: runSecs != null ? clockStr(runSecs) : null,
      value_label: null,
    });
    const stIdx = STATION_INDICES[i]!;
    const st = stationByIndex.get(stIdx);
    const stSecs = numOrNull(st?.seconds);
    sessions.push({
      id: `station-${stIdx}`,
      date: r.race_date,
      title_es: HYROX_STATION_LABELS[stIdx] ?? `Estación ${stIdx}`,
      detail_es: st?.rank != null ? `puesto #${st.rank}` : null,
      value: stSecs != null ? clockStr(stSecs) : null,
      value_label: null,
    });
  }

  return {
    kind: 'hyrox.race',
    title_es: r.name,
    subtitle_es: [dayMonthEs(r.race_date), '16 segmentos'].filter(Boolean).join(' · '),
    summary: [
      { id: 'finish', value: clockStr(r.result) ?? '—', label: 'finish', accent: true },
      { id: 'runs', value: clockStr(r.run_total) ?? '—', label: '8 runs', accent: false },
      { id: 'roxzone', value: clockStr(r.roxzone) ?? '—', label: 'roxzone', accent: false },
    ],
    sessions,
    source_table: 'races',
    period,
  };
}

// ── HYROX transfer — the training × race cross, station by station ───────────
export async function hyroxTransferDrill(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const transfer = await buildRaceTransfer({ athlete_id: athleteId }, client);
  const sessions: SourceSession[] = transfer.stations.map((s) => {
    const unit = s.unit; // canonical station unit (== trained.unit when present)
    const trainedStr = s.trained.value_s != null ? transferValueStr(s.trained.value_s, unit) : null;
    const raceStr = s.race_seconds != null ? transferValueStr(s.race_seconds, unit) : null;
    // Detail: the evidence tier + (for observado) the fresh/fatigued split.
    const bits = [transferTierLabel(s.trained.tier)];
    if (s.trained.contexto) {
      const fresco = s.trained.contexto.fresco_s != null ? transferValueStr(s.trained.contexto.fresco_s, unit) : null;
      const fatigado = s.trained.contexto.fatigado_s != null ? transferValueStr(s.trained.contexto.fatigado_s, unit) : null;
      if (fresco) bits.push(`fresco ${fresco}`);
      if (fatigado) bits.push(`fatigado ${fatigado}`);
    }
    if (raceStr) bits.push(`carrera ${raceStr}`);
    return {
      id: s.slug,
      date: s.race_date,
      title_es: s.label,
      detail_es: bits.join(' · '),
      value: transferDeltaPctStr(s.transfer_delta_pct) ?? trainedStr,
      value_label: null,
    };
  });

  const withDelta = transfer.stations.filter((s) => s.transfer_delta_pct != null).length;
  return {
    kind: 'hyrox.transfer',
    title_es: 'Entreno → carrera',
    subtitle_es: [dayMonthEs(transfer.race_date), transfer.race_name].filter(Boolean).join(' · ') || null,
    summary: [
      { id: 'crosses', value: String(withDelta), label: 'cruces', accent: false },
      {
        id: 'stations',
        value: String(transfer.stations.length),
        label: 'estaciones + carrera',
        accent: false,
      },
    ],
    sessions,
    source_table: 'segment_executions · races',
    period,
  };
}

// ── HYROX scores — the scored sim / metcon sessions behind the history ───────
export async function hyroxScoresDrill(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const rows = await client<Array<{
    execution_id: string;
    day: string | null;
    score_time_s: number | null;
    score_rounds: number | null;
    score_reps: number | null;
    template_name: string;
    format: string;
  }>>`
    select
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      we.score_time_s, we.score_rounds, we.score_reps,
      t.name as template_name, t.format::text as format
    from workout_executions we
    join workout_assignments wa on wa.id = we.assignment_id
    join templates t on t.id = wa.template_id
    where we.athlete_id = ${athleteId}
      and (we.score_time_s is not null or we.score_rounds is not null)
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by we.started_at desc, we.id desc
  `;
  const sessions: SourceSession[] = rows.map((r) => {
    const fmt = normalizeFormat(r.format);
    return {
      id: r.execution_id,
      date: r.day,
      title_es: r.template_name,
      detail_es: fmt ? SCORE_FORMAT_ES[fmt] ?? fmt : null,
      value: scoreValue(r),
      value_label: null,
    };
  });
  const bestSim = rows
    .filter((r) => normalizeFormat(r.format) === 'hyrox_sim' && r.score_time_s != null)
    .reduce<number | null>((m, r) => (m == null || (r.score_time_s as number) < m ? r.score_time_s : m), null);
  return {
    kind: 'hyrox.scores',
    title_es: 'Simulaciones y metcons',
    subtitle_es: `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}`,
    summary: [
      { id: 'count', value: String(sessions.length), label: 'puntuadas', accent: false },
      { id: 'best_sim', value: bestSim != null ? (clockStr(bestSim) ?? '—') : '—', label: 'mejor sim', accent: true },
    ],
    sessions,
    source_table: 'workout_executions',
    period,
  };
}

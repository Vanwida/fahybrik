// ANALYTICS · DRILL-DOWN — the other half of the design's core pattern: every
// aggregate opens its REAL source sessions ("ningún número sin su lista"). Given
// a (kind, params, period) — exactly what the section's DrillRef carried — this
// re-runs the SAME window and returns the rows that produced the number. No
// fabrication: each row is a real segment_executions / races / benchmark /
// athlete_strength_maxes / biometric_streams row.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { HYROX_STATION_LABELS } from '@fahybrid/shared/schema';
import {
  type DrillDownResult,
  type ResolvedPeriod,
  type SourceSession,
  clockStr,
  dayMonthEs,
  kmStr,
  num,
  numOrNull,
  paceStr,
} from './core';
import { classifyZone, type ZoneBand } from './running';

const RECOVERY_MAX_ROWS = 90;

export async function buildDrillDown(
  args: { athlete_id: number | bigint; kind: string; params: Record<string, string>; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<DrillDownResult | null> {
  const athleteId = Number(args.athlete_id);
  const { kind, params, period } = args;

  switch (kind) {
    case 'running.volume':
    case 'running.type':
    case 'running.zone':
      return runningDrill(client, athleteId, kind, params, period);
    case 'running.best_effort':
      return bestEffortDrill(client, athleteId, params, period);
    case 'ergo.split':
      return ergoDrill(client, athleteId, params, period);
    case 'strength.lift':
      return strengthDrill(client, athleteId, params, period);
    case 'hyrox.race':
      return hyroxRaceDrill(client, athleteId, params, period);
    case 'recovery.metric':
      return recoveryDrill(client, athleteId, params, period);
    default:
      return null;
  }
}

// ── Running (volume / type / zone) — one execution = one session ─────────────
interface RunExecAgg {
  execution_id: string;
  day: string;
  meters: number;
  paceWeighted: number;
  hrSum: number;
  hrCount: number;
  scheme: string | null;
}

async function loadRunExecutions(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<RunExecAgg[]> {
  const rows = await client<Array<{
    execution_id: string;
    day: string;
    distance_meters: string | null;
    pace_s_per_km: string | null;
    avg_hr: number | null;
    scheme: string | null;
  }>>`
    select
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.distance_meters::text as distance_meters,
      coalesce(
        se.avg_pace_s_per_km::float,
        case when se.distance_meters > 0 and se.started_at is not null and se.ended_at is not null
          then extract(epoch from (se.ended_at - se.started_at))::float / (se.distance_meters::float / 1000.0)
          else null end
      )::text as pace_s_per_km,
      se.avg_hr,
      ts.prescription_json->>'scheme' as scheme
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(se.modality, case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end) = 'run'
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by we.started_at desc, se.position asc
  `;

  const byExec = new Map<string, RunExecAgg>();
  for (const r of rows) {
    const dist = numOrNull(r.distance_meters) ?? 0;
    const pace = numOrNull(r.pace_s_per_km);
    if (dist <= 0) continue;
    const e = byExec.get(r.execution_id) ?? {
      execution_id: r.execution_id,
      day: r.day,
      meters: 0,
      paceWeighted: 0,
      hrSum: 0,
      hrCount: 0,
      scheme: normalizeFormat(r.scheme ?? undefined) ?? null,
    };
    e.meters += dist;
    if (pace != null) e.paceWeighted += pace * dist;
    if (r.avg_hr != null) {
      e.hrSum += r.avg_hr;
      e.hrCount += 1;
    }
    if (!e.scheme) e.scheme = normalizeFormat(r.scheme ?? undefined) ?? null;
    byExec.set(r.execution_id, e);
  }
  return [...byExec.values()];
}

async function runningDrill(
  client: Sql,
  athleteId: number,
  kind: string,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  let execs = await loadRunExecutions(client, athleteId, period);
  let title = 'Carrera · sesiones';
  const subtitle: string | null = `${period.label_es}`;

  if (kind === 'running.type' && params.type) {
    execs = execs.filter((e) => e.scheme === params.type);
    title = 'Carrera por tipo';
  }
  if (kind === 'running.zone' && params.zone) {
    const bands = await loadRunBands(client, athleteId);
    execs = execs.filter((e) => {
      const pace = e.meters > 0 ? e.paceWeighted / e.meters : null;
      if (pace == null) return false;
      return classifyZone(pace, bands)?.code === params.zone;
    });
    title = `Carrera · ${params.zone}`;
  }

  const sessions: SourceSession[] = execs
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((e) => {
      const pace = e.meters > 0 ? e.paceWeighted / e.meters : null;
      const hr = e.hrCount > 0 ? Math.round(e.hrSum / e.hrCount) : null;
      return {
        id: e.execution_id,
        date: e.day,
        title_es: e.scheme ? schemeTitle(e.scheme) : 'Carrera',
        detail_es: [kmStr(e.meters), hr != null ? `FC ${hr}` : null].filter(Boolean).join(' · ') || null,
        value: pace != null ? `${paceStr(pace)} /km` : null,
        value_label: null,
      };
    });

  const totalMeters = execs.reduce((a, e) => a + e.meters, 0);
  const allPace = execs.reduce((a, e) => a + e.paceWeighted, 0);
  const avgPace = totalMeters > 0 ? allPace / totalMeters : null;
  return {
    kind,
    title_es: title,
    subtitle_es: subtitle,
    summary: [
      { id: 'count', value: String(sessions.length), label: 'sesiones', accent: false },
      { id: 'km', value: kmStr(totalMeters) ?? '0', label: 'km total', accent: false },
      { id: 'avg', value: avgPace != null ? `${paceStr(avgPace)}` : '—', label: 'medio /km', accent: true },
    ],
    sessions,
    source_table: 'segment_executions',
    period,
  };
}

async function loadRunBands(client: Sql, athleteId: number): Promise<ZoneBand[]> {
  const rows = await client<Array<{ zones_json: ZoneBand[] }>>`
    select zones_json from athlete_zone_profiles
    where athlete_id = ${athleteId} and modality = 'run'
    order by version desc limit 1
  `;
  return Array.isArray(rows[0]?.zones_json) ? rows[0]!.zones_json : [];
}

function schemeTitle(scheme: string): string {
  const map: Record<string, string> = {
    intervals: 'Series · intervalos',
    steady: 'Continuo · tempo',
    hyrox_sim: 'Simulación HYROX',
    sets: 'Fuerza',
  };
  return map[scheme] ?? scheme;
}

// ── Best effort (1k/3k = qualifying segments; 5k = run_5k test history) ───────
async function bestEffortDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const distance = Number(params.distance ?? '1000');

  if (distance === 5000) {
    const rows = await client<Array<{ id: string; value: string; recorded_on: string }>>`
      select id::text as id, value::text as value, to_char(recorded_at, 'YYYY-MM-DD') as recorded_on
      from athlete_benchmarks
      where athlete_id = ${athleteId} and exercise_slug = 'run_5k' and unit = 'seconds'
      order by recorded_at desc
    `;
    const sessions: SourceSession[] = rows.map((r, i) => ({
      id: r.id,
      date: r.recorded_on,
      title_es: 'Test 5k',
      detail_es: '5,0 km',
      value: paceStr(num(r.value)),
      value_label: i === rows.length - 1 ? 'primero' : null,
    }));
    const best = rows.length ? Math.min(...rows.map((r) => num(r.value))) : null;
    return {
      kind: 'running.best_effort',
      title_es: 'Mejor 5 km · tests',
      subtitle_es: `${rows.length} tests`,
      summary: [
        { id: 'best', value: best != null ? (paceStr(best) ?? '—') : '—', label: 'mejor', accent: true },
        { id: 'count', value: String(rows.length), label: 'tests', accent: false },
      ],
      sessions,
      source_table: 'athlete_benchmarks',
      period,
    };
  }

  // 1k / 3k: the qualifying segments (1k) or executions (3k), sorted fastest first.
  const lo = distance === 3000 ? 2700 : 800;
  const hi = distance === 3000 ? 3300 : 1200;
  if (distance === 3000) {
    const rows = await client<Array<{ execution_id: string; day: string; dist: string; dur: string }>>`
      select we.id::text as execution_id,
        to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
        sum(se.distance_meters)::text as dist,
        sum(extract(epoch from (se.ended_at - se.started_at)))::text as dur
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athleteId}
        and coalesce(se.modality, case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end) = 'run'
      group by we.id, day
      having sum(se.distance_meters) between ${lo} and ${hi} and sum(extract(epoch from (se.ended_at - se.started_at))) > 0
      order by sum(extract(epoch from (se.ended_at - se.started_at))) asc
    `;
    const sessions: SourceSession[] = rows.map((r, i) => ({
      id: r.execution_id,
      date: r.day,
      title_es: 'Carrera ~3 km',
      detail_es: kmStr(num(r.dist)),
      value: clockStr(num(r.dur)),
      value_label: i === 0 ? 'mejor' : null,
    }));
    return finishEffort('Mejor 3 km', rows.length, sessions, period, 'segment_executions');
  }

  // 1k
  const rows = await client<Array<{ execution_id: string; day: string; pace: string; dist: string }>>`
    select we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      coalesce(se.avg_pace_s_per_km::float, extract(epoch from (se.ended_at - se.started_at))::float / (se.distance_meters::float/1000.0))::text as pace,
      se.distance_meters::text as dist
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(se.modality, case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end) = 'run'
      and se.distance_meters between ${lo} and ${hi}
      and coalesce(se.avg_pace_s_per_km, extract(epoch from (se.ended_at - se.started_at)) / nullif(se.distance_meters/1000.0,0)) is not null
    order by coalesce(se.avg_pace_s_per_km::float, extract(epoch from (se.ended_at - se.started_at))::float / (se.distance_meters::float/1000.0)) asc
  `;
  const sessions: SourceSession[] = rows.map((r, i) => ({
    id: r.execution_id,
    date: r.day,
    title_es: 'Mejor km',
    detail_es: kmStr(num(r.dist)),
    value: `${paceStr(num(r.pace))} /km`,
    value_label: i === 0 ? 'mejor' : null,
  }));
  return finishEffort('Mejor 1 km', rows.length, sessions, period, 'segment_executions');
}

function finishEffort(title: string, count: number, sessions: SourceSession[], period: ResolvedPeriod, table: string): DrillDownResult {
  return {
    kind: 'running.best_effort',
    title_es: title,
    subtitle_es: `${count} esfuerzos`,
    summary: [
      { id: 'best', value: sessions[0]?.value ?? '—', label: 'mejor', accent: true },
      { id: 'count', value: String(count), label: 'esfuerzos', accent: false },
    ],
    sessions,
    source_table: table,
    period,
  };
}

// ── Ergo split ───────────────────────────────────────────────────────────────
async function ergoDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const modality = params.modality ?? 'row';
  const rows = await client<Array<{ day: string; pace: string | null; power: string | null; spm: string | null; dist: string | null; id: string }>>`
    select se.id::text as id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.avg_pace_s_per_500m::text as pace,
      se.avg_power_w::text as power,
      se.stroke_rate_spm::text as spm,
      se.distance_meters::text as dist
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(se.modality, case
        when ex.category='cardio' and ex.slug ilike '%row%' then 'row'
        when ex.category='cardio' and ex.slug ilike '%ski%' then 'ski'
        when ex.category='cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
        else 'x' end) = ${modality}
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by se.avg_pace_s_per_500m asc nulls last, day desc
  `;
  const sessions: SourceSession[] = rows.map((r, i) => ({
    id: r.id,
    date: r.day,
    title_es: kmStr(num(r.dist)) ?? 'Ergo',
    detail_es: [numOrNull(r.power) != null ? `${Math.round(num(r.power))} w` : null, numOrNull(r.spm) != null ? `${Math.round(num(r.spm))} spm` : null].filter(Boolean).join(' · ') || null,
    value: numOrNull(r.pace) != null ? `${paceStr(num(r.pace))} /500m` : null,
    value_label: i === 0 ? 'mejor' : null,
  }));
  const best = rows.length ? Math.min(...rows.filter((r) => numOrNull(r.pace) != null).map((r) => num(r.pace))) : null;
  return {
    kind: 'ergo.split',
    title_es: `Ergo · ${modality}`,
    subtitle_es: `${rows.length} sesiones`,
    summary: [{ id: 'best', value: best != null ? `${paceStr(best)}` : '—', label: 'mejor /500m', accent: true }],
    sessions,
    source_table: 'segment_executions',
    period,
  };
}

// ── Strength lift (versioned 1RM history) ────────────────────────────────────
async function strengthDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const slug = params.slug ?? '';
  const rows = await client<Array<{ id: string; one_rm: string; version: number; on: string; source: string; method: string | null; tw: string | null; tr: number | null }>>`
    select id::text as id, one_rm_kg::text as one_rm, version,
      to_char(recorded_at, 'YYYY-MM-DD') as on, source, one_rm_method as method,
      test_weight_kg::text as tw, test_reps as tr
    from athlete_strength_maxes
    where athlete_id = ${athleteId} and exercise_slug = ${slug}
    order by version desc
  `;
  const sessions: SourceSession[] = rows.map((r, i) => ({
    id: r.id,
    date: r.on,
    title_es: r.tr && r.tr > 1 && r.tw ? `${num(r.tw)} kg × ${r.tr} (${r.method ?? 'est.'})` : 'Single directo',
    detail_es: r.source,
    value: `${formatKg(num(r.one_rm))} kg`,
    value_label: i === 0 ? 'actual' : null,
  }));
  const best = rows.length ? Math.max(...rows.map((r) => num(r.one_rm))) : null;
  return {
    kind: 'strength.lift',
    title_es: '1RM · historial',
    subtitle_es: `${rows.length} tests`,
    summary: [{ id: 'best', value: best != null ? `${formatKg(best)} kg` : '—', label: 'mejor', accent: true }],
    sessions,
    source_table: 'athlete_strength_maxes',
    period,
  };
}

function formatKg(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.', ',');
}

// ── HYROX race — the 16 segments (8 runs + 8 stations) one by one ────────────
async function hyroxRaceDrill(
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

// ── Recovery metric — the daily readings behind the trend ────────────────────
async function recoveryDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const metric = params.metric ?? 'hrv';
  const rows = await client<Array<{ d: string; v: number | null }>>`
    select to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d, avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${athleteId} and metric_type::text = ${metric}
      and recorded_at >= ${period.start_iso}::timestamptz
      and recorded_at <= ${period.end_iso}::timestamptz
    group by 1
    order by 1 desc
    limit ${RECOVERY_MAX_ROWS}
  `;
  const sessions: SourceSession[] = rows
    .filter((r) => r.v != null)
    .map((r) => ({
      id: r.d,
      date: r.d,
      title_es: dayMonthEs(r.d) ?? r.d,
      detail_es: null,
      value: `${Math.round((r.v as number) * 10) / 10}`,
      value_label: null,
    }));
  return {
    kind: 'recovery.metric',
    title_es: `Recuperación · ${metric}`,
    subtitle_es: `${sessions.length} días`,
    summary: [{ id: 'days', value: String(sessions.length), label: 'días con dato', accent: false }],
    sessions,
    source_table: 'biometric_streams',
    period,
  };
}

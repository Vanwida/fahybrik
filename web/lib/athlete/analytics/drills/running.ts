// ANALYTICS · DRILL-DOWN · RUNNING — the source sessions behind a running
// aggregate. `running.volume|type|zone` open the run executions in the window;
// `running.best_effort` opens the qualifying 1k/3k segments or the 5k test
// history. Same window the section card used → the exact rows that made the number.

import 'server-only';

import type { Sql } from '@/lib/db';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import {
  type DrillDownResult,
  type ResolvedPeriod,
  type SourceSession,
  clockStr,
  kmStr,
  num,
  numOrNull,
  paceStr,
} from '../core';
import { classifyZone, type ZoneBand } from '../running';

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

export async function runningDrill(
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
export async function bestEffortDrill(
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

// ANALYTICS · DRILL-DOWN · ERGO — the source ergo segments behind a `/500m`
// split, one modality (row/ski/bike) at a time, fastest first.

import 'server-only';

import type { Sql } from '@/lib/db';
import {
  type DrillDownResult,
  type ResolvedPeriod,
  type SourceSession,
  kmStr,
  num,
  numOrNull,
  paceStr,
} from '../core';

export async function ergoDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const modality = params.modality ?? 'row';
  const rows = await client<Array<{ day: string; pace: string | null; power: string | null; spm: string | null; dist: string | null; id: string; assignment_id: string }>>`
    select se.id::text as id,
      we.assignment_id::text as assignment_id,
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
    assignment_id: r.assignment_id,
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

// Source sessions behind the POWER trend — avg watts per erg session, strongest
// first. Each row links to its execution (assignment_id navigable). Stroke rate
// rides in the detail so the per-session rate is visible across the list.
export async function ergoPowerDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const modality = params.modality ?? 'row';
  const rateUnit = modality === 'bike' ? 'rpm' : 'spm';
  const rows = await client<Array<{ day: string; power: string | null; pace: string | null; spm: string | null; dist: string | null; id: string; assignment_id: string }>>`
    select se.id::text as id,
      we.assignment_id::text as assignment_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.avg_power_w::text as power,
      se.avg_pace_s_per_500m::text as pace,
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
      and se.avg_power_w is not null
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by se.avg_power_w desc nulls last, day desc
  `;
  const sessions: SourceSession[] = rows.map((r, i) => ({
    id: r.id,
    date: r.day,
    title_es: kmStr(num(r.dist)) ?? 'Ergo',
    detail_es: [numOrNull(r.pace) != null ? `${paceStr(num(r.pace))} /500m` : null, numOrNull(r.spm) != null ? `${Math.round(num(r.spm))} ${rateUnit}` : null].filter(Boolean).join(' · ') || null,
    value: numOrNull(r.power) != null ? `${Math.round(num(r.power))} w` : null,
    value_label: i === 0 ? 'mejor' : null,
    assignment_id: r.assignment_id,
  }));
  const best = rows.length ? Math.max(...rows.filter((r) => numOrNull(r.power) != null).map((r) => num(r.power))) : null;
  return {
    kind: 'ergo.power',
    title_es: `Ergo · ${modality} — potencia`,
    subtitle_es: `${rows.length} sesiones`,
    summary: [{ id: 'best', value: best != null ? `${Math.round(best)} w` : '—', label: 'mejor potencia', accent: true }],
    sessions,
    source_table: 'segment_executions',
    period,
  };
}

// Source sessions behind CALORIES — kcal per erg session, most first. Universal
// work proxy; each row links to its execution (assignment_id navigable).
export async function ergoCaloriesDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const modality = params.modality ?? 'row';
  const rows = await client<Array<{ day: string; cal: string | null; pace: string | null; dist: string | null; id: string; assignment_id: string }>>`
    select se.id::text as id,
      we.assignment_id::text as assignment_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.calories::text as cal,
      se.avg_pace_s_per_500m::text as pace,
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
      and se.calories is not null and se.calories > 0
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by se.calories desc nulls last, day desc
  `;
  const sessions: SourceSession[] = rows.map((r, i) => ({
    id: r.id,
    date: r.day,
    title_es: kmStr(num(r.dist)) ?? 'Ergo',
    detail_es: numOrNull(r.pace) != null ? `${paceStr(num(r.pace))} /500m` : null,
    value: numOrNull(r.cal) != null ? `${Math.round(num(r.cal))} cal` : null,
    value_label: i === 0 ? 'más' : null,
    assignment_id: r.assignment_id,
  }));
  const total = rows.reduce((a, r) => a + (numOrNull(r.cal) ?? 0), 0);
  return {
    kind: 'ergo.calories',
    title_es: `Ergo · ${modality} — calorías`,
    subtitle_es: `${rows.length} sesiones`,
    summary: [{ id: 'total', value: total > 0 ? `${Math.round(total)} cal` : '—', label: `total ${period.label_es}`, accent: true }],
    sessions,
    source_table: 'segment_executions',
    period,
  };
}

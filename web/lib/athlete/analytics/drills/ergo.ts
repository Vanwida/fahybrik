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

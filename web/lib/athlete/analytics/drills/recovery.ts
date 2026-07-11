// ANALYTICS · DRILL-DOWN · RECOVERY — the daily readings behind a recovery
// metric's trend (biometric_streams), newest first, capped at RECOVERY_MAX_ROWS.

import 'server-only';

import type { Sql } from '@/lib/db';
import {
  type DrillDownResult,
  type ResolvedPeriod,
  type SourceSession,
  dayMonthEs,
} from '../core';

const RECOVERY_MAX_ROWS = 90;

export async function recoveryDrill(
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

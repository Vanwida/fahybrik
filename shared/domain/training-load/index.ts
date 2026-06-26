import type { Sql } from 'postgres';
import { addDays, isoDateString, startOfDayUtc } from '../dates';
import { computeTss } from './tss';
import { computeAcr, computeLoadSeries, summarizeLoad, type DailyTss, type LoadSummary } from './banister';

export * from './tss';
export * from './banister';

// Build a contiguous daily-TSS series over the requested window.
// Days with no execution count as 0 so the EWMA properly decays.
export async function getDailyTssSeries(params: {
  athlete_id: number | bigint;
  end_date: Date;
  days: number;
  client: Sql;
}): Promise<DailyTss[]> {
  const client = params.client;
  const end = startOfDayUtc(params.end_date);
  const start = addDays(end, -(params.days - 1));

  const rows = await client<
    Array<{ d: Date; total_seconds: number | null; rpe: number | null; max_rpe: number | null }>
  >`
    select
      date_trunc('day', coalesce(we.ended_at, we.started_at, we.created_at) at time zone 'UTC')::date as d,
      sum(coalesce(we.total_duration_seconds, 0))::int as total_seconds,
      avg(we.perceived_exertion)::float as rpe,
      max(we.perceived_exertion)::int as max_rpe
    from workout_executions we
    where we.athlete_id = ${params.athlete_id as number}
      and coalesce(we.ended_at, we.started_at, we.created_at) >= ${start.toISOString()}
      and coalesce(we.ended_at, we.started_at, we.created_at) < ${addDays(end, 1).toISOString()}
    group by 1
    order by 1
  `;

  const byDate = new Map<string, number>();
  for (const r of rows) {
    const key = isoDateString(r.d);
    const tss = computeTss({
      duration_seconds: r.total_seconds ?? 0,
      rpe: r.rpe ?? r.max_rpe ?? null,
    });
    byDate.set(key, (byDate.get(key) ?? 0) + tss);
  }

  const out: DailyTss[] = [];
  for (let i = 0; i < params.days; i++) {
    const day = addDays(start, i);
    const key = isoDateString(day);
    out.push({ date: key, tss: byDate.get(key) ?? 0 });
  }
  return out;
}

export async function getLoadSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<LoadSummary> {
  // 90 days is enough warmup for the 42-day CTL to stabilize.
  const series = await getDailyTssSeries({
    athlete_id: params.athlete_id,
    end_date: params.on_date ?? new Date(),
    days: 90,
    client: params.client,
  });
  return summarizeLoad(series);
}

export { computeAcr, computeLoadSeries };

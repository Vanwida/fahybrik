import type { Sql } from 'postgres';
import { addDays, isoDateString, startOfDayUtc } from '../dates';
import { computeTss } from './tss';
import { computeAcr, computeLoadSeries, summarizeLoad, type DailyTss, type LoadSummary } from './banister';

export * from './tss';
export * from './banister';

// Build a contiguous daily-load series over the requested window.
// Days with no execution count as 0 so the EWMA properly decays.
//
// Priced PER SESSION, not per day: TSS is a per-session quantity, and averaging
// a day's RPE let an unrated session borrow a rated one's intensity — inventing
// load twice over. Each execution is priced on its own evidence; the ones with
// no evidence contribute their duration to `unknown_seconds` and nothing to
// `tss` (docs/CONTRATO-UI.md §7).
//
// `workout_executions` carries duration and RPE only — no HR, no power column
// exists (verified against production, 28-jul-2026) — so the power/HR modes of
// computeTss cannot fire from here. When per-session HR/power lands, select it
// here and computeTss will prefer it automatically.
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
    Array<{ d: Date; duration_seconds: number; rpe: number | null }>
  >`
    select
      date_trunc('day', coalesce(we.ended_at, we.started_at, we.created_at) at time zone 'UTC')::date as d,
      coalesce(we.total_duration_seconds, 0)::int as duration_seconds,
      we.perceived_exertion::int as rpe
    from workout_executions we
    where we.athlete_id = ${params.athlete_id as number}
      and coalesce(we.ended_at, we.started_at, we.created_at) >= ${start.toISOString()}
      and coalesce(we.ended_at, we.started_at, we.created_at) < ${addDays(end, 1).toISOString()}
    order by 1
  `;

  type DayTotals = { tss: number; known_seconds: number; unknown_seconds: number };
  const byDate = new Map<string, DayTotals>();
  for (const r of rows) {
    const key = isoDateString(r.d);
    const day = byDate.get(key) ?? { tss: 0, known_seconds: 0, unknown_seconds: 0 };
    const seconds = r.duration_seconds;
    const tss = computeTss({ duration_seconds: seconds, rpe: r.rpe });
    if (tss == null) {
      day.unknown_seconds += seconds;
    } else {
      day.tss += tss;
      day.known_seconds += seconds;
    }
    byDate.set(key, day);
  }

  const out: DailyTss[] = [];
  for (let i = 0; i < params.days; i++) {
    const day = addDays(start, i);
    const key = isoDateString(day);
    const totals = byDate.get(key);
    out.push({
      date: key,
      tss: totals?.tss ?? 0,
      known_seconds: totals?.known_seconds ?? 0,
      unknown_seconds: totals?.unknown_seconds ?? 0,
    });
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

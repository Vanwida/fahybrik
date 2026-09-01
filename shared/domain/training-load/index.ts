import type { Sql } from 'postgres';
import { addDays, isoDateString, startOfDayUtc } from '../dates';
import { GRADIENT_RETIRES_PACE_PCT } from '../running/gradient';
import { resolveThresholdHr } from '../methodology/hr-zones';
import { computeTss, type TssThresholdHr } from './tss';
import { priceSession, type SegmentEvidence, type ThresholdPace } from './intensity';

import { computeAcr, computeLoadSeries, summarizeLoad, type DailyTss, type LoadSummary } from './banister';

export * from './tss';
export * from './banister';
export * from './coverage';
export * from './intensity';

// Build a contiguous daily-load series over the requested window.
// Days with no execution count as 0 so the EWMA properly decays.
//
// Priced PER SESSION, not per day: TSS is a per-session quantity, and averaging
// a day's RPE let an unrated session borrow a rated one's intensity — inventing
// load twice over. Each execution is priced on its own evidence; the ones with
// no evidence contribute their duration to `unknown_seconds` and nothing to
// `tss` (docs/CONTRATO-UI.md §7).
//
// WHAT CHANGED, AND WHY IT MATTERED
// ---------------------------------
// This read used to select duration and RPE and nothing else, so the only rung
// of `computeTss` that could ever fire was the athlete's own rating. An athlete
// who does not rate his sessions had no load at all, and the coach's fitness,
// fatigue and freshness were drawn from the subset he happened to rate.
//
// The evidence was already in the tables — run segments carry pace, most
// segments carry average HR, and the threshold anchors are resolved, versioned
// rows with their provenance attached. Now it is read, and each SEGMENT is
// priced on its own best evidence (see `intensity.ts` for the ladder and for why
// power stays dormant). Time no segment measured falls back to RPE exactly as
// before, so no athlete loses coverage by this change.

/** How much of a window's executed time was priced on an instrument vs. on a rating. */
export type LoadEvidenceSplit = {
  measured_seconds: number;
  declared_seconds: number;
};

const PACE_UNIT_BY_MODALITY: Record<string, 'per_km' | 'per_500m'> = {
  run: 'per_km',
  row: 'per_500m',
  ski: 'per_500m',
};

/**
 * A zone profile counts as a MEASURED anchor only when a test produced it and
 * nobody has flagged it for review. `onboarding_auto` is back-derived from a 5 km
 * time plus an offset — a proxy for the threshold, not the threshold — and
 * pricing intensity against it would report an estimate as a measurement, which
 * is the exact failure the HR ladder already refuses.
 */
const MEASURED_ZONE_SOURCES: ReadonlySet<string> = new Set(['coach_test', 'athlete_test']);

type ExecutionRow = {
  d: Date;
  duration_seconds: number;
  rpe: number | null;
  segments: Array<{
    seconds: number | null;
    modality: string | null;
    pace_km: number | null;
    pace_500m: number | null;
    avg_hr: number | null;
    gradient_pct: number | null;
  }> | null;
};

async function loadThresholdPaces(
  athlete_id: number | bigint,
  client: Sql,
): Promise<Map<string, ThresholdPace>> {
  const rows = await client<Array<{ modality: string; threshold_s: number; source: string | null; needs_review: boolean | null }>>`
    select modality, threshold_s::float as threshold_s, source, needs_review
    from athlete_zone_profiles
    where athlete_id = ${athlete_id as number}
  `;
  const out = new Map<string, ThresholdPace>();
  for (const r of rows) {
    if (r.threshold_s == null || !Number.isFinite(r.threshold_s) || r.threshold_s <= 0) continue;
    out.set(r.modality, {
      seconds: r.threshold_s,
      measured: MEASURED_ZONE_SOURCES.has(r.source ?? '') && r.needs_review !== true,
    });
  }
  return out;
}

/**
 * The athlete's threshold HR through the CANONICAL resolver, not a second ladder.
 * `resolveThresholdHr` already ranks measured over declared over inferred, and
 * already marks the inferred rungs `estimated` — which is precisely the flag
 * `computeTss` refuses to price against.
 */
async function loadThresholdHr(
  athlete_id: number | bigint,
  client: Sql,
): Promise<TssThresholdHr | null> {
  const rows = await client<Array<{ lthr: number | null; max_hr: number | null }>>`
    select
      (select ab.value::float from athlete_benchmarks ab
        where ab.athlete_id = a.id and ab.exercise_slug = 'lthr_bpm'
        order by ab.recorded_at desc nulls last limit 1) as lthr,
      a.max_hr_bpm::float as max_hr
    from athletes a
    where a.id = ${athlete_id as number}
  `;
  const row = rows[0];
  if (row == null) return null;
  const resolved = resolveThresholdHr({
    lthr_bpm: row.lthr ?? null,
    lthr_declared_bpm: null,
    max_hr_bpm: row.max_hr ?? null,
    age_years: null,
  });
  if (resolved == null) return null;
  return { bpm: resolved.lthr_bpm, estimated: resolved.estimated };
}

export async function getDailyTssSeries(params: {
  athlete_id: number | bigint;
  end_date: Date;
  days: number;
  client: Sql;
  /** Coach method: gradient at or above which pace stops pricing. */
  gradient_retires_pace_pct?: number;
}): Promise<DailyTss[]> {
  const client = params.client;
  const end = startOfDayUtc(params.end_date);
  const start = addDays(end, -(params.days - 1));

  const [rows, thresholdPaces, lthr] = await Promise.all([
    client<Array<ExecutionRow>>`
      select
        date_trunc('day', coalesce(we.ended_at, we.started_at, we.created_at) at time zone 'UTC')::date as d,
        coalesce(we.total_duration_seconds, 0)::int as duration_seconds,
        we.perceived_exertion::int as rpe,
        coalesce(
          json_agg(
            json_build_object(
              'seconds', extract(epoch from (se.ended_at - se.started_at)),
              'modality', se.modality,
              'pace_km', se.avg_pace_s_per_km::float,
              'pace_500m', se.avg_pace_s_per_500m::float,
              'avg_hr', se.avg_hr::float,
              'gradient_pct', se.avg_gradient_pct::float
            )
            order by se.position
          ) filter (where se.id is not null and se.ended_at is not null and se.started_at is not null),
          '[]'
        ) as segments
      from workout_executions we
      left join segment_executions se on se.execution_id = we.id
      where we.athlete_id = ${params.athlete_id as number}
        and coalesce(we.ended_at, we.started_at, we.created_at) >= ${start.toISOString()}
        and coalesce(we.ended_at, we.started_at, we.created_at) < ${addDays(end, 1).toISOString()}
      group by we.id, 1, 2, 3
      order by 1
    `,
    loadThresholdPaces(params.athlete_id, client),
    loadThresholdHr(params.athlete_id, client),
  ]);

  const options = {
    gradient_retires_pace_pct: params.gradient_retires_pace_pct ?? GRADIENT_RETIRES_PACE_PCT,
  };

  type DayTotals = {
    tss: number;
    known_seconds: number;
    unknown_seconds: number;
    unknown_sessions: number;
    measured_seconds: number;
    declared_seconds: number;
  };
  const byDate = new Map<string, DayTotals>();

  for (const r of rows) {
    const key = isoDateString(r.d);
    const day =
      byDate.get(key) ??
      {
        tss: 0,
        known_seconds: 0,
        unknown_seconds: 0,
        unknown_sessions: 0,
        measured_seconds: 0,
        declared_seconds: 0,
      };
    const seconds = r.duration_seconds;

    // Each segment carries its OWN threshold, in its own unit: a run is judged
    // in seconds per kilometre and a row in seconds per 500 m, and the two must
    // never meet.
    const segments: SegmentEvidence[] = (r.segments ?? []).map((s) => {
      const modality = s.modality ?? '';
      const unit = PACE_UNIT_BY_MODALITY[modality];
      return {
        duration_seconds: s.seconds ?? 0,
        pace_seconds: unit === 'per_500m' ? s.pace_500m : unit === 'per_km' ? s.pace_km : null,
        threshold_pace: thresholdPaces.get(modality) ?? null,
        avg_hr: s.avg_hr,
        gradient_pct: s.gradient_pct,
      };
    });

    const price = priceSession(
      { duration_seconds: seconds, rpe: r.rpe, segments, lthr },
      options,
    );

    if (price.tss == null) {
      day.unknown_seconds += seconds;
      day.unknown_sessions += 1;
    } else {
      day.tss += price.tss;
      day.known_seconds += price.measured_seconds + price.declared_seconds;
      day.unknown_seconds += price.unpriced_seconds;
      if (price.unpriced_seconds > 0) day.unknown_sessions += 1;
      day.measured_seconds += price.measured_seconds;
      day.declared_seconds += price.declared_seconds;
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
      unknown_sessions: totals?.unknown_sessions ?? 0,
      measured_seconds: totals?.measured_seconds ?? 0,
      declared_seconds: totals?.declared_seconds ?? 0,
    });
  }
  return out;
}

/**
 * Days of history the chronic average needs before it stops being a warm-up
 * artefact. A 42-day EWMA seeded at zero climbs for weeks; a window shorter than
 * this shows a base that is rising because the maths just started, not because
 * the athlete did anything.
 */
export const CTL_WARMUP_DAYS = 90;

export async function getLoadSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  /** Days of history to read. Defaults to the warm-up the 42-day EWMA needs. */
  days?: number;
  client: Sql;
  gradient_retires_pace_pct?: number;
}): Promise<LoadSummary> {
  const series = await getDailyTssSeries({
    athlete_id: params.athlete_id,
    end_date: params.on_date ?? new Date(),
    days: Math.max(params.days ?? CTL_WARMUP_DAYS, CTL_WARMUP_DAYS),
    client: params.client,
    ...(params.gradient_retires_pace_pct != null
      ? { gradient_retires_pace_pct: params.gradient_retires_pace_pct }
      : {}),
  });
  return summarizeLoad(series);
}

export { computeAcr, computeLoadSeries, computeTss };

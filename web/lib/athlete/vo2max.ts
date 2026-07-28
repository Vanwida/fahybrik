import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { BENCH_COOPER_12MIN } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  RUN_5K_METERS,
  computeVdot,
  vo2maxFromCooperMeters,
} from '@fahybrid/shared/domain/running/vdot';

// VO₂ MÁX — the athlete's own aerobic number, assembled ONCE, server-side.
//
// The whole point of this module is that the app has TWO numbers of the same
// family and they must never contradict each other on screen:
//
//   · the WATCH VO₂max (biometric_streams.vo2max), which arrives on its own and
//     is the number people recognise from Apple and Garmin;
//   · a VDOT derived from the athlete's own 5 km mark (Daniels), which the
//     running analysis already surfaces on Inicio.
//
// They are computed differently and will differ. Deciding which one leads in the
// VIEW would mean deciding it in every view; so the rule lives here, once:
//
//   HEADLINE = the watch's, when there is one.
//   HEADLINE = the Cooper 12 min, when there is no watch — a real MEASUREMENT of
//              the same quantity (see vo2maxFromCooperMeters), which is exactly
//              why the empty state can send an athlete without a watch to do one.
//   VDOT     = never the headline. It is a pace model that shares the units, so
//              it travels alongside, labelled with where it came from.
//
// They are NEVER averaged. Each carries its own provenance so the athlete can
// see why two numbers of the same family are not the same number.

/** Window the trend covers. VO₂max moves over weeks, so it needs a wide one. */
const WINDOW_DAYS = 90;
/** Distinct days with a reading below which a line is noise, not a trend. */
const MIN_TREND_DAYS = 4;

export type Vo2MaxSource = 'watch' | 'cooper';

export type Vo2MaxPoint = { iso_date: string; value: number };

export type AthleteVo2Max = {
  /** The number the screen is about. Null when nothing has measured it. */
  headline: { value: number; source: Vo2MaxSource; measured_on: string } | null;
  /** Watch readings over the window, daily-averaged, only days that have one. */
  series: Vo2MaxPoint[];
  /** Mean of the earlier stretch of `series` — the "vs tu base" reference. */
  baseline: number | null;
  /** Estimated from the athlete's own marks. NEVER blended with the headline. */
  vdot: { value: number; mark_label: string; recorded_on: string } | null;
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export async function buildAthleteVo2Max(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AthleteVo2Max> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);
  const today = startOfDayInBox(params.on_date ?? new Date());
  const startIso = addDays(today, -(WINDOW_DAYS - 1)).toISOString();

  const watchRows = await client<Array<{ d: string; v: number | null }>>`
    select to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d,
           avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${athleteId}
      -- metric_type is the biometric_metric ENUM; compare as text so the bound
      -- string matches (enum = text has no operator).
      and metric_type::text = 'vo2max'
      and recorded_at >= ${startIso}::timestamptz
    group by 1
    order by 1
  `;
  const series: Vo2MaxPoint[] = watchRows
    .filter((r): r is { d: string; v: number } => r.v != null)
    .map((r) => ({ iso_date: r.d, value: round1(r.v) }));

  // The athlete's best Cooper: the mark IS the distance covered, and it is the
  // only higher-is-better mark in the catalogue, so "best" is the maximum.
  const cooperRows = await client<Array<{ meters: string; recorded_on: string }>>`
    select value::text as meters, to_char(recorded_at, 'YYYY-MM-DD') as recorded_on
    from athlete_benchmarks
    where athlete_id = ${athleteId}
      and exercise_slug = ${BENCH_COOPER_12MIN}
      and unit = 'meters'
    order by value desc, recorded_at desc
    limit 1
  `;
  const cooper = cooperRows[0]
    ? {
        vo2max: vo2maxFromCooperMeters(Number(cooperRows[0].meters)),
        recorded_on: cooperRows[0].recorded_on,
      }
    : null;

  // The 5 km mark → VDOT. The same canonical (slug, unit) the running analysis
  // reads, and the SAME `computeVdot`, so the two surfaces can never print
  // different VDOTs for the same athlete.
  const fiveKRows = await client<Array<{ seconds: string; recorded_on: string }>>`
    select value::text as seconds, to_char(recorded_at, 'YYYY-MM-DD') as recorded_on
    from athlete_benchmarks
    where athlete_id = ${athleteId}
      and exercise_slug = 'run_5k'
      and unit = 'seconds'
    order by recorded_at desc
    limit 1
  `;
  const fiveKSeconds = fiveKRows[0] ? Number(fiveKRows[0].seconds) : null;
  const vdotValue =
    fiveKSeconds != null && fiveKSeconds > 0
      ? computeVdot({ distance_meters: RUN_5K_METERS, duration_seconds: fiveKSeconds })?.vdot ?? null
      : null;

  const latest = series.length ? series[series.length - 1]! : null;
  let headline: AthleteVo2Max['headline'] = null;
  if (latest) {
    headline = { value: latest.value, source: 'watch', measured_on: latest.iso_date };
  } else if (cooper?.vo2max != null) {
    headline = { value: cooper.vo2max, source: 'cooper', measured_on: cooper.recorded_on };
  }

  return {
    headline,
    // A two-point line is not a trend; below the threshold the screen shows the
    // number without a chart rather than a shape that means nothing.
    series: series.length >= MIN_TREND_DAYS ? series : [],
    baseline: baselineOf(series),
    vdot:
      vdotValue != null && fiveKRows[0]
        ? { value: vdotValue, mark_label: '5 km', recorded_on: fiveKRows[0].recorded_on }
        : null,
  };
}

/**
 * The reference the latest reading is compared against: the mean of everything
 * before the most recent third of the window. Excluding the recent stretch is
 * what stops a climb being measured against itself. Null when there is not
 * enough history for the comparison to mean anything.
 */
function baselineOf(series: Vo2MaxPoint[]): number | null {
  if (series.length < MIN_TREND_DAYS) return null;
  const values = series.map((p) => p.value);
  const split = Math.max(1, Math.floor(values.length / 3));
  const earlier = values.slice(0, values.length - split);
  if (!earlier.length) return null;
  return round1(earlier.reduce((s, v) => s + v, 0) / earlier.length);
}

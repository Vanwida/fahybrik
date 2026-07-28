import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { MARKS } from '@fahybrid/shared/domain/athlete/marks';
import {
  selectCooperVo2max,
  selectRunMark,
  type MarkRow,
} from '@fahybrid/shared/domain/athlete/mark-projection';

// VO₂ MÁX — the athlete's own aerobic number, assembled ONCE, server-side.
//
// The whole point of this module is that the app has TWO numbers of the same
// family and they must never contradict each other on screen:
//
//   · the WATCH VO₂max (biometric_streams.vo2max), which arrives on its own and
//     is the number people recognise from Apple and Garmin;
//   · a VDOT derived from the athlete's own running mark (Daniels), which the
//     running analysis already surfaces on Inicio and which sets the paces of
//     the plan.
//
// They are computed differently and will differ. Deciding which one leads in the
// VIEW would mean deciding it in every view; so the rule lives here, once:
//
//   HEADLINE = the watch's, when there is one.
//   HEADLINE = the Cooper 12 min, when there is no watch — a real MEASUREMENT of
//              the same quantity (Cooper's regression was fitted against VO₂max
//              measured in a lab), which is exactly why the empty state can send
//              an athlete without a watch to do one.
//   VDOT     = never the headline. It is a pace model that shares the units, so
//              it travels alongside, labelled with the mark it came from.
//
// They are NEVER averaged. Each carries its own provenance so the athlete can
// see why two numbers of the same family are not the same number.
//
// WHICH MARK EACH ONE READS is NOT decided here. Both go through the selectors in
// `shared/domain/athlete/mark-projection`, the same ones the race projection and
// the free plan use — same provenance filter (an `onboarding`/`unknown` row is
// not evidence), same tie-break. Before that, this module ranked its own rows:
// it took the LONGEST Cooper while the projection took the freshest, and it took
// any 5 K at all while the projection refused unmeasured ones. Two numbers of the
// same name off two different tests is the bug this file exists to prevent.

/** Window the trend covers. VO₂max moves over weeks, so it needs a wide one. */
const WINDOW_DAYS = 90;
/** Distinct days with a reading below which a line is noise, not a trend. */
const MIN_TREND_DAYS = 4;

/** The closed mark catalogue — nothing outside it can be evidence. */
const MARK_SLUGS: readonly string[] = MARKS.map((m) => m.slug);

/** One `athlete_benchmarks` row as it comes back from SQL (all text/int). */
type BenchmarkRow = {
  exercise_slug: string;
  value: string;
  age_days: number | null;
  recorded_on: string;
  source: string;
  run_context: string | null;
};

/**
 * A `MarkRow` carrying the date the screen shows. The selectors are generic over
 * the row, so the extra column survives the selection and comes back on the
 * winner — no second query to find out WHEN the winning mark happened.
 */
type DatedMarkRow = MarkRow & { recorded_on: string };

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

  // ONE read of the mark catalogue, then the shared selectors decide. The
  // provenance filter lives in the pure projection, so this stays a plain read —
  // the same division of labour `race-transfer` already uses.
  const markRows = await client<BenchmarkRow[]>`
    select
      exercise_slug,
      value::text as value,
      (current_date - recorded_at::date)::int as age_days,
      to_char(recorded_at, 'YYYY-MM-DD') as recorded_on,
      source,
      run_context
    from athlete_benchmarks
    where athlete_id = ${athleteId}
      and exercise_slug = any(${MARK_SLUGS}::text[])
    order by recorded_at desc
  `;
  const marks: DatedMarkRow[] = markRows.flatMap((r) => {
    const value = Number(r.value);
    if (!Number.isFinite(value)) return [];
    return [
      {
        slug: r.exercise_slug,
        value,
        age_days: r.age_days,
        source: r.source,
        run_context: r.run_context,
        recorded_on: r.recorded_on,
      },
    ];
  });

  const cooper = selectCooperVo2max(marks);
  const runMark = selectRunMark(marks);

  const latest = series.length ? series[series.length - 1]! : null;
  let headline: AthleteVo2Max['headline'] = null;
  if (latest) {
    headline = { value: latest.value, source: 'watch', measured_on: latest.iso_date };
  } else if (cooper) {
    headline = { value: cooper.vo2max, source: 'cooper', measured_on: cooper.row.recorded_on };
  }

  return {
    headline,
    // A two-point line is not a trend; below the threshold the screen shows the
    // number without a chart rather than a shape that means nothing.
    series: series.length >= MIN_TREND_DAYS ? series : [],
    baseline: baselineOf(series),
    // The mark label is the one that actually won, never a hardcoded "5 km": the
    // athlete has to be able to tell which of their tests this number came from,
    // and after a Cooper the same test feeds both numbers on this screen.
    vdot: runMark
      ? {
          value: runMark.vdot,
          mark_label: runMark.spec.label,
          recorded_on: runMark.row.recorded_on,
        }
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

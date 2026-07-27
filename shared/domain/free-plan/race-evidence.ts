// What an athlete's imported HYROX history proves ABOUT HIM (pure, no I/O).
//
// THE RULE THIS MODULE EXISTS TO ENFORCE — what a team race does and does not
// say about one of its two athletes:
//
//   · finish time  → the TEAM's official result. His too, but only with the
//                    format named next to it.
//   · running      → HIS. Both partners run all eight kilometres; the stations
//                    are what gets shared out. But they run TOGETHER, so the
//                    time is set by the slower of the two: it is a FLOOR on his
//                    ability, never a measurement of it.
//   · roxzone      → HIS. Both athletes travel every transition.
//   · station split→ NOT HIS. One of the two did that station. This module never
//                    reads them, and nothing downstream may attribute one to him.
//
// The floor/measurement distinction is not theoretical. In production, one
// athlete ran two doubles races on the SAME DAY: 2137 s over 8 km with one
// partner and 3162 s with another. Seventeen minutes of "his" running that was
// never his. That is why `partner_bounded` travels with every team run, why the
// BEST run (least partner drag) is the estimator, and why no trend is emitted
// across team races.

import { HYROX_RUN_TOTAL_METERS } from '../athlete/mark-projection';
import type {
  FinishEvidence,
  GoalCheck,
  NotComparableReason,
  RaceEvidence,
  RaceFormat,
  RaceRef,
  RoxzoneEvidence,
  RunEvidence,
  RunTrend,
} from './types';

/** A `races` row, reduced to what the portrait needs. */
export interface RaceRow {
  race_id: number;
  name: string;
  location: string | null;
  race_date: string | null;
  /** `races.event_type` — only 'hyrox' has the 8 km / 8 station anatomy. */
  event_type: string;
  format: string;
  division: string | null;
  gender_category: string | null;
  result_time_seconds: number | null;
  run_total_seconds: number | null;
  roxzone_seconds: number | null;
  /** Seeded rows with scaled splits. Never evidence — same rule as the predictor. */
  is_synthetic: boolean;
}

/** The target race additionally carries the goal time being checked against. */
export type TargetRaceRow = RaceRow & { goal_time_seconds: number | null };

/** The formats where the numbers belong to two people, not one. */
const TEAM_FORMATS: readonly string[] = ['doubles', 'relay'];

/** The only event type whose anatomy this module models. */
const HYROX_EVENT_TYPE = 'hyrox';

/**
 * Pace change below which "faster" and "slower" are indistinguishable from
 * race-day noise, so the trend reads `estable`.
 *
 * ORIGIN: declared assumption. 5 s/km is ~2 % of a 4:00–5:00/km HYROX run pace —
 * comfortably inside the spread a single warm hall or a crowded first lap
 * produces. Calling a 2 % drift "improvement" would be reading tea leaves.
 */
export const TREND_DEAD_BAND_S_PER_KM = 5;

/** Minimum solo races before a direction is claimed at all. */
export const TREND_MIN_RACES = 3;

/** Milliseconds in a day — for turning race dates into a regression axis. */
const MS_PER_DAY = 86_400_000;

function isTeamFormat(format: string): boolean {
  return TEAM_FORMATS.includes(format);
}

/** Normalise `races.format` onto the closed union; anything unknown is solo-shaped. */
function toRaceFormat(format: string): RaceFormat {
  return format === 'doubles' || format === 'relay' ? format : 'singles';
}

function toRef(row: RaceRow): RaceRef {
  return {
    race_id: row.race_id,
    name: row.name,
    location: row.location,
    race_date: row.race_date,
    format: toRaceFormat(row.format),
    division: row.division,
    gender_category: row.gender_category,
  };
}

function positive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * The rows admissible as evidence: a real (non-seeded) HYROX with something
 * measured on it. A DEKA or a synthetic row never reaches the portrait.
 */
export function admissibleRaces(rows: readonly RaceRow[]): RaceRow[] {
  return rows.filter(
    (row) =>
      !row.is_synthetic &&
      row.event_type === HYROX_EVENT_TYPE &&
      (positive(row.result_time_seconds) ||
        positive(row.run_total_seconds) ||
        positive(row.roxzone_seconds)),
  );
}

/** Date as a day number, for ordering and regression. Undated rows sort last. */
function dayNumber(race_date: string | null): number | null {
  if (!race_date) return null;
  const ms = Date.parse(race_date);
  return Number.isFinite(ms) ? ms / MS_PER_DAY : null;
}

/** Pick the row minimising `value`, with the race date as a deterministic tie-break. */
function bestBy<T>(rows: readonly RaceRow[], read: (row: RaceRow) => number | null, make: (row: RaceRow, value: number) => T): T | null {
  let bestRow: RaceRow | null = null;
  let bestValue = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const value = read(row);
    if (!positive(value)) continue;
    if (value < bestValue) {
      bestRow = row;
      bestValue = value;
      continue;
    }
    // Equal times: the more recent race wins, so the answer never depends on
    // the order the loader happened to return.
    if (value === bestValue && bestRow) {
      const a = dayNumber(row.race_date);
      const b = dayNumber(bestRow.race_date);
      if (a != null && (b == null || a > b)) bestRow = row;
    }
  }
  return bestRow ? make(bestRow, bestValue) : null;
}

function toRunEvidence(row: RaceRow, total_seconds: number): RunEvidence {
  return {
    race: toRef(row),
    total_seconds,
    pace_s_per_km: (total_seconds / HYROX_RUN_TOTAL_METERS) * 1000,
    partner_bounded: isTeamFormat(row.format),
  };
}

/**
 * The direction his running has taken — SOLO races only.
 *
 * In a team race the run time carries his partner in it, and the partner changes
 * between races. A "trend" over that is a trend in who he entered with, which is
 * worse than saying nothing. So team races are excluded outright; with fewer
 * than `TREND_MIN_RACES` solo races the answer is null and the client shows his
 * best and latest runs as plain facts instead.
 *
 * The direction is the least-squares slope of pace against date, which uses
 * every race rather than just the endpoints — one bad day cannot flip it.
 */
export function runTrend(rows: readonly RaceRow[]): RunTrend | null {
  const points: { day: number; pace: number }[] = [];
  for (const row of rows) {
    if (isTeamFormat(row.format)) continue;
    const day = dayNumber(row.race_date);
    const total = row.run_total_seconds;
    if (day == null || !positive(total)) continue;
    points.push({ day, pace: (total / HYROX_RUN_TOTAL_METERS) * 1000 });
  }
  if (points.length < TREND_MIN_RACES) return null;

  const n = points.length;
  const meanDay = points.reduce((sum, p) => sum + p.day, 0) / n;
  const meanPace = points.reduce((sum, p) => sum + p.pace, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const p of points) {
    const dx = p.day - meanDay;
    covariance += dx * (p.pace - meanPace);
    variance += dx * dx;
  }
  // Every race on one day: no time axis, so no direction can be read.
  if (!(variance > 0)) return null;

  const days = Math.max(...points.map((p) => p.day)) - Math.min(...points.map((p) => p.day));
  const delta_s_per_km = (covariance / variance) * days;
  const direction: RunTrend['direction'] =
    Math.abs(delta_s_per_km) < TREND_DEAD_BAND_S_PER_KM
      ? 'estable'
      : delta_s_per_km < 0
        ? 'mejora'
        : 'empeora';

  return { direction, delta_s_per_km, races_counted: n };
}

/** His best 8 km inside a HYROX — the least partner-dragged run he has. */
export function bestRun(rows: readonly RaceRow[]): RunEvidence | null {
  return bestBy(rows, (row) => row.run_total_seconds, toRunEvidence);
}

/** His most recent 8 km. Undated rows cannot be "latest" and are skipped. */
export function latestRun(rows: readonly RaceRow[]): RunEvidence | null {
  let best: RaceRow | null = null;
  let bestDay = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const day = dayNumber(row.race_date);
    if (day == null || !positive(row.run_total_seconds)) continue;
    // Two races on one day (it happens — different categories): the slower run
    // is the one carrying the most partner drag, so the faster one represents him.
    if (day > bestDay || (day === bestDay && best && row.run_total_seconds < (best.run_total_seconds ?? Infinity))) {
      best = row;
      bestDay = day;
    }
  }
  return best && positive(best.run_total_seconds) ? toRunEvidence(best, best.run_total_seconds) : null;
}

/** The whole portrait. Null when nothing admissible survives the filters. */
export function buildRaceEvidence(rows: readonly RaceRow[]): RaceEvidence | null {
  const races = admissibleRaces(rows);
  if (races.length === 0) return null;

  const best_finish = bestBy<FinishEvidence>(races, (row) => row.result_time_seconds, (row, total_seconds) => ({
    race: toRef(row),
    total_seconds,
    team_result: isTeamFormat(row.format),
  }));
  const best_roxzone = bestBy<RoxzoneEvidence>(races, (row) => row.roxzone_seconds, (row, seconds) => ({
    race: toRef(row),
    seconds,
  }));

  return {
    races_counted: races.length,
    best_finish,
    best_run: bestRun(races),
    latest_run: latestRun(races),
    best_roxzone,
    run_trend: runTrend(races),
  };
}

// ── Goal vs reality ──────────────────────────────────────────────────────────

/**
 * Two races are comparable when the format, the division AND the gender category
 * all match. Sled and sandbag weights move between open and pro and between
 * men's and mixed, so a time from one bracket says nothing precise about
 * another. Better to admit that than to flatter him with a false gap.
 */
export function isComparable(a: RaceRef, b: RaceRef): boolean {
  return a.format === b.format && a.division === b.division && a.gender_category === b.gender_category;
}

/**
 * His goal against the best race he has actually run under the same conditions.
 *
 * Returns null only when there is no goal to check. When there IS a goal but no
 * comparable race, the check still comes back with `not_comparable_reason` set —
 * the client is supposed to say so out loud rather than quietly drop the block.
 */
export function buildGoalCheck(target: TargetRaceRow, rows: readonly RaceRow[]): GoalCheck | null {
  const goal_seconds = target.goal_time_seconds;
  if (!positive(goal_seconds)) return null;

  const ref = toRef(target);
  const finished = admissibleRaces(rows).filter(
    (row) => row.race_id !== target.race_id && positive(row.result_time_seconds),
  );

  const comparable = finished.filter((row) => isComparable(toRef(row), ref));
  const comparable_best = bestBy<FinishEvidence>(comparable, (row) => row.result_time_seconds, (row, total_seconds) => ({
    race: toRef(row),
    total_seconds,
    team_result: isTeamFormat(row.format),
  }));

  let not_comparable_reason: NotComparableReason | null = null;
  if (!comparable_best) {
    not_comparable_reason = finished.length === 0 ? 'sin_carreras' : 'formato_distinto';
  }

  return {
    target: ref,
    goal_seconds,
    comparable_best,
    not_comparable_reason,
    delta_seconds: comparable_best ? goal_seconds - comparable_best.total_seconds : null,
  };
}

import 'server-only';

import {
  buildGoalCheck,
  buildRaceEvidence,
  buildWeek,
  type FreePlanPayload,
  type RaceRow,
  type StrengthMaxRow,
  type TargetRaceRow,
} from '@fahybrid/shared/domain/free-plan';
import { MARKS } from '@fahybrid/shared/domain/athlete/marks';
import type { MarkRow } from '@fahybrid/shared/domain/athlete/mark-projection';
import { sql as defaultSql, type Sql } from '@/lib/db';

// Loader for the FREE Plan tab — the athlete WITHOUT a coach.
//
// EVERY QUERY HERE IS COACHLESS-SAFE ON PURPOSE. The established athlete loaders
// reach their data through the owning coach (`loadStrengthMaxesForAthlete` joins
// `athletes a on … a.coach_id is not null`, `loadAthleteZoneProfilesForAthlete`
// assumes the FK is populated). For an athlete whose `coach_id` IS null — which
// is the only kind of athlete this file serves — those return empty and the whole
// screen silently goes blank. So these read the athlete's own rows directly and
// join nothing that could reintroduce the assumption.
//
// The loader decides NOTHING about meaning: it fetches rows and hands them to
// `shared/domain/free-plan`, which is where "what counts as evidence" lives and
// is unit-tested. One brain, two callers.

interface RaceQueryRow {
  race_id: string;
  name: string;
  location: string | null;
  race_date: string | null;
  event_type: string;
  format: string;
  division: string | null;
  gender_category: string | null;
  result_time_seconds: number | null;
  run_total_seconds: number | null;
  roxzone_seconds: number | null;
  goal_time_seconds: number | null;
  is_synthetic: boolean;
}

interface BenchmarkQueryRow {
  exercise_slug: string;
  value: string;
  age_days: number | null;
  source: string;
  run_context: string | null;
}

interface StrengthQueryRow {
  exercise_slug: string;
  one_rm_kg: string;
}

interface Vo2maxQueryRow {
  value: string;
}

function toNum(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRaceRow(row: RaceQueryRow): RaceRow {
  return {
    race_id: Number(row.race_id),
    name: row.name,
    location: row.location,
    race_date: row.race_date,
    event_type: row.event_type,
    format: row.format,
    division: row.division,
    gender_category: row.gender_category,
    result_time_seconds: row.result_time_seconds,
    run_total_seconds: row.run_total_seconds,
    roxzone_seconds: row.roxzone_seconds,
    is_synthetic: row.is_synthetic,
  };
}

/**
 * The free Plan tab's whole payload.
 *
 * Returns every section independently nullable: a section with nothing behind it
 * is `null` and the client paints nothing there. There is no "empty state with
 * sample content" anywhere in this path by design.
 */
export async function loadFreePlan(
  athlete_id: number,
  client: Sql = defaultSql,
): Promise<FreePlanPayload> {
  const markSlugs = MARKS.map((m) => m.slug);
  const [raceRows, benchmarkRows, strengthRows, vo2maxRows] = await Promise.all([
    // Completed races (the evidence) AND the upcoming target (the goal) in one
    // read — they come from the same table and the domain splits them.
    client<RaceQueryRow[]>`
      select
        r.id::text as race_id,
        r.name,
        r.location,
        to_char(r.race_date, 'YYYY-MM-DD') as race_date,
        r.event_type::text as event_type,
        r.format::text as format,
        r.division::text as division,
        r.gender_category::text as gender_category,
        r.result_time_seconds,
        r.run_total_seconds,
        r.roxzone_seconds,
        r.goal_time_seconds,
        coalesce(r.is_synthetic, false) as is_synthetic
      from races r
      where r.athlete_id = ${athlete_id}
        and (
          r.status = 'completed'
          or (r.status in ('planned', 'registered') and r.priority = 'target' and r.race_date >= current_date)
        )
      order by r.race_date
    `,
    // His measured marks. The provenance filter (onboarding / unknown are
    // refused) lives in the pure projection, so this stays a plain read.
    client<BenchmarkQueryRow[]>`
      select
        exercise_slug,
        value::text as value,
        (current_date - recorded_at::date)::int as age_days,
        source,
        run_context
      from athlete_benchmarks
      where athlete_id = ${athlete_id}
        and exercise_slug = any(${markSlugs}::text[])
      order by recorded_at desc
    `,
    // His stored one-rep maxes — latest version per lift. NO coach join.
    client<StrengthQueryRow[]>`
      select distinct on (exercise_slug)
        exercise_slug,
        one_rm_kg::text as one_rm_kg
      from athlete_strength_maxes
      where athlete_id = ${athlete_id}
        and one_rm_kg is not null
      order by exercise_slug, version desc, recorded_at desc
    `,
    // The watch's latest VO₂max.
    client<Vo2maxQueryRow[]>`
      select value_numeric::text as value
      from biometric_streams
      where athlete_id = ${athlete_id}
        and metric_type = 'vo2max'
      order by recorded_at desc
      limit 1
    `,
  ]);

  // The target is the upcoming race the query let through; everything else is
  // history. `goal_time_seconds` only travels on the target.
  const targetQueryRow = raceRows.find((row) => row.goal_time_seconds != null && row.result_time_seconds == null);
  const history = raceRows.filter((row) => row.race_id !== targetQueryRow?.race_id).map(toRaceRow);

  const marks: MarkRow[] = [];
  for (const row of benchmarkRows) {
    const value = toNum(row.value);
    if (value == null) continue;
    marks.push({
      slug: row.exercise_slug,
      value,
      age_days: row.age_days,
      source: row.source,
      run_context: row.run_context,
    });
  }

  const strength_maxes: StrengthMaxRow[] = [];
  for (const row of strengthRows) {
    const one_rm_kg = toNum(row.one_rm_kg);
    if (one_rm_kg == null || one_rm_kg <= 0) continue;
    strength_maxes.push({ exercise_slug: row.exercise_slug, one_rm_kg });
  }

  const race_evidence = buildRaceEvidence(history);

  let goal_check = null;
  if (targetQueryRow) {
    const target: TargetRaceRow = {
      ...toRaceRow(targetQueryRow),
      goal_time_seconds: targetQueryRow.goal_time_seconds,
    };
    goal_check = buildGoalCheck(target, history);
  }

  const week = buildWeek({
    marks,
    best_run: race_evidence?.best_run ?? null,
    vo2max: toNum(vo2maxRows[0]?.value ?? null),
    strength_maxes,
  });

  return { race_evidence, goal_check, week };
}

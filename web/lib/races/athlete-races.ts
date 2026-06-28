import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { RaceHistoryItem } from '@fahybrid/shared/schema';
import {
  toHistoryItem,
  type RaceHistoryRow,
} from '@/lib/athlete/race-context';

// ─────────────────────────────────────────────────────────────────────────────
// The athlete's PAST races for GET /api/athlete/races → `past[]`.
//
// "Past" = a race that already happened from the athlete's point of view:
//   • it has a result (result_time_seconds present — an imported/logged finish), OR
//   • its date is in the past (race_date < today-in-box) even with no result —
//     an objective whose day came and went unrecorded.
//
// Projects the SAME rich raceHistoryItemSchema the Carreras hub renders (run /
// station splits, derived percentile, is_team_result, teammates from
// race_partners), reusing the SINGLE projection mapper (toHistoryItem) and row
// shape (RaceHistoryRow) from lib/athlete/race-context so the two history readers
// never diverge. A row that fails the contract degrades to OMISSION (toHistoryItem
// → null, filtered out), never a 500 — matching the hub's honest-data behavior.
//
// "today" resolves in Europe/Madrid (box tz) via the same helper every countdown
// uses, so a race never falls between `upcoming` and `past`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The athlete's full PAST race list (results + expired objectives), newest first
 * (race_date DESC NULLS LAST, id DESC). Teammates are LEFT JOINed from
 * race_partners and aggregated to an array ordered by position ([] for singles).
 */
export async function listAthletePastRaces(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<RaceHistoryItem[]> {
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  const rows = await client<RaceHistoryRow[]>`
    select
      r.id::text                          as id,
      r.name,
      to_char(r.race_date, 'YYYY-MM-DD')  as race_date,
      r.event_type::text                  as event_type,
      r.format::text                      as format,
      r.division::text                    as division,
      r.gender_category::text             as gender_category,
      r.age_group,
      r.location,
      r.result_time_seconds,
      r.run_total_seconds,
      r.roxzone_seconds,
      r.best_run_lap_seconds,
      r.overall_rank,
      r.age_group_rank,
      r.field_size,
      r.source,
      r.source_season,
      r.run_splits_json,
      r.station_splits_json,
      coalesce(
        json_agg(
          json_build_object(
            'name', rp.name,
            'slug', rp.slug,
            'nation', rp.nation,
            'position', rp.position
          ) order by rp.position
        ) filter (where rp.race_id is not null),
        '[]'::json
      )                                   as partners_json
    from races r
    left join race_partners rp on rp.race_id = r.id
    where r.athlete_id = ${athlete_id as number}
      and (
        r.result_time_seconds is not null
        or (r.race_date is not null and r.race_date < ${todayIso}::date)
      )
    group by r.id
    order by r.race_date desc nulls last, r.id desc
  `;

  // Per-row contract enforcement: toHistoryItem validates against
  // raceHistoryItemSchema and returns null for a malformed stored row, which we
  // drop. The surviving array IS the contract.
  return rows
    .map(toHistoryItem)
    .filter((item): item is RaceHistoryItem => item !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Best REAL HYROX singles result — the gold-standard signal for the athlete's
// level. A "real" result is a completed individual HYROX race:
//   • event_type === 'hyrox'  (DEKA / other don't map to the HYROX level bands)
//   • format === 'singles'    (doubles/relay are TEAM times, not an individual
//                              benchmark — excluded)
//   • result_time_seconds present (a finish, not a future objective)
// Source-agnostic on purpose: the onboarding self-declared HYROX time is stored
// as a benchmark / a `planned` race with NO result, so it never appears here —
// only genuinely completed races (imported from hyresult/hyrox, or coach-logged)
// do. "Real beats declared" therefore holds without a source filter.
//
// Built on listAthletePastRaces so the two readers share ONE projection.
// ─────────────────────────────────────────────────────────────────────────────

export type BestRealHyroxResult = {
  /** Fastest real HYROX singles finish, in seconds (null when none exists). */
  best_time_seconds: number | null;
  /** How many real HYROX singles results the athlete has (0 when none). */
  race_count: number;
  /** The race that produced the best time, for display/"por qué" (null when none). */
  best_race: { name: string; race_date: string | null } | null;
};

/** Pure: pick the best real HYROX singles result from an already-loaded past
 *  list (so callers that already have it don't re-query). The single definition
 *  of "real HYROX result" — every caller routes through this. */
export function pickBestRealHyrox(past: RaceHistoryItem[]): BestRealHyroxResult {
  const hyroxSingles = past.filter(
    (r) =>
      r.event_type === 'hyrox' &&
      r.format === 'singles' &&
      r.result_time_seconds != null &&
      r.result_time_seconds > 0,
  );
  if (hyroxSingles.length === 0) {
    return { best_time_seconds: null, race_count: 0, best_race: null };
  }
  const best = hyroxSingles.reduce((a, b) =>
    (a.result_time_seconds as number) <= (b.result_time_seconds as number) ? a : b,
  );
  return {
    best_time_seconds: best.result_time_seconds,
    race_count: hyroxSingles.length,
    best_race: { name: best.name, race_date: best.race_date },
  };
}

export async function getBestRealHyroxResult(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<BestRealHyroxResult> {
  return pickBestRealHyrox(await listAthletePastRaces(athlete_id, client));
}

/** Real HYROX race count → the tier function's `hyrox_experience` bucket. */
export function hyroxExperienceFromCount(count: number): 'none' | '1-2' | '3+' {
  if (count >= 3) return '3+';
  if (count >= 1) return '1-2';
  return 'none';
}

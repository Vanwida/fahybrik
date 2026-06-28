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

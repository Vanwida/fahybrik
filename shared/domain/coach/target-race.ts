import type { Sql } from 'postgres';
import { isoDateString, startOfDayInBox } from '../dates';
import type {
  RaceEventType,
  RaceFormat,
  RaceDivision,
  RaceGender,
  RacePriority,
} from '../../schema/races';

// ─────────────────────────────────────────────────────────────────────────────
// TARGET RACE — the single source of truth for "días a carrera objetivo".
//
// The athlete's target is the soonest UPCOMING race with priority='target'
// (status planned/registered) on the unified `races` spine — NOT a separate
// catalog pin. This replaces the legacy event-pin (athlete target) reads at
// priority 'A', which were dead: nothing wrote that table on the web/onboarding path
// (the real objective is created in `races`), so every "días a carrera A" metric
// resolved null.
//
// Predicate is identical to web `getTargetRace` (lib/races/next-race.ts) — that
// function now delegates here so the countdown and the metric share ONE query.
// "today" resolves in the box tz (Europe/Madrid), matching every other countdown
// in the app; `days_until` = race_date - today (0 = today, never negative since
// we filter to upcoming).
// ─────────────────────────────────────────────────────────────────────────────

export type TargetRaceRow = {
  /** races.id of the target race. */
  race_id: number;
  name: string;
  /** races.event_id → shared catalog link (null until linked, phase 2). */
  event_id: number | null;
  event_type: RaceEventType;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  priority: RacePriority;
  age_group: string | null;
  /** YYYY-MM-DD — always present (filtered to upcoming). */
  race_date: string;
  location: string | null;
  goal_time_seconds: number | null;
  /** race_date - today (>= 0). */
  days_until: number;
};

/**
 * The athlete's soonest UPCOMING target race, or null when none is scheduled.
 * Single-row form used by every per-athlete reader (microciclo, macro-progress,
 * IA context, deep-dive, resumen, intake, profile shell). Batch/cohort readers
 * inline the same predicate over many athletes (a DISTINCT ON shape that doesn't
 * fit a single-row call).
 */
export async function getTargetRaceRow(
  athlete_id: number | bigint,
  client: Sql,
  on_date?: Date,
): Promise<TargetRaceRow | null> {
  const todayIso = isoDateString(startOfDayInBox(on_date ?? new Date()));

  const rows = await client<
    Array<{
      race_id: number;
      name: string;
      event_id: number | null;
      event_type: RaceEventType;
      format: RaceFormat;
      division: RaceDivision;
      gender_category: RaceGender;
      priority: RacePriority;
      age_group: string | null;
      race_date: string;
      location: string | null;
      goal_time_seconds: number | null;
      days_until: number;
    }>
  >`
    select
      r.id::int                                as race_id,
      r.name                                   as name,
      r.event_id::int                          as event_id,
      r.event_type::text                       as event_type,
      r.format::text                           as format,
      r.division::text                         as division,
      r.gender_category::text                  as gender_category,
      r.priority::text                         as priority,
      r.age_group                              as age_group,
      to_char(r.race_date, 'YYYY-MM-DD')       as race_date,
      r.location                               as location,
      r.goal_time_seconds                      as goal_time_seconds,
      (r.race_date - ${todayIso}::date)::int   as days_until
    from races r
    where r.athlete_id = ${athlete_id as number}
      and r.race_date >= ${todayIso}::date
      and r.status in ('planned', 'registered')
      and r.priority = 'target'
    order by r.race_date asc, r.id asc
    limit 1
  `;

  return rows[0] ?? null;
}

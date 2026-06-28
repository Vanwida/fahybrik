import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import type {
  NextRace,
  RaceEventType,
  RaceFormat,
  RaceDivision,
  RaceGender,
  RacePriority,
  RaceSummary,
  UpcomingRace,
} from '@fahybrid/shared/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Races — single source of truth for "the athlete's next / target race".
//
// Two distinct lookups, both over UPCOMING races only (race_date >= today in the
// box timezone) with status in ('planned','registered') — a 'completed' race is
// in the past relative to the countdown and never surfaces:
//
//   getNextRace(athlete)   → soonest upcoming race of ANY priority. This is the
//                            chronological "next thing on the calendar" — it can
//                            be a tune_up that lands before the target.
//   getTargetRace(athlete) → soonest upcoming race with priority='target'. This
//                            is the GOAL the plan peaks/tapers to (the main
//                            countdown). May equal getNextRace when the target
//                            is also the soonest.
//
// "today" resolves in Europe/Madrid (box tz), matching every other day/countdown
// calc in the app — never UTC, or 00:00–02:00 BCN would shift the day.
// `days_until` = race_date - today (0 = today; never negative since we filter to
// upcoming).
// ─────────────────────────────────────────────────────────────────────────────

interface RaceRow {
  name: string;
  event_type: RaceEventType;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  priority: RacePriority;
  age_group: string | null;
  race_date: string; // YYYY-MM-DD
  location: string | null;
  goal_time_seconds: number | null;
  days_until: number;
}

/** Soonest upcoming race of ANY priority (chronological next). */
export async function getNextRace(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<NextRace | null> {
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  // Ordering by race_date then id makes the pick deterministic when two races
  // share a date. (The TARGET variant lives in the shared getTargetRaceRow so
  // the countdown + the "días a carrera objetivo" metric share one predicate.)
  const rows = await client<RaceRow[]>`
    select
      r.name,
      r.event_type::text as event_type,
      r.format::text as format,
      r.division::text as division,
      r.gender_category::text as gender_category,
      r.priority::text as priority,
      r.age_group,
      to_char(r.race_date, 'YYYY-MM-DD') as race_date,
      r.location,
      r.goal_time_seconds,
      (r.race_date - ${todayIso}::date)::int as days_until
    from races r
    where r.athlete_id = ${athlete_id as number}
      and r.race_date >= ${todayIso}::date
      and r.status in ('planned', 'registered')
    order by r.race_date asc, r.id asc
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    name: row.name,
    event_type: row.event_type,
    format: row.format,
    division: row.division,
    gender_category: row.gender_category,
    priority: row.priority,
    age_group: row.age_group,
    race_date: row.race_date,
    location: row.location,
    goal_time_seconds: row.goal_time_seconds,
    days_until: row.days_until,
  };
}

interface UpcomingRaceRow extends RaceRow {
  id: string;
  event_id: string | null;
}

/**
 * ALL upcoming races (not just the soonest) — the athlete's full list of future
 * objectives for GET /api/athlete/races. Same predicate as getNextRace
 * (race_date >= today-in-box, status in planned/registered) PLUS
 * result_time_seconds is null, so a future-dated row that already has a result
 * (an early-logged finish) drops to `past` instead of double-counting here.
 * Ordered race_date ASC, id ASC; carries race_id + the catalog event_id so the
 * list can open/badge each entry. Uses the SAME "today" calc as getNextRace so
 * every countdown in the app agrees.
 */
export async function getUpcomingRaces(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<UpcomingRace[]> {
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  const rows = await client<UpcomingRaceRow[]>`
    select
      r.id::text,
      r.event_id::text as event_id,
      r.name,
      r.event_type::text as event_type,
      r.format::text as format,
      r.division::text as division,
      r.gender_category::text as gender_category,
      r.priority::text as priority,
      r.age_group,
      to_char(r.race_date, 'YYYY-MM-DD') as race_date,
      r.location,
      r.goal_time_seconds,
      (r.race_date - ${todayIso}::date)::int as days_until
    from races r
    where r.athlete_id = ${athlete_id as number}
      and r.race_date >= ${todayIso}::date
      and r.status in ('planned', 'registered')
      and r.result_time_seconds is null
    order by r.race_date asc, r.id asc
  `;

  return rows.map((row) => ({
    race_id: Number(row.id),
    event_id: row.event_id != null ? Number(row.event_id) : null,
    name: row.name,
    event_type: row.event_type,
    format: row.format,
    division: row.division,
    gender_category: row.gender_category,
    priority: row.priority,
    age_group: row.age_group,
    race_date: row.race_date,
    location: row.location,
    goal_time_seconds: row.goal_time_seconds,
    days_until: row.days_until,
  }));
}

/**
 * Soonest upcoming race with priority='target' (the goal the plan peaks to).
 * Delegates to the shared getTargetRaceRow — the SINGLE source for the target
 * race — so this countdown and the coach "días a carrera objetivo" metric never
 * diverge.
 */
export async function getTargetRace(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<NextRace | null> {
  const row = await getTargetRaceRow(athlete_id, client);
  if (!row) return null;

  return {
    name: row.name,
    event_type: row.event_type,
    format: row.format,
    division: row.division,
    gender_category: row.gender_category,
    priority: row.priority,
    age_group: row.age_group,
    race_date: row.race_date,
    location: row.location,
    goal_time_seconds: row.goal_time_seconds,
    days_until: row.days_until,
  };
}

const EVENT_TYPE_LABEL: Record<RaceEventType, string> = {
  hyrox: 'HYROX',
  deka: 'DEKA',
  other: 'Race',
};
const FORMAT_LABEL: Record<RaceFormat, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  relay: 'Relay',
};
const DIVISION_LABEL: Record<RaceDivision, string> = {
  open: 'Open',
  pro: 'Pro',
  elite: 'Elite',
};
const GENDER_LABEL: Record<RaceGender, string> = {
  men: 'Men',
  women: 'Women',
  mixed: 'Mixed',
};

/** "HYROX · Singles · Open · Men" — one-line category chip for coach surfaces. */
export function raceCategoryLabel(race: NextRace): string {
  return [
    EVENT_TYPE_LABEL[race.event_type],
    FORMAT_LABEL[race.format],
    DIVISION_LABEL[race.division],
    GENDER_LABEL[race.gender_category],
  ].join(' · ');
}

/** Compact summary (name + priority + days_until + category) for list/ficha headers. */
export function toRaceSummary(race: NextRace): RaceSummary {
  return {
    name: race.name,
    priority: race.priority,
    days_until: race.days_until,
    category: raceCategoryLabel(race),
  };
}

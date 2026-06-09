import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  NextRace,
  RaceEventType,
  RaceFormat,
  RaceDivision,
  RaceGender,
  RacePriority,
  RaceStatus,
} from '@fahybrid/shared/schema';
import { getNextRace, getTargetRace } from './next-race';

// IDs are serialized as strings over the wire (bigint → string), matching every
// other coach payload in the app. This is the JSON-projection of the `Race`
// schema with string ids.
export interface RaceListItem {
  id: string;
  athlete_id: string;
  created_by_coach_id: string | null;
  name: string;
  event_type: RaceEventType;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  priority: RacePriority;
  age_group: string | null;
  race_date: string;
  location: string | null;
  goal_time_seconds: number | null;
  result_time_seconds: number | null;
  status: RaceStatus;
  created_at: string;
  updated_at: string;
}

export class CoachRacesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CoachRacesError';
  }
}

export interface AthleteRacesPayload {
  athlete_id: string;
  // The goal race the plan peaks to (next upcoming priority='target'), null if none.
  target_race: NextRace | null;
  // The soonest upcoming race of ANY priority (may be an intermediate tune_up).
  next_race: NextRace | null;
  // Full race calendar (newest race_date first) so the ficha can render the
  // calendar with priority badges + past results.
  races: RaceListItem[];
}

interface DbRaceRow {
  id: string;
  athlete_id: string;
  created_by_coach_id: string | null;
  name: string;
  event_type: RaceEventType;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  priority: RacePriority;
  age_group: string | null;
  race_date: string;
  location: string | null;
  goal_time_seconds: number | null;
  result_time_seconds: number | null;
  status: RaceStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Coach-gated read of an athlete's races: the full calendar + the next/target
 * race. Ownership is enforced (the athlete must belong to `coach_id`), 404 if
 * not — never leak another coach's athletes. Reuses getNextRace / getTargetRace
 * (single source of truth for the countdown logic).
 */
export async function getAthleteRacesForCoach(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteRacesPayload> {
  const client = params.client ?? defaultSql;

  const owner = await client<Array<{ id: string }>>`
    select a.id::text
    from athletes a
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!owner[0]) {
    throw new CoachRacesError('not_found', 'Atleta no encontrado', 404);
  }

  const rows = await client<DbRaceRow[]>`
    select
      r.id::text,
      r.athlete_id::text,
      r.created_by_coach_id::text as created_by_coach_id,
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
      r.result_time_seconds,
      r.status::text as status,
      to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
      to_char(r.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from races r
    where r.athlete_id = ${params.athlete_id}
    order by r.race_date desc, r.id desc
  `;

  const [target_race, next_race] = await Promise.all([
    getTargetRace(params.athlete_id, client),
    getNextRace(params.athlete_id, client),
  ]);

  return {
    athlete_id: owner[0].id,
    target_race,
    next_race,
    races: rows.map((r) => ({
      id: r.id,
      athlete_id: r.athlete_id,
      created_by_coach_id: r.created_by_coach_id,
      name: r.name,
      event_type: r.event_type,
      format: r.format,
      division: r.division,
      gender_category: r.gender_category,
      priority: r.priority,
      age_group: r.age_group,
      race_date: r.race_date,
      location: r.location,
      goal_time_seconds: r.goal_time_seconds,
      result_time_seconds: r.result_time_seconds,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  };
}

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  NextRace,
  RaceHistoryItem,
  UpcomingRace,
} from '@fahybrid/shared/schema';
import { getTargetRace, getUpcomingRaces } from './next-race';
import { listAthletePastRaces } from './athlete-races';

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

// The coach's view of one athlete's races — the SAME upcoming/past split the
// athlete's Carreras hub renders (GET /api/athlete/races), plus the single
// `target_race` the periodization card anchors to. We reuse the exact projections
// (getUpcomingRaces / listAthletePastRaces) so the coach and athlete surfaces can
// never drift: `upcoming` carries the priority + live countdown for every future
// objective; `past` is the rich raceHistoryItemSchema (result, percentile,
// doubles teammates from race_partners, HYROX splits).
export interface AthleteRacesPayload {
  athlete_id: string;
  // The goal race the plan peaks to (soonest upcoming priority='target'), null if
  // none. Kept distinct so the Perfil "Carrera objetivo" card needs no derivation.
  target_race: NextRace | null;
  // Every future objective (target + secondary/tune-up), soonest-first.
  upcoming: UpcomingRace[];
  // Imported/finished races (results + expired objectives), newest-first.
  past: RaceHistoryItem[];
}

/**
 * Coach-gated read of an athlete's races. Ownership is enforced (the athlete must
 * belong to `coach_id`), 404 if not — never leak another coach's athletes. Reads
 * are delegated to the single-source projections shared with the athlete endpoint
 * (getTargetRace / getUpcomingRaces / listAthletePastRaces), so the two surfaces
 * stay byte-symmetric.
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

  const [target_race, upcoming, past] = await Promise.all([
    getTargetRace(params.athlete_id, client),
    getUpcomingRaces(params.athlete_id, client),
    listAthletePastRaces(params.athlete_id, client),
  ]);

  return {
    athlete_id: owner[0].id,
    target_race,
    upcoming,
    past,
  };
}

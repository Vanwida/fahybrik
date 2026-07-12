// GET /api/athlete/dobles/race-gap?race_id={id}
//
// The authenticated athlete's DOUBLES "camino al objetivo" for one of their
// doubles races: the pair's predicted total vs the goal, decomposed segment by
// segment with the reparto (who carries each station), plus the coach's editable
// consejos de dobles. Mirrors the iOS DoblesRaceGap contract (snake_case; the
// numbers are numbers). Honest gates: no_pair / no_data / partial / ok.
//
// Auth: athlete bearer (same as the other /api/athlete/dobles/* endpoints).
//   · absent/invalid bearer → 401
//   · race_id missing/not a number → 400
//   · race not the athlete's → 404 (indistinguishable from missing)
//   · race is not a doubles race → 400

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import { buildDoblesRaceGap, type DoblesRaceContext } from '@/lib/athlete/dobles-gap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RaceRow {
  id: number;
  name: string;
  race_date: string | null;
  format: string;
  division: string;
  gender_category: string;
  goal_time_seconds: number | null;
}

async function loadOwnedRace(
  race_id: number,
  athlete_id: number,
  client: Sql,
): Promise<RaceRow | null> {
  const rows = await client<RaceRow[]>`
    select
      id::int as id,
      name,
      to_char(race_date, 'YYYY-MM-DD') as race_date,
      format::text as format,
      division::text as division,
      gender_category::text as gender_category,
      goal_time_seconds
    from races
    where id = ${race_id} and athlete_id = ${athlete_id}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const raceIdRaw = new URL(request.url).searchParams.get('race_id');
  const race_id = raceIdRaw != null ? Number(raceIdRaw) : NaN;
  if (!Number.isInteger(race_id) || race_id <= 0) {
    return jsonError('bad_request', 'race_id inválido', 400);
  }

  const race = await loadOwnedRace(race_id, Number(auth.athlete_id), sql);
  if (!race) return jsonError('not_found', 'Carrera no encontrada', 404);
  if (race.format !== 'doubles') {
    return jsonError('bad_request', 'La carrera no es de dobles', 400);
  }

  const context: DoblesRaceContext = {
    race_id: race.id,
    name: race.name,
    race_date: race.race_date,
    division: race.division,
    gender_category: race.gender_category,
    goal_time_seconds: race.goal_time_seconds,
  };

  const board = await buildDoblesRaceGap({
    self_athlete_id: auth.athlete_id,
    self_user_id: auth.user_id,
    race: context,
  });
  return jsonOk(board);
}

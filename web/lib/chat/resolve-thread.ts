// Resolves the [athlete_id] route param (coach view) or 'me' (athlete view)
// into a concrete thread the principal is authorized to see.

import type { Sql } from '@/lib/db';
import type { ChatPrincipal } from './auth';
import { getOrCreateThreadForAthlete } from './service';

export type ResolvedThread = {
  thread_id: string;
  athlete_id: bigint;
  coach_id: bigint;
};

export async function resolveThread(args: {
  sql: Sql;
  principal: ChatPrincipal;
  athleteIdParam: string;
}): Promise<ResolvedThread | null> {
  const { sql, principal, athleteIdParam } = args;
  if (principal.role === 'athlete') {
    if (athleteIdParam !== 'me' && athleteIdParam !== principal.athlete_id.toString()) {
      // Athlete cannot read other athletes' threads.
      return null;
    }
    const t = await getOrCreateThreadForAthlete({ sql, athlete_id: principal.athlete_id });
    if (!t) return null;
    return { thread_id: t.thread_id, athlete_id: principal.athlete_id, coach_id: t.coach_id };
  }
  // Coach view: must own the cohort the athlete belongs to.
  if (!/^\d+$/.test(athleteIdParam)) return null;
  const athlete_id_num = athleteIdParam;
  const rows = await sql<{ id: string; coach_id: string }[]>`
    select t.id::text, t.coach_id::text
    from chat_threads t
    join athletes a on a.id = t.athlete_id
    where a.id = ${athlete_id_num}::bigint
      and a.coach_id = ${principal.coach_id as unknown as number}
    limit 1
  `;
  if (rows[0]) {
    return {
      thread_id: rows[0].id,
      athlete_id: BigInt(athlete_id_num),
      coach_id: BigInt(rows[0].coach_id),
    };
  }
  // Lazily create thread if athlete is in coach's cohort and has none yet.
  const cohortRows = await sql<{ id: string }[]>`
    select id::text from athletes
    where id = ${athlete_id_num}::bigint
      and coach_id = ${principal.coach_id as unknown as number}
    limit 1
  `;
  if (!cohortRows[0]) return null;
  const t = await getOrCreateThreadForAthlete({ sql, athlete_id: BigInt(athlete_id_num) });
  if (!t) return null;
  return { thread_id: t.thread_id, athlete_id: BigInt(athlete_id_num), coach_id: t.coach_id };
}

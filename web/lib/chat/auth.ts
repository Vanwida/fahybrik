// Chat-specific auth resolver. Chat is the rare endpoint that *both* sides
// can call: coach via cookie session, athlete via bearer token. This helper
// returns whichever is present so route handlers don't need to branch twice.

import { getCoachSession, type CoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer, type AthleteSession } from '@/lib/auth/athlete-session';

export type ChatPrincipal =
  | { role: 'coach'; user_id: bigint; coach_id: bigint }
  | { role: 'athlete'; user_id: bigint; athlete_id: bigint };

export async function resolveChatPrincipal(req: Request): Promise<ChatPrincipal | null> {
  const bearer = req.headers.get('authorization');
  if (bearer) {
    const a: AthleteSession | null = await getAthleteSessionFromBearer(bearer);
    if (a) {
      return { role: 'athlete', user_id: a.user_id, athlete_id: a.athlete_id };
    }
  }
  const c: CoachSession | null = await getCoachSession();
  if (c) {
    return { role: 'coach', user_id: c.user_id, coach_id: c.coach_id };
  }
  return null;
}

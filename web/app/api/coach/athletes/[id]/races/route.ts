import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  getAthleteRacesForCoach,
  CoachRacesError,
} from '@/lib/races/coach-races';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/athletes/[id]/races — coach-gated. Returns the athlete's race
// calendar (full list) plus the next/target race for the countdown header.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  try {
    const payload = await getAthleteRacesForCoach({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk(payload);
  } catch (err) {
    if (err instanceof CoachRacesError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

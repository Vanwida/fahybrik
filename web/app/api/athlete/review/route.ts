import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteReviewState } from '@/lib/citas/reviews';
import { CitasError } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/review — estado de revisión 1:1 del atleta (#21): cadencia, última
// revisión, próxima reservada (la "próxima sesión con Pablo"), propuesta pendiente y due.
export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer de atleta requerido', 401);

  try {
    const state = await getAthleteReviewState({ athlete_id: session.athlete_id });
    return jsonOk(state);
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[GET /api/athlete/review]', err);
    return jsonError('review_state_failed', 'No se pudo cargar el estado de revisión', 500);
  }
}

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listAthleteReviewSlots } from '@/lib/citas/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/review/slots — huecos ofrecidos para que el atleta reserve su
// revisión 1:1 (#21). Bearer-auth (mismo patrón que /api/athlete/partner/unlink).
export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer de atleta requerido', 401);

  try {
    const slots = await listAthleteReviewSlots({ athlete_id: session.athlete_id });
    return jsonOk({ slots });
  } catch (err) {
    console.error('[GET /api/athlete/review/slots]', err);
    return jsonError('review_slots_failed', 'No se pudieron cargar los huecos', 500);
  }
}

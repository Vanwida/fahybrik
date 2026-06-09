import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { checkAndNotifyAtrTransition } from '@/lib/dashboard/coach/atr-transition-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const body = (await request.json().catch(() => ({}))) as { athlete_id?: number | string };
  const athleteIdRaw = body.athlete_id;
  if (athleteIdRaw == null) {
    return jsonError('bad_request', 'athlete_id requerido', 400);
  }
  const athlete_id = Number(athleteIdRaw);
  if (!Number.isFinite(athlete_id) || athlete_id <= 0) {
    return jsonError('bad_request', 'athlete_id inválido', 400);
  }

  // Make sure the athlete belongs to this coach.
  const ownership = await sql<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athlete_id} and coach_id = ${session.coach_id}
    limit 1
  `;
  if (ownership.length === 0) {
    return jsonError('forbidden', 'Atleta no pertenece al coach', 403);
  }

  const outcome = await checkAndNotifyAtrTransition({ athlete_id });
  return jsonOk(outcome);
}

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { checkAndNotifyAtrTransitionsForCoach } from '@/lib/dashboard/coach/atr-transition-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const result = await checkAndNotifyAtrTransitionsForCoach({ coach_id: session.coach_id });
  return jsonOk(result);
}

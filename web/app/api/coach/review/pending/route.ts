import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listPendingWeekAdjustments } from '@/lib/dashboard/coach/week-adjustments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const pending = await listPendingWeekAdjustments({ coach_id: session.coach_id });
  return jsonOk({ pending });
}

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { markAllNotificationsRead } from '@/lib/dashboard/notifications/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const result = await markAllNotificationsRead({ user_id: session.user_id });
  return jsonOk(result);
}

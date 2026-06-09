import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listCoachNotifications, markNotificationRead } from '@/lib/dashboard/notifications/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const data = await listCoachNotifications({ user_id: session.user_id });
  return jsonOk(data);
}

export async function PATCH(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const body = (await request.json()) as { notification_id?: number };
  if (!body.notification_id) {
    return jsonError('bad_request', 'notification_id requerido', 400);
  }

  await markNotificationRead({
    user_id: session.user_id,
    notification_id: body.notification_id,
  });
  return jsonOk({ ok: true });
}

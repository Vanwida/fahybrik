// GET /api/coach/chat/threads
//
// Lists every chat thread the authenticated coach owns, with last-message
// preview, last_message_at, and the coach-side unread counter. Sorted with
// most-recent activity first.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listThreadsForCoach } from '@/lib/dashboard/chat/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const threads = await listThreadsForCoach({ coach_id: session.coach_id });
  return jsonOk({ threads });
}

// POST /api/coach/chat/threads/[threadId]/read
//
// Marks every athlete-authored message in the thread as read and resets the
// coach's unread counter. Idempotent — re-calling returns marked=0.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachThread, markCoachRead } from '@/lib/dashboard/chat/service';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { threadId } = await ctx.params;
  const owned = await getCoachThread({ thread_id: threadId, coach_id: session.coach_id });
  if (!owned) return jsonError('not_found', 'Thread no encontrado', 404);

  const result = await markCoachRead({ thread_id: threadId });
  // Fire-and-forget: marking read clears the message_unanswered signal.
  void recomputeAthlete({ athlete_id: owned.athlete_id }).catch(() => {});
  return jsonOk({ ok: true, ...result });
}

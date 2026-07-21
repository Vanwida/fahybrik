// DELETE /api/chat/threads/[athlete_id]/messages/[message_id]
//
// Author-scoped soft delete: a principal may delete ONLY their own message, and
// only inside a thread they belong to. `athlete_id` is the cohort athlete the
// thread belongs to; the athlete themselves passes 'me'. Ownership + thread
// membership are enforced server-side (never trust the client): the message must
// have been authored by the caller (sender_user_id = principal.user_id) inside
// the resolved thread, or we return 404 (indistinguishable from "not found" so we
// never disclose others' message ids).

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { resolveThread } from '@/lib/chat/resolve-thread';
import { softDeleteOwnMessage } from '@/lib/chat/service';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ athlete_id: string; message_id: string }> };

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  const { athlete_id, message_id } = await ctx.params;
  // message_id is a bigint PK; reject non-numeric before it touches SQL.
  if (!/^\d+$/.test(message_id)) {
    return jsonError('not_found', 'Message not found', 404);
  }

  const thread = await resolveThread({ sql, principal, athleteIdParam: athlete_id });
  if (!thread) return jsonError('not_found', 'Thread not found', 404);

  try {
    const deleted = await softDeleteOwnMessage({
      sql,
      thread_id: thread.thread_id,
      message_id,
      sender_user_id: principal.user_id,
    });
    // Not yours / already gone / wrong thread → 404 (don't disclose existence).
    if (!deleted) return jsonError('not_found', 'Message not found', 404);
    return jsonOk({ ok: true, id: message_id });
  } catch (err) {
    captureRouteError(err, {
      route: 'api/chat/threads/[athlete_id]/messages/[message_id].DELETE',
      meta: {
        thread_id: thread.thread_id,
        sender_role: principal.role,
        sender_user_id: String(principal.user_id),
        message_id,
      },
    });
    return jsonError('internal', 'Delete message failed', 500);
  }
}

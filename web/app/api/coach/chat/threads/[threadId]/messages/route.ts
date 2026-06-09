// GET  /api/coach/chat/threads/[threadId]/messages?since=<ISO>
// POST /api/coach/chat/threads/[threadId]/messages   body { body: string }
//
// GET: polling-friendly delta query. With `since`, returns messages strictly
// newer than that timestamp in ASC order. Without, returns the last 50 in
// ASC order (so the iOS list renders chronologically without reversing).
//
// POST: inserts a coach-authored message. Always sender_role='coach'.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sinceQuerySchema, sendCoachMessageSchema } from '@/lib/dashboard/chat/schema';
import {
  getCoachThread,
  inferSenderRoles,
  loadMessages,
  sendCoachMessage,
} from '@/lib/dashboard/chat/service';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { threadId } = await ctx.params;
  const owned = await getCoachThread({ thread_id: threadId, coach_id: session.coach_id });
  if (!owned) return jsonError('not_found', 'Thread no encontrado', 404);

  const url = new URL(req.url);
  const parsed = sinceQuerySchema.safeParse({
    since: url.searchParams.get('since') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('bad_request', 'Query inválida', 400, parsed.error.flatten());
  }

  const messages = await loadMessages({
    thread_id: threadId,
    since: parsed.data.since ?? null,
    limit: parsed.data.limit,
  });
  const withRoles = await inferSenderRoles({ thread_id: threadId, messages });
  return jsonOk({ thread_id: threadId, messages: withRoles });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { threadId } = await ctx.params;
  const owned = await getCoachThread({ thread_id: threadId, coach_id: session.coach_id });
  if (!owned) return jsonError('not_found', 'Thread no encontrado', 404);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('invalid_json', 'JSON inválido', 400);
  }
  const parsed = sendCoachMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'Mensaje inválido', 400, parsed.error.flatten());
  }

  try {
    const message = await sendCoachMessage({
      thread_id: threadId,
      coach_user_id: session.user_id,
      body: parsed.data.body,
    });
    return jsonOk({ message }, 201);
  } catch (err) {
    captureRouteError(err, {
      route: 'api/coach/chat/threads/[threadId]/messages.POST',
      meta: { thread_id: threadId, coach_user_id: session.user_id },
    });
    return jsonError('internal', 'Send message failed', 500);
  }
}

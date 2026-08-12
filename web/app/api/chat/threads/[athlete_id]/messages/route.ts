// GET /api/chat/threads/[athlete_id]/messages   — paginated, 50/page, cursor-based
// POST /api/chat/threads/[athlete_id]/messages  — send message
//
// athlete_id is the cohort athlete the thread belongs to. When called by the
// athlete themselves, 'me' is accepted as a synonym for their own id.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { resolveThread } from '@/lib/chat/resolve-thread';
import { resolveMessageContext } from '@/lib/chat/context';
import { listMessages, sendMessage } from '@/lib/chat/service';
import { sendMessageSchema } from '@/lib/chat/schema';
import { captureRouteError } from '@/lib/observability/capture';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ athlete_id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }
  const { athlete_id } = await ctx.params;
  const thread = await resolveThread({ sql, principal, athleteIdParam: athlete_id });
  if (!thread) return jsonError('not_found', 'Thread not found', 404);

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

  const result = await listMessages({
    sql,
    thread_id: thread.thread_id,
    cursor,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return jsonOk({ thread_id: thread.thread_id, ...result });
}

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  // A1: anti-spam — cap messages per sender.
  const rl = await withRateLimit({
    scope: 'user',
    identifier: principal.user_id.toString(),
    ...RATE_LIMITS.chatSend,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { athlete_id } = await ctx.params;
  const thread = await resolveThread({ sql, principal, athleteIdParam: athlete_id });
  if (!thread) return jsonError('not_found', 'Thread not found', 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid message', 400, parsed.error.flatten());
  }

  // El contexto es SIEMPRE relativo al atleta dueño del hilo (nunca al
  // remitente — un coach puede abrir el contexto de un entreno de SU
  // atleta). Inexistente y ajeno resuelven a `null` por igual (ver
  // `resolveMessageContext`), así que los dos reciben el MISMO 400 — la API
  // nunca revela cuál de los dos ocurrió.
  const context = parsed.data.context
    ? await resolveMessageContext({
        sql,
        athlete_id: thread.athlete_id,
        coach_id: thread.coach_id,
        input: parsed.data.context,
      })
    : null;
  if (parsed.data.context && !context) {
    return jsonError('invalid_context', 'Context reference not found', 400);
  }

  try {
    const message = await sendMessage({
      sql,
      thread_id: thread.thread_id,
      sender_user_id: principal.user_id,
      sender_role: principal.role,
      input: parsed.data,
      context,
    });
    return jsonOk({ message }, 201);
  } catch (err) {
    captureRouteError(err, {
      route: 'api/chat/threads/[athlete_id]/messages.POST',
      meta: {
        thread_id: thread.thread_id,
        sender_role: principal.role,
        sender_user_id: String(principal.user_id),
      },
    });
    return jsonError('internal', 'Send message failed', 500);
  }
}

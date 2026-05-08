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
import { listMessages, sendMessage } from '@/lib/chat/service';
import { sendMessageSchema } from '@/lib/chat/schema';

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

  const message = await sendMessage({
    sql,
    thread_id: thread.thread_id,
    sender_user_id: principal.user_id,
    sender_role: principal.role,
    input: parsed.data,
  });
  return jsonOk({ message }, 201);
}

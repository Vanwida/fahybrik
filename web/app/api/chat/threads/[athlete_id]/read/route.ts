// POST /api/chat/threads/[athlete_id]/read
//
// Mark messages read up to a given message_id and reset the per-side unread
// counter for the calling principal. Idempotent.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { resolveThread } from '@/lib/chat/resolve-thread';
import { markRead } from '@/lib/chat/service';
import { markReadSchema } from '@/lib/chat/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ athlete_id: string }> };

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
  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request', 400, parsed.error.flatten());
  }
  const result = await markRead({
    sql,
    thread_id: thread.thread_id,
    reader_role: principal.role,
    up_to_message_id: parsed.data.up_to_message_id,
  });
  return jsonOk({ ok: true, ...result });
}

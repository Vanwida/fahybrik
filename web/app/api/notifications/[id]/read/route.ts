// PATCH /api/notifications/[id]/read
//
// Mark a single notification as read. Idempotent. Verifies ownership.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  let user_id: bigint | null = null;
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (athlete) user_id = athlete.user_id;
  if (!user_id) {
    const coach = await getCoachSession();
    if (coach) user_id = coach.user_id;
  }
  if (!user_id) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError('invalid_id', 'Invalid notification id', 400);

  const updated = await sql<{ id: string }[]>`
    update notifications
    set read_at = coalesce(read_at, now())
    where id = ${id}::bigint
      and user_id = ${user_id as unknown as number}
    returning id::text
  `;
  if (!updated[0]) return jsonError('not_found', 'Notification not found', 404);
  return jsonOk({ ok: true, id: updated[0].id });
}

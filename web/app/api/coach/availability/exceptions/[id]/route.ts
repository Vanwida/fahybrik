// DELETE /api/coach/availability/exceptions/[id] — unblock a previously-blocked day.
// Scoped: another coach's day (or a missing id) → the same 404.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { removeException } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError('invalid_id', 'id inválido', 400);

  const removed = await removeException(session.coach_id, BigInt(id));
  if (!removed) return jsonError('not_found', 'Día no encontrado', 404);
  return jsonOk({ ok: true });
}

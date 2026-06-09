// DELETE /api/athlete/nutrition/[id] — remove one of the athlete's own entries.
//
// Ownership is enforced in the SQL WHERE clause (athlete_id = session). A
// foreign or non-existent id deletes nothing → we return 404 (NOT 403), so the
// endpoint never leaks whether some other athlete's id exists.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { deleteNutritionEntry } from '@/lib/nutrition/entries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const { id } = await ctx.params;
  const entryId = parseId(id);
  if (entryId == null) return jsonError('invalid_id', 'id must be a positive integer', 400);

  try {
    const deleted = await deleteNutritionEntry({ athlete_id: athlete.athlete_id, id: entryId });
    if (!deleted) return jsonError('not_found', 'Entry not found', 404);
    return jsonOk({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/athlete/nutrition/[id]]', err);
    return jsonError('delete_failed', 'No se pudo eliminar la comida.', 500);
  }
}

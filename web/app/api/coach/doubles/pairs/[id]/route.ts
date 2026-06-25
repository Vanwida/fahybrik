import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  dissolveDoublesPair,
  DoublesPairError,
} from '@/lib/dashboard/coach/doubles-pairs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePairId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// DELETE /api/coach/doubles/pairs/[id] — dissolve an active pair (coach-owned).
// Athletes keep whatever plan was already assigned; only the coordination ends.
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const pairId = parsePairId(id);
  if (pairId == null) return jsonError('bad_request', 'ID de pareja inválido', 400);

  try {
    await dissolveDoublesPair({ coach_id: session.coach_id, pair_id: pairId });
    return jsonOk({ dissolved: true });
  } catch (err) {
    if (err instanceof DoublesPairError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { rollbackAdjustment } from '@/lib/coach/mass-adjustments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError('invalid_request', 'Invalid adjustment id', 400);
  }

  const result = await rollbackAdjustment({
    coach_id: auth.session.coach_id,
    rolled_back_by_user_id: auth.session.user_id,
    adjustment_id: id,
  });
  if (!result.ok) {
    if (result.reason === 'not_found') {
      return jsonError('not_found', 'Adjustment not found', 404);
    }
    if (result.reason === 'already_rolled_back') {
      return jsonError('conflict', 'Adjustment already rolled back', 409);
    }
    if (result.reason === 'rollback_window_expired') {
      return jsonError('expired', 'Rollback window expired (7 days)', 410);
    }
    return jsonError('error', 'Rollback failed', 500);
  }
  return jsonOk({ ok: true });
}

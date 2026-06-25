import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  approveWeekAdjustment,
  rejectWeekAdjustment,
  WeekAdjustmentError,
} from '@/lib/dashboard/coach/week-adjustments';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string; proposalId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, proposalId } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  try {
    await approveWeekAdjustment({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      proposal_id: Number(proposalId),
    });
    // Fire-and-forget: approving clears the week_adjustment_pending signal.
    void recomputeAthlete({ athlete_id: Number(parsedId.data.id) }).catch(() => {});
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof WeekAdjustmentError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

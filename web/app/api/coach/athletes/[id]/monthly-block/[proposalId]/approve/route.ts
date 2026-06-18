import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  MonthlyBlockError,
  approveMonthlyBlockProposal,
} from '@/lib/dashboard/coach/monthly-block-proposal';
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
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  const numericProposalId = Number(proposalId);
  if (!Number.isFinite(numericProposalId) || numericProposalId <= 0) {
    return jsonError('bad_request', 'ID de propuesta inválido', 400);
  }

  try {
    const result = await approveMonthlyBlockProposal({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      proposal_id: numericProposalId,
    });
    // Fire-and-forget: approving clears monthly_block_pending / programming gaps.
    void recomputeAthlete({ athlete_id: Number(parsedId.data.id) }).catch(() => {});
    return jsonOk(result);
  } catch (err) {
    if (err instanceof MonthlyBlockError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

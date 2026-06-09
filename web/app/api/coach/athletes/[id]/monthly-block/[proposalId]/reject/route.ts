import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  MonthlyBlockError,
  rejectMonthlyBlockProposal,
} from '@/lib/dashboard/coach/monthly-block-proposal';

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
    const result = await rejectMonthlyBlockProposal({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      proposal_id: numericProposalId,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof MonthlyBlockError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

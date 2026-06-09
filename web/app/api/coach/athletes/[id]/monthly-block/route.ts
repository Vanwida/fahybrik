import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  MonthlyBlockError,
  loadPendingMonthlyBlock,
  proposeNextMonthlyBlock,
} from '@/lib/dashboard/coach/monthly-block-proposal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  const pending = await loadPendingMonthlyBlock({ athlete_id: Number(parsedId.data.id) });
  return jsonOk({ proposal: pending });
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  try {
    const proposal = await proposeNextMonthlyBlock({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk({ proposal });
  } catch (err) {
    if (err instanceof MonthlyBlockError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

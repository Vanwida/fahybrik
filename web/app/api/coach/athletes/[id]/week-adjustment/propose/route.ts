import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  proposeWeekAdjustment,
  WeekAdjustmentError,
} from '@/lib/dashboard/coach/weekly-evaluation';
import { weekAdjustmentProposeInputSchema } from '@fahybrid/shared/schema/week-adjustment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = weekAdjustmentProposeInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const proposal = await proposeWeekAdjustment({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      week_start: parsed.data.week_start,
    });
    return jsonOk({ proposal });
  } catch (err) {
    if (err instanceof WeekAdjustmentError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

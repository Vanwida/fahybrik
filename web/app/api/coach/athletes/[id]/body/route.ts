import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  buildAthleteBody,
  AthleteAnalyticsError,
} from '@/lib/dashboard/coach/deep-dive-body';

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
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  try {
    const body = await buildAthleteBody({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk({ body });
  } catch (err) {
    if (err instanceof AthleteAnalyticsError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

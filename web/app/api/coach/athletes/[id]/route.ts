import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  buildAthleteDeepDive,
  AthleteDeepDiveError,
} from '@/lib/coach/athlete-deep-dive';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  const { id } = await ctx.params;
  const parsed = AthleteIdParamSchema.safeParse({ id });
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid athlete id', 400, parsed.error.flatten());
  }

  try {
    const payload = await buildAthleteDeepDive({
      coach_id: session.coach_id,
      athlete_id: parsed.data.id,
    });
    return jsonOk({ deep_dive: payload });
  } catch (err) {
    if (err instanceof AthleteDeepDiveError) {
      const status = err.code === 'forbidden' ? 403 : 404;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}

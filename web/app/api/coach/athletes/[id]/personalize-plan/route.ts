import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  PersonalizePlanError,
  personalizePlanForAthlete,
} from '@/lib/dashboard/coach/personalize-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/personalize-plan
// Forks the athlete's CURRENT microciclo (from the week they're living onward)
// into a personal plan for just them, detaches them from the level×días
// sequence, and re-materializes so the fork is live immediately — no body.
// See lib/dashboard/coach/personalize-plan.ts for the full mechanism.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  try {
    const result = await personalizePlanForAthlete({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk({ personalize: result });
  } catch (err) {
    if (err instanceof PersonalizePlanError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

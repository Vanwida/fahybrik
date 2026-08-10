import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  RevertPersonalPlanError,
  revertPersonalPlanForAthlete,
} from '@/lib/dashboard/coach/revert-personal-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/revert-to-sequence
// La inversa de /personalize-plan: reactiva la secuencia (nivel×días) justo
// donde el atleta se quedó y retira el plan personal — sin body. Solo aplica
// cuando el plan personal actual viene de forkear la periodización (hay un
// athlete_sequence_progress en 'detached'); si se creó desde cero, no hay
// secuencia a la que volver y esto devuelve un 409 claro. Ver
// revert-personal-plan.ts para el mecanismo completo.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  try {
    const result = await revertPersonalPlanForAthlete({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk({ revert: result });
  } catch (err) {
    if (err instanceof RevertPersonalPlanError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

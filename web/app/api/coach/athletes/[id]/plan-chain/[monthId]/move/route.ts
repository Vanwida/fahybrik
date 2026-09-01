import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  PersonalChainError,
  movePersonalTramoInChain,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { coachActor } from '@/lib/audit/record-edit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/plan-chain/[monthId]/move
// Intercambia este microciclo personal con su vecino inmediato: { direction:
// 'up' | 'down' }. Ninguno de los dos se mueve si cualquiera de los dos ya
// tiene sesiones ejecutadas (409).
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; monthId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, monthId } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);
  const month_template_id = Number(monthId);
  if (!Number.isFinite(month_template_id) || month_template_id <= 0) {
    return jsonError('bad_request', 'ID de microciclo inválido', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'Body JSON inválido', 400);
  }

  try {
    const result = await movePersonalTramoInChain({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_template_id,
      payload: body,
      actor: coachActor(session),
    });
    return jsonOk({ move: result });
  } catch (err) {
    if (err instanceof PersonalChainError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

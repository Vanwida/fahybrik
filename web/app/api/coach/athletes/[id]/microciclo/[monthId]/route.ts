import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  ProgramMonthError,
  deletePersonalPlanForAthlete,
} from '@/lib/dashboard/coach/personal-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/coach/athletes/[id]/microciclo/[monthId]
// Borra UN plan personal de este atleta por completo: sus sesiones pendientes,
// los microciclos que se quedan vacíos, el recibo (athlete_month_assignments) y
// la plantilla + semanas propias. Cualquier sesión ya EJECUTADA (completed, o
// con una workout_executions real) sobrevive siempre, huérfana de plan pero
// intacta en el historial — nunca se niega el borrado por tener historial, se
// limita a lo pendiente. Ver retirePersonalPlan (lib/dashboard/coach/personal-
// plans.ts) para el mecanismo completo y el porqué.
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; monthId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, monthId } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  const month_template_id = Number(monthId);
  if (!Number.isFinite(month_template_id) || month_template_id <= 0) {
    return jsonError('bad_request', 'ID de plan inválido', 400);
  }

  try {
    const result = await deletePersonalPlanForAthlete({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_template_id,
    });
    return jsonOk({ deleted: result });
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo borrar el plan personal';
    return jsonError('internal_error', message, 500);
  }
}

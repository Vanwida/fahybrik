// DELETE /api/coach/program-months/[id]/weeks/[weekId]
// Quita UNA semana de su microciclo: desengancha la junction y compacta las
// posiciones siguientes (sin huecos). Borra la program_week_templates que
// queda huérfana. El caso real que motivó esto: duplicar una semana varias
// veces por error y no tener forma de deshacerlo. Coach-ownership gated.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  removeWeekFromMonth,
  ProgramMonthError,
} from '@/lib/dashboard/coach/program-months';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; weekId: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id, weekId } = await ctx.params;
  const monthId = Number(id);
  const weekTemplateId = Number(weekId);
  if (!Number.isFinite(monthId) || !Number.isFinite(weekTemplateId)) {
    return jsonError('bad_request', 'Identificador inválido', 400);
  }

  try {
    await removeWeekFromMonth({
      coach_id: auth.session.coach_id,
      month_id: monthId,
      week_id: weekTemplateId,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

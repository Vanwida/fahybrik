// POST /api/coach/program-months/[id]/weeks/[weekId]/duplicate
// Duplica una semana DENTRO de su microciclo: clona la semana (slots_json
// entero) y la engancha justo después de la origen. Clon puro (sin progresión,
// sin fechas; exercise_id preservado). Coach-ownership gated.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  duplicateWeekIntoMonth,
  ProgramMonthError,
} from '@/lib/dashboard/coach/program-months';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
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
    const result = await duplicateWeekIntoMonth({
      coach_id: auth.session.coach_id,
      month_id: monthId,
      week_id: weekTemplateId,
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

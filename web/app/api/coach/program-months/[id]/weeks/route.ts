// POST /api/coach/program-months/[id]/weeks
// Añade una semana VACÍA al final del microciclo (la acción "+ Añadir semana" del
// editor): nueva program_week_templates con 7 días en descanso, heredando
// el level_id del microciclo, enganchada en max(position)+1.
// Coach-ownership gated.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  appendEmptyWeekToMonth,
  ProgramMonthError,
} from '@/lib/dashboard/coach/program-months';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const monthId = Number(id);
  if (!Number.isFinite(monthId)) {
    return jsonError('bad_request', 'Identificador inválido', 400);
  }

  try {
    const result = await appendEmptyWeekToMonth({
      coach_id: auth.session.coach_id,
      month_id: monthId,
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

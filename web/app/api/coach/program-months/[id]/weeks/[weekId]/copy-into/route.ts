// POST /api/coach/program-months/[id]/weeks/[weekId]/copy-into
// Copia el CONTENIDO de la semana origen ([weekId]) sobre una o varias semanas
// DESTINO que ya existen en el microciclo ([id]). SOBRESCRIBE el slots_json de
// cada destino con un clon profundo del origen (clon puro: sin progresión, sin
// fechas; exercise_id preservado). Los destinos conservan su identidad — sólo se
// reemplaza el contenido. 409 si algún destino tiene contenido y overwrite≠true.
// Coach-ownership gated.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  copyWeekContentInto,
  ProgramMonthError,
} from '@/lib/dashboard/coach/program-months';
import { weekContentCopySchema } from '@fahybrid/shared/schema/program-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; weekId: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id, weekId } = await ctx.params;
  const monthId = Number(id);
  const sourceWeekId = Number(weekId);
  if (!Number.isFinite(monthId) || !Number.isFinite(sourceWeekId)) {
    return jsonError('bad_request', 'Identificador inválido', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = weekContentCopySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', parsed.error.message, 400);
  }

  try {
    const result = await copyWeekContentInto({
      coach_id: auth.session.coach_id,
      month_id: monthId,
      source_week_id: sourceWeekId,
      target_week_ids: parsed.data.target_week_ids.map((x) => Number(x)),
      overwrite: parsed.data.overwrite,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

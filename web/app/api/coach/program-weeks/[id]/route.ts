import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  getWeekTemplate,
  ProgramWeekError,
  upsertWeekTemplate,
} from '@/lib/dashboard/coach/program-weeks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const weekId = Number(id);
  if (!Number.isFinite(weekId)) return jsonError('bad_request', 'ID inválido', 400);

  const week = await getWeekTemplate({ coach_id: session.coach_id, id: weekId });
  if (!week) return jsonError('not_found', 'Semana no encontrada', 404);

  return jsonOk({ week });
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const weekId = Number(id);
  if (!Number.isFinite(weekId)) return jsonError('bad_request', 'ID inválido', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const outId = await upsertWeekTemplate({
      coach_id: session.coach_id,
      id: weekId,
      payload: body,
    });
    return jsonOk({ id: outId });
  } catch (err) {
    if (err instanceof ProgramWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo guardar';
    return jsonError('internal_error', message, 500);
  }
}

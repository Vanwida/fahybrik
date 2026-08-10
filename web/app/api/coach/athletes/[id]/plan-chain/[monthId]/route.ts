import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  PersonalChainError,
  updatePersonalTramoMeta,
  deletePersonalTramoFromChain,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { coachActor } from '@/lib/audit/record-edit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseMonthId(monthId: string): number | null {
  const n = Number(monthId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// PATCH /api/coach/athletes/[id]/plan-chain/[monthId]
// Renombra y/o cambia la duración de un microciclo personal de la cadena:
// { name?, week_count? }. Alargar añade semanas vacías al final; acortar sólo
// quita semanas sin sesiones ejecutadas (409 con el suelo real si no cabe).
// Si la duración cambia, recoloca lo que venga detrás en la cadena.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; monthId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, monthId } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);
  const month_template_id = parseMonthId(monthId);
  if (month_template_id == null) return jsonError('bad_request', 'ID de microciclo inválido', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'Body JSON inválido', 400);
  }

  try {
    const result = await updatePersonalTramoMeta({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_template_id,
      payload: body,
      actor: coachActor(session),
    });
    return jsonOk({ tramo: result });
  } catch (err) {
    if (err instanceof PersonalChainError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

// DELETE /api/coach/athletes/[id]/plan-chain/[monthId]
// Borra un microciclo personal de la cadena. Lo pendiente desaparece, lo
// ejecutado se conserva (huérfano, en el historial). Si el borrado no dejó
// nada ejecutado huérfano, recoloca los tramos siguientes para cerrar el
// hueco; si sí, lo deja tal cual (ver personal-plan-chain-mutations.ts).
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; monthId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, monthId } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);
  const month_template_id = parseMonthId(monthId);
  if (month_template_id == null) return jsonError('bad_request', 'ID de microciclo inválido', 400);

  try {
    const result = await deletePersonalTramoFromChain({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_template_id,
      actor: coachActor(session),
    });
    return jsonOk({ deleted: result });
  } catch (err) {
    if (err instanceof PersonalChainError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

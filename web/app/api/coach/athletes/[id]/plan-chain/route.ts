import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { resolvePersonalPlanChain } from '@/lib/dashboard/coach/personal-plan-chain';
import {
  PersonalChainError,
  addPersonalTramoToChain,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { coachActor } from '@/lib/audit/record-edit';
import { sql } from '@/lib/db';
import { z } from 'zod';
import { loadCoachToday } from '@/lib/coach/coach-timezone';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';

const startInput = z.object({ start_date: z.string().date().optional() });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/athletes/[id]/plan-chain
// La cadena de este atleta tal y como la dibuja la espina (`plan-path.ts`),
// con lo que el coach necesita para editarla: qué nodo es personal (suyo,
// editable) y cuál es de biblioteca (sólo lectura), y por nodo personal,
// ejecutado/pendiente/suelo de acortar.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  const owned = await sql<Array<{ id: string }>>`select id::text from athletes where id = ${Number(parsedId.data.id)} and coach_id = ${Number(session.coach_id)}`;
  if (!owned[0]) return jsonError('not_found', 'Atleta no encontrado', 404);
  const [chain, max_weeks, today] = await Promise.all([resolvePersonalPlanChain({
    coach_id: session.coach_id,
    athlete_id: Number(parsedId.data.id),
  }), loadCoachMaxMicrocicloWeeks({ coach_id: session.coach_id }), loadCoachToday(session.coach_id)]);
  return jsonOk({ chain, max_weeks, today });
}

// POST /api/coach/athletes/[id]/plan-chain
// Añade un microciclo personal NUEVO al final de la cadena: { name, week_count }.
// Empieza el día después de que acabe lo último que el atleta ya tenga
// asignado — sin fecha que elegir, sin hueco ni solape posible (0166 lo
// garantiza en la base; ver personal-plan-chain-mutations.ts para el mensaje
// legible cuando salta).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'Body JSON inválido', 400);
  }

  try {
    const start = startInput.safeParse(body);
    if (!start.success) return jsonError('invalid_payload', 'La fecha de inicio no es válida.', 400);
    const result = await addPersonalTramoToChain({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      payload: body,
      actor: coachActor(session),
      start_date_when_empty: start.data.start_date ?? await loadCoachToday(session.coach_id),
    });
    return jsonOk({ tramo: result }, 201);
  } catch (err) {
    if (err instanceof PersonalChainError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

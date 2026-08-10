import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { resolvePersonalPlanChain } from '@/lib/dashboard/coach/personal-plan-chain';
import {
  PersonalChainError,
  addPersonalTramoToChain,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';

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

  const chain = await resolvePersonalPlanChain({
    coach_id: session.coach_id,
    athlete_id: Number(parsedId.data.id),
  });
  return jsonOk({ chain });
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
    const result = await addPersonalTramoToChain({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      payload: body,
    });
    return jsonOk({ tramo: result }, 201);
  } catch (err) {
    if (err instanceof PersonalChainError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

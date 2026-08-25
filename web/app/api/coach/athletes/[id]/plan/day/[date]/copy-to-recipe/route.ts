import { getCoachSession } from '@/lib/auth/coach-session';
import { coachActor } from '@/lib/audit/record-edit';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  copyAthleteInstanceDayToRecipe,
  RecipePromoteError,
} from '@/lib/dashboard/coach/copy-instance-to-recipe';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { ProgramWeekError } from '@/lib/dashboard/coach/program-weeks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/coach/athletes/[id]/plan/day/[date]/copy-to-recipe
// Explicit promote: THIS athlete's saved instance → the recipe that produced it.
// Never resyncs other athletes. 409 if others still point at that recipe.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; date: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, date } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);
  if (!ISO_DATE.test(date)) return jsonError('bad_request', 'Fecha inválida', 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const result = await copyAthleteInstanceDayToRecipe({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      iso_date: date,
      payload,
      actor: coachActor(session),
    });
    return jsonOk({ ok: true, target: result.target, other_athletes: result.other_athletes });
  } catch (err) {
    if (err instanceof RecipePromoteError) {
      return jsonError(err.code, err.message, err.status, err.details);
    }
    if (err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    if (err instanceof ProgramWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo copiar a la receta';
    return jsonError('internal_error', message, 500);
  }
}

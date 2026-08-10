import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  ProgramMonthError,
  createPersonalMonthTemplateFromScratch,
  listPersonalPlansForAthlete,
} from '@/lib/dashboard/coach/personal-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/athletes/[id]/microciclo
// Every PERSONAL plan (program_month_templates.athlete_id = this athlete) —
// feeds the "Planes personales" panel on the ficha. Never returns library
// microciclos (those live in the Biblioteca, athlete_id is null there).
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  const plans = await listPersonalPlansForAthlete({
    coach_id: session.coach_id,
    athlete_id: Number(parsedId.data.id),
  });
  return jsonOk({ plans });
}

// POST /api/coach/athletes/[id]/microciclo
// Creates a personal plan FROM SCRATCH (camino secundario, 0164): an empty
// container of N weeks tagged to this athlete. The coach fills in the days from
// the SAME microciclo editor every other microciclo uses, then activates it
// (POST /assign-month) whenever they're ready — creating it does NOT put
// anything on the athlete's calendar yet.
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
    const result = await createPersonalMonthTemplateFromScratch({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      payload: body,
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear el plan personal';
    return jsonError('internal_error', message, 500);
  }
}

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { setWeekFocus } from '@/lib/coach/week-focus';
import { PublishWeekError } from '@/lib/coach/publish-week';
import { weeklyPlanFocusInputSchema } from '@fahybrid/shared/schema/weekly-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/coach/athletes/[id]/weekly-plan
// Metadata-only: fija (o borra) el «Foco de la semana» de UNA semana concreta
// del atleta ({ week_start, focus }). No toca `status`: no publica ni esconde
// nada — eso sigue siendo cosa de .../weekly-plan/publish. Coach auth vía
// getCoachSession; ownership verificada dentro de setWeekFocus().
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = weeklyPlanFocusInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await setWeekFocus({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      week_start: parsed.data.week_start,
      focus: parsed.data.focus,
    });
    return jsonOk({ weekly_plan: result });
  } catch (err) {
    if (err instanceof PublishWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

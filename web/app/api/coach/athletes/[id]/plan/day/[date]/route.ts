import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/coach/athletes/[id]/plan/day/[date]
// Saves the coach's edits to ONE day of an athlete's plan into the athlete's
// INSTANCE template (`template_segments`). Body: { template_id, name?, segments }.
// Isolation is enforced inside updateAthleteInstanceDay: the template must be
// THIS athlete's instance, owned by THIS coach, assigned on THIS date — so the
// library template and other athletes' copies can never be touched here.
export async function PATCH(
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
    const result = await updateAthleteInstanceDay({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      iso_date: date,
      payload,
    });
    return jsonOk({ ok: true, template_id: result.template_id });
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError) {
      return jsonError('invalid_line', err.message, 400);
    }
    if (err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo guardar el entreno';
    return jsonError('internal_error', message, 500);
  }
}

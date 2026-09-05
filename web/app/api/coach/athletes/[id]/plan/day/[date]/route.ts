import { getCoachSession } from '@/lib/auth/coach-session';
import { coachActor } from '@/lib/audit/record-edit';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { parseRestWrite } from '@/lib/dashboard/coach/day-rest-write';
import {
  clearAthleteDayScheduled,
  clearAthleteSessionScheduled,
  DaySessionError,
} from '@/lib/dashboard/coach/day-sessions';
import { updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/coach/athletes/[id]/plan/day/[date]
// Three writes, separated:
//   · { kind: 'rest' } — primitiva DÍA (todas las scheduled).
//   · { kind: 'rest', assignment_id } — primitiva SESIÓN (una).
//   · { template_id, name?, segments } — rewrite the instance's template_segments.
// Rest + segments/template_id = 400. assignment_id inválido = 400.
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

  const restWrite = parseRestWrite(payload);
  if (restWrite.status === 'mixed') {
    return jsonError(
      'bad_request',
      'Descanso y contenido no van en el mismo body — usa { kind: "rest" } sin template_id ni segments',
      400,
    );
  }
  if (restWrite.status === 'bad_assignment') {
    return jsonError('bad_request', 'assignment_id inválido', 400);
  }

  try {
    if (restWrite.status === 'day') {
      const result = await clearAthleteDayScheduled({
        coach_id: session.coach_id,
        athlete_id: Number(parsedId.data.id),
        iso_date: date,
        actor: coachActor(session),
      });
      return jsonOk({ ok: true, kind: 'rest', cleared: result.cleared });
    }
    if (restWrite.status === 'session') {
      const result = await clearAthleteSessionScheduled({
        coach_id: session.coach_id,
        athlete_id: Number(parsedId.data.id),
        iso_date: date,
        assignment_id: restWrite.assignment_id,
        actor: coachActor(session),
      });
      return jsonOk({
        ok: true,
        kind: 'rest',
        assignment_id: result.assignment_id,
        cleared: result.cleared,
      });
    }

    const result = await updateAthleteInstanceDay({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      iso_date: date,
      payload,
      actor: coachActor(session),
    });
    return jsonOk({ ok: true, template_id: result.template_id });
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError) {
      return jsonError('invalid_line', err.message, 400);
    }
    if (err instanceof DaySessionError) {
      return jsonError(err.code, err.message, err.status);
    }
    if (err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo guardar el entreno';
    return jsonError('internal_error', message, 500);
  }
}

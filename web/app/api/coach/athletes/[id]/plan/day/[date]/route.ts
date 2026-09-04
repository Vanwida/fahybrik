import { getCoachSession } from '@/lib/auth/coach-session';
import { coachActor } from '@/lib/audit/record-edit';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { clearAthleteDayScheduled, DaySessionError } from '@/lib/dashboard/coach/day-sessions';
import { updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `{ kind: 'rest' }` sin `template_id` / `segments` → primitiva de descanso
 * (quita scheduled). Mezclar rest con el path de contenido es 400: no se
 * reescribe la instancia vacía fingiendo un descanso.
 */
function restWriteRequested(payload: unknown): 'rest' | 'mixed' | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const rec = payload as Record<string, unknown>;
  if (rec.kind !== 'rest') return null;
  if ('template_id' in rec || 'segments' in rec) return 'mixed';
  return 'rest';
}

// PATCH /api/coach/athletes/[id]/plan/day/[date]
// Two writes, separated:
//   · { kind: 'rest' } — clear this athlete's scheduled assignments that day.
//   · { template_id, name?, segments } — rewrite the instance's template_segments.
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

  const restKind = restWriteRequested(payload);
  if (restKind === 'mixed') {
    return jsonError(
      'bad_request',
      'Descanso y contenido no van en el mismo body — usa { kind: "rest" } sin template_id',
      400,
    );
  }

  try {
    if (restKind === 'rest') {
      const result = await clearAthleteDayScheduled({
        coach_id: session.coach_id,
        athlete_id: Number(parsedId.data.id),
        iso_date: date,
        actor: coachActor(session),
      });
      return jsonOk({ ok: true, kind: 'rest', cleared: result.cleared });
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

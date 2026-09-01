// PUT /api/coach/program-weeks/[id]/day — save ONE day of a week's slots_json
// from the v2 day editor. Loads the full week (ownership-checked), serializes the
// edited day (preserving block-level config + the week's other days), and upserts
// the full week. The existing full-week PUT at ../route.ts stays untouched.
//
// AGNOSTIC: name/focus/coach_notes are passed THROUGH from the stored week
// unchanged — this route only edits one day's slots_json.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  getWeekTemplate,
  ProgramWeekError,
  upsertWeekTemplate,
} from '@/lib/dashboard/coach/program-weeks';
import {
  InvalidAuthoringLineError,
  mergeDayIntoDays,
  serializeDay,
} from '@/lib/dashboard/v2/editor-serialize';
import {
  dayEditorSaveSchema,
  type ProgramWeekUpsert,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { resyncWeekTemplateAssignments } from '@/lib/dashboard/coach/instantiate-program';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const parsed = dayEditorSaveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', parsed.error.message, 400);
  }
  const { day_of_week, sessions, kind, recovery_suggestions } = parsed.data;

  try {
    const week = await getWeekTemplate({ coach_id: session.coach_id, id: weekId });
    if (!week) return jsonError('not_found', 'Semana no encontrada', 404);

    const days = week.slots_json.days;
    const originalDay: WeekDay =
      days.find((d) => d.day_of_week === day_of_week) ?? { day_of_week, sessions: [] };

    const nextDay = serializeDay({
      day_of_week,
      sessions,
      kind,
      recovery_suggestions,
      original: originalDay,
    });
    const nextDays = mergeDayIntoDays(days, nextDay);

    // Pass week-level fields through unchanged; only slots_json changes here.
    const payload: ProgramWeekUpsert = {
      name: week.name,
      focus: week.focus,
      coach_notes: week.coach_notes,
      slots_json: { days: nextDays },
    };

    const outId = await upsertWeekTemplate({
      coach_id: session.coach_id,
      id: weekId,
      payload,
    });

    // 0158 — un día ya asignado a un atleta es una copia de un solo instante;
    // sin esto, la edición se queda en la plantilla y nunca llega. Best-effort:
    // un fallo aquí no debe deshacer un guardado que ya tuvo éxito.
    let synced_athletes = 0;
    try {
      const resync = await resyncWeekTemplateAssignments({
        coach_id: session.coach_id,
        week_template_id: weekId,
      });
      synced_athletes = resync.microcycles_checked;
    } catch {
      // best-effort — ver comentario arriba.
    }

    return jsonOk({ id: outId, day_of_week, synced_athletes });
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError) {
      return jsonError('invalid_line', err.message, 400);
    }
    if (err instanceof ProgramWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo guardar';
    return jsonError('internal_error', message, 500);
  }
}

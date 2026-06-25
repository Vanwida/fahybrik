// PUT /api/coach/program-weeks/[id]/day/copy — copia el día que el coach edita
// (sus sesiones EN VIVO) a OTRO día de la misma semana. Clon puro: el día origen
// se serializa (preservando config de bloque por uid), se clona con uids nuevos
// y se escribe en `to_day_of_week`, reemplazándolo. Si el destino ya tiene
// contenido y `overwrite` no es true → 409 (el cliente pide confirmación antes).
// No ajusta cargas/%RM (progresión = metodología, no tech) ni añade fechas.
//
// AGNOSTIC: name/level/focus/coach_notes de la semana pasan TAL CUAL — esta ruta
// nunca toca program_level / semántica ATR.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  getWeekTemplate,
  ProgramWeekError,
  upsertWeekTemplate,
} from '@/lib/dashboard/coach/program-weeks';
import {
  cloneDayTo,
  InvalidAuthoringLineError,
  mergeDayIntoDays,
  serializeDay,
} from '@/lib/dashboard/v2/editor-serialize';
import {
  dayCopySchema,
  type ProgramWeekUpsert,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';

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

  const parsed = dayCopySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', parsed.error.message, 400);
  }
  const { from_day_of_week, to_day_of_week, sessions, overwrite } = parsed.data;

  try {
    const week = await getWeekTemplate({ coach_id: session.coach_id, id: weekId });
    if (!week) return jsonError('not_found', 'Semana no encontrada', 404);

    const days = week.slots_json.days;

    // Día destino: si ya tiene contenido y no se confirmó sobrescritura → 409.
    const targetExisting = days.find((d) => d.day_of_week === to_day_of_week);
    if (targetExisting && targetExisting.sessions.length > 0 && !overwrite) {
      return jsonError('day_not_empty', 'El día de destino ya tiene contenido', 409);
    }

    // Serializa las sesiones EN VIVO del día origen, preservando la config de
    // bloque (config_json/coach_note/…) por uid contra el día origen persistido.
    const originalSource: WeekDay =
      days.find((d) => d.day_of_week === from_day_of_week) ?? {
        day_of_week: from_day_of_week,
        sessions: [],
      };
    const sourceDay = serializeDay({
      day_of_week: from_day_of_week,
      sessions,
      original: originalSource,
    });

    // Clon profundo al día destino con uids nuevos (sin colisión en la semana).
    const clonedDay = cloneDayTo(sourceDay, to_day_of_week);
    const nextDays = mergeDayIntoDays(days, clonedDay);

    const payload: ProgramWeekUpsert = {
      name: week.name,
      level: week.level as ProgramWeekUpsert['level'],
      atr_block_hint: week.atr_block_hint as ProgramWeekUpsert['atr_block_hint'],
      focus: week.focus,
      coach_notes: week.coach_notes,
      slots_json: { days: nextDays },
    };

    const outId = await upsertWeekTemplate({
      coach_id: session.coach_id,
      id: weekId,
      payload,
    });
    return jsonOk({ id: outId, to_day_of_week });
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError) {
      return jsonError('invalid_line', err.message, 400);
    }
    if (err instanceof ProgramWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo copiar el día';
    return jsonError('internal_error', message, 500);
  }
}

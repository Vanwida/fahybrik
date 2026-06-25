// PUT /api/coach/program-weeks/[id]/day/copy — copia el día que el coach edita
// (sus sesiones EN VIVO) a uno o varios días destino, en la MISMA semana o en
// OTRA semana del microciclo (cross-week). Clon puro: el día origen se serializa
// (preservando config de bloque por uid), se clona con uids nuevos por destino y
// se escribe en cada `to_days`, reemplazándolo. `to_week_id` ausente = misma
// semana ([id]). Si algún destino ya tiene contenido y `overwrite` no es true →
// 409 (el cliente pide confirmación antes). No ajusta cargas/%RM (progresión =
// metodología, no tech) ni añade fechas.
//
// AGNOSTIC: name/level/focus/coach_notes de la semana destino pasan TAL CUAL —
// esta ruta nunca toca program_level / semántica ATR.

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
  const sourceWeekId = Number(id);
  if (!Number.isFinite(sourceWeekId)) return jsonError('bad_request', 'ID inválido', 400);

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
  const { from_day_of_week, to_week_id, to_days, sessions, overwrite } = parsed.data;

  // Destino: misma semana si no se especifica to_week_id.
  const targetWeekId = to_week_id !== undefined ? Number(to_week_id) : sourceWeekId;
  const sameWeek = targetWeekId === sourceWeekId;

  // En la misma semana, un día no puede copiarse sobre sí mismo.
  if (sameWeek && to_days.includes(from_day_of_week)) {
    return jsonError('invalid_target', 'No se puede copiar un día sobre sí mismo', 400);
  }

  // Días destino únicos (un mismo destino seleccionado dos veces es idempotente).
  const targetDays = [...new Set(to_days)];

  try {
    const sourceWeek = await getWeekTemplate({ coach_id: session.coach_id, id: sourceWeekId });
    if (!sourceWeek) return jsonError('not_found', 'Semana origen no encontrada', 404);

    const targetWeek = sameWeek
      ? sourceWeek
      : await getWeekTemplate({ coach_id: session.coach_id, id: targetWeekId });
    if (!targetWeek) return jsonError('not_found', 'Semana destino no encontrada', 404);

    // Serializa las sesiones EN VIVO del día origen, preservando la config de
    // bloque (config_json/coach_note/…) por uid contra el día origen persistido.
    const originalSource: WeekDay =
      sourceWeek.slots_json.days.find((d) => d.day_of_week === from_day_of_week) ?? {
        day_of_week: from_day_of_week,
        sessions: [],
      };
    const sourceDay = serializeDay({
      day_of_week: from_day_of_week,
      sessions,
      original: originalSource,
    });

    // Gate de sobrescritura: ningún día destino con contenido se pisa sin confirmar.
    if (!overwrite) {
      const conflicts = targetDays.filter((dow) => {
        const existing = targetWeek.slots_json.days.find((d) => d.day_of_week === dow);
        return !!existing && existing.sessions.length > 0;
      });
      if (conflicts.length > 0) {
        return jsonError('day_not_empty', 'El día de destino ya tiene contenido', 409);
      }
    }

    // Clon profundo (uids nuevos por destino) hacia cada día destino, en secuencia.
    let nextDays = targetWeek.slots_json.days;
    for (const dow of targetDays) {
      nextDays = mergeDayIntoDays(nextDays, cloneDayTo(sourceDay, dow));
    }

    const payload: ProgramWeekUpsert = {
      name: targetWeek.name,
      level: targetWeek.level as ProgramWeekUpsert['level'],
      atr_block_hint: targetWeek.atr_block_hint as ProgramWeekUpsert['atr_block_hint'],
      focus: targetWeek.focus,
      coach_notes: targetWeek.coach_notes,
      slots_json: { days: nextDays },
    };

    const outId = await upsertWeekTemplate({
      coach_id: session.coach_id,
      id: targetWeekId,
      payload,
    });
    return jsonOk({ id: outId, to_week_id: String(targetWeekId), to_days: targetDays });
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

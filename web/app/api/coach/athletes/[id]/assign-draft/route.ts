import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  AssignMonthError,
  assignMonthToAthlete,
} from '@/lib/dashboard/programming/assign-month';
import { markWeekDraft } from '@/lib/coach/publish-week';
import { assignMonthInputSchema } from '@fahybrid/shared/schema/assign-month';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/atr/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAYS_PER_WEEK = 7;

// =============================================================================
// "Crear en borrador" — el gate del flujo "Programar bloque" (PHASE 3).
//
// Materializa el bloque (reusa el materializador compartido vía
// `assignMonthToAthlete`) y marca CADA semana creada como BORRADOR
// (`markWeekDraft`), de modo que el atleta NO ve el bloque hasta que el coach lo
// publique desde "Revisar & publicar". El marcado de borrador vive AQUÍ (nivel
// de confirmación), NO dentro del materializador compartido: así el path de
// "aprobar propuesta de bloque mensual" de /hoy (que sí publica en vivo) queda
// intacto.
//
// A diferencia de /assign-month, este endpoint NO envía push: un borrador no es
// athlete-facing. La notificación se dispara al PUBLICAR (publishWeek), no al
// crear.
// =============================================================================

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = assignMonthInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  const athleteId = Number(parsedId.data.id);

  try {
    // 1) Materializa el bloque con el materializador compartido (mismo que el
    //    path en vivo). No publica nada todavía: por defecto las semanas no
    //    tienen fila en weekly_plans → siguen ocultas para el atleta.
    const result = await assignMonthToAthlete({
      coach_id: session.coach_id,
      athlete_id: athleteId,
      month_template_id: parsed.data.month_template_id,
      start_date: parsed.data.start_date,
    });

    // 2) Marca CADA semana creada como BORRADOR explícito. El nº de semanas es
    //    el nº de microciclos materializados; cada week_start = lunes inicial +
    //    i·7 (el materializador normaliza start_date al lunes de su semana).
    const startMonday = parseIsoDate(result.start_date);
    const weekCount = result.microcycle_ids.length;
    const weekStarts: string[] = [];
    for (let i = 0; i < weekCount; i += 1) {
      const weekStart = isoDateString(addDays(startMonday, i * DAYS_PER_WEEK));
      await markWeekDraft({
        coach_id: session.coach_id,
        athlete_id: athleteId,
        week_start: weekStart,
      });
      weekStarts.push(weekStart);
    }

    return jsonOk({
      assign_draft: {
        assignment_count: result.assignment_count,
        start_date: result.start_date,
        end_date: result.end_date,
        week_count: weekCount,
        week_starts: weekStarts,
      },
    });
  } catch (err) {
    if (err instanceof AssignMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

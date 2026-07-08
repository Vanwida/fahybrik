import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { cancelAthleteReview } from '@/lib/citas/reviews';
import { CitasError } from '@/lib/citas/store';
import { deleteCalendarEvent } from '@/lib/citas/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// POST /api/coach/athletes/[id]/review/cancel — cancela la revisión 1:1 reservada del
// atleta (#21). No pasa por actOnAppointment (inner join con leads → 404 en una revisión):
// cancela la cita ownership-gated y borra el evento de Google best-effort.
export async function POST(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const athlete_id = parseAthleteId(rawId);
  if (athlete_id === null) return jsonError('bad_request', 'id de atleta inválido', 400);

  try {
    const result = await cancelAthleteReview({ coach_id: session.coach_id, athlete_id });
    // Best-effort: si la reunión se creó en Google, borra el evento para no dejar un Meet
    // huérfano en el calendario. Nunca bloquea la cancelación.
    if (result.cancelled && result.google_event_id) {
      await deleteCalendarEvent(result.google_event_id).catch(() => {});
    }
    return jsonOk({ cancelled: result.cancelled });
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/coach/athletes/[id]/review/cancel]', err);
    return jsonError('cancel_review_failed', 'No se pudo cancelar la revisión', 500);
  }
}

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { proposeReview } from '@/lib/citas/reviews';
import { CitasError } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// POST /api/coach/athletes/[id]/propose-review — el coach propone una revisión 1:1 (#21):
// inserta una notificación al usuario del atleta (no crea cita; la reserva el atleta).
export async function POST(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const athlete_id = parseAthleteId(rawId);
  if (athlete_id === null) return jsonError('bad_request', 'id de atleta inválido', 400);

  try {
    const result = await proposeReview({ coach_id: session.coach_id, athlete_id });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/coach/athletes/[id]/propose-review]', err);
    return jsonError('propose_review_failed', 'No se pudo proponer la revisión', 500);
  }
}

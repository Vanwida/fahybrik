import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { reviewCadenceInput } from '@fahybrid/shared/schema';
import { setReviewCadence } from '@/lib/citas/reviews';
import { CitasError } from '@/lib/citas/store';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// PATCH /api/coach/athletes/[id]/review-cadence — fija la cadencia de revisión 1:1 (#21).
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const athlete_id = parseAthleteId(rawId);
  if (athlete_id === null) return jsonError('bad_request', 'id de atleta inválido', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = reviewCadenceInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Cadencia inválida', 422, parsed.error.flatten());
  }

  try {
    const result = await setReviewCadence({
      athlete_id,
      cadence: parsed.data.cadence,
      coach_id: session.coach_id,
    });
    // La señal review_1on1_due depende de la cadencia → refresco best-effort (patrón del repo).
    void recomputeAthlete({ athlete_id }).catch(() => {});
    return jsonOk(result);
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[PATCH /api/coach/athletes/[id]/review-cadence]', err);
    return jsonError('review_cadence_failed', 'No se pudo fijar la cadencia', 500);
  }
}

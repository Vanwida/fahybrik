import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { bookReviewInput } from '@fahybrid/shared/schema';
import { bookAthleteReview } from '@/lib/citas/reviews';
import { CitasError } from '@/lib/citas/store';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/review/book — el atleta reserva su revisión 1:1 en un hueco (#21).
// Bearer-auth. Body { requested_start: iso }. Auto-aceptada + Meet (best-effort).
export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer de atleta requerido', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = bookReviewInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Hueco inválido', 422, parsed.error.flatten());
  }

  try {
    const result = await bookAthleteReview({
      athlete_id: session.athlete_id,
      requested_start: parsed.data.requested_start,
    });
    // La revisión reservada limpia la señal review_1on1_due → refresco best-effort.
    void recomputeAthlete({ athlete_id: session.athlete_id }).catch(() => {});
    return jsonOk(result);
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/athlete/review/book]', err);
    return jsonError('review_book_failed', 'No se pudo reservar la revisión', 500);
  }
}

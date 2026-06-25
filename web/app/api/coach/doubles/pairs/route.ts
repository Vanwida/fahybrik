import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  createDoublesPair,
  listDoublesPairsForCoach,
  DoublesPairError,
} from '@/lib/dashboard/coach/doubles-pairs';
import { createDoublesPairInputSchema } from '@fahybrid/shared/schema/doubles-pairs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/doubles/pairs — all active pairs for the coach (roster display).
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const pairs = await listDoublesPairsForCoach(session.coach_id);
  return jsonOk({ pairs });
}

// POST /api/coach/doubles/pairs — link two of the coach's athletes into a pair.
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = createDoublesPairInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const pair = await createDoublesPair({
      coach_id: session.coach_id,
      athlete_a_id: parsed.data.athlete_a_id,
      athlete_b_id: parsed.data.athlete_b_id,
    });
    return jsonOk({ pair }, 201);
  } catch (err) {
    if (err instanceof DoublesPairError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

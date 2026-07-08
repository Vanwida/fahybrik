import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { injuryCreateSchema } from '@fahybrid/shared/schema/injuries';
import { createInjury, listInjuries } from '@/lib/injuries/injuries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/injuries — the athlete's own injuries (open first) + timeline.
export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);
  const injuries = await listInjuries(session.athlete_id);
  return jsonOk({ injuries });
}

// POST /api/athlete/injuries — the athlete self-reports a new injury (#16).
export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }
  const parsed = injuryCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }
  const injury = await createInjury(session.athlete_id, 'athlete', parsed.data);
  return jsonOk({ injury }, 201);
}

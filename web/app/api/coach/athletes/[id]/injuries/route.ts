import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { injuryCreateSchema } from '@fahybrid/shared/schema/injuries';
import { createInjury, listInjuries, coachOwnsAthlete } from '@/lib/injuries/injuries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseAthleteId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = BigInt(raw);
  return n > BigInt(0) ? n : null;
}

// GET /api/coach/athletes/[id]/injuries — the athlete's injury history for the ficha.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const athleteId = parseAthleteId((await ctx.params).id);
  if (athleteId == null) return jsonError('invalid_id', 'id inválido', 400);
  if (!(await coachOwnsAthlete(session.coach_id, athleteId))) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }
  const injuries = await listInjuries(athleteId);
  return jsonOk({ injuries });
}

// POST /api/coach/athletes/[id]/injuries — the coach registers an injury for an athlete.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const athleteId = parseAthleteId((await ctx.params).id);
  if (athleteId == null) return jsonError('invalid_id', 'id inválido', 400);
  if (!(await coachOwnsAthlete(session.coach_id, athleteId))) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }
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
  const injury = await createInjury(athleteId, 'coach', parsed.data);
  return jsonOk({ injury }, 201);
}

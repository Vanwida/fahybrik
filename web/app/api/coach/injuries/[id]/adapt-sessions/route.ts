import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { injuryAdaptSessionsSchema } from '@fahybrid/shared/schema/injuries';
import { adaptSessions, injuryAthleteId, coachOwnsAthlete, InjuryError } from '@/lib/injuries/injuries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/injuries/[id]/adapt-sessions — the coach tags the athlete's
// scheduled sessions as injury-adapted ('rest' | 'substituted' | 'softened') so
// adherence never reads them as a failure (#16).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError('invalid_id', 'id inválido', 400);
  const injuryId = BigInt(id);

  const athleteId = await injuryAthleteId(injuryId);
  if (athleteId == null || !(await coachOwnsAthlete(session.coach_id, athleteId))) {
    return jsonError('not_found', 'Lesión no encontrada', 404);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }
  const parsed = injuryAdaptSessionsSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }
  // The URL injury id is authoritative (the body's injury_id must match).
  if (BigInt(parsed.data.injury_id) !== injuryId) {
    return jsonError('invalid_request', 'injury_id no coincide con la ruta', 400);
  }

  try {
    const updated = await adaptSessions(injuryId, athleteId, parsed.data.adaptations);
    return jsonOk({ adapted: updated });
  } catch (e) {
    if (e instanceof InjuryError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}

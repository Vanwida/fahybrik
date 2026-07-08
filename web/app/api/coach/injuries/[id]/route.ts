import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { injuryUpdateSchema } from '@fahybrid/shared/schema/injuries';
import { updateInjury, injuryAthleteId, coachOwnsAthlete, InjuryError } from '@/lib/injuries/injuries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/coach/injuries/[id] — the coach transitions/updates an injury
// (mark recovering, discharge, set expected return, add a clinical note).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = injuryUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  try {
    const injury = await updateInjury(injuryId, athleteId, 'coach', parsed.data);
    return jsonOk({ injury });
  } catch (e) {
    if (e instanceof InjuryError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}

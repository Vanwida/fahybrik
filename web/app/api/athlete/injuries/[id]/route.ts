import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { injuryUpdateSchema } from '@fahybrid/shared/schema/injuries';
import { updateInjury, InjuryError } from '@/lib/injuries/injuries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/athlete/injuries/[id] — the athlete updates their own injury
// (report evolution, add a note, mark recovering/resolved). Coach-only clinical
// nuance still lives on the coach endpoint; the state machine guards transitions.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError('invalid_id', 'id inválido', 400);
  const injuryId = BigInt(id);

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
    // The athlete_id scope on updateInjury ensures the athlete can only touch
    // their OWN injury (a foreign id resolves to not_found).
    const injury = await updateInjury(injuryId, session.athlete_id, 'athlete', parsed.data);
    return jsonOk({ injury });
  } catch (e) {
    if (e instanceof InjuryError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  AssignSequenceError,
  advanceSequenceForAthlete,
} from '@/lib/dashboard/coach/assign-sequence';
import { notifyAthlete } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/advance-sequence
// Advances the athlete to the NEXT microciclo of their active sequence, or resolves
// the end-policy (repeat / level_up / stop) when the current microciclo is the last
// item. Reuses the chunk-1 materializer; coach-scoped (athletes.coach_id = session).
// Body: none. The advancement is deterministic from the cursor + the sequence.
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  try {
    const result = await advanceSequenceForAthlete(
      Number(parsedId.data.id),
      session.coach_id,
    );

    // Notify the athlete only when we actually materialized new sessions this call
    // (advanced / looped / leveled_up with content). Best-effort: the advancement is
    // already committed; a failed push must not roll it back (same posture as assign).
    if (result.materialization && result.materialization.assignment_count > 0) {
      const { sql } = await import('@/lib/db');
      await notifyAthlete({
        sql,
        athlete_id: BigInt(parsedId.data.id),
        type: 'plan_published',
        payload: {
          athlete_id: parsedId.data.id,
          week_start: result.materialization.start_date,
          deep_link: `/plan?week=${result.materialization.start_date}`,
        },
        push: {
          title: 'Nuevo microciclo listo',
          body: 'Pablo ha publicado el siguiente bloque de tu plan.',
          deeplink: { screen: 'plan', week_start: result.materialization.start_date },
        },
      }).catch(() => undefined);
    }

    return jsonOk({ advance_sequence: result });
  } catch (err) {
    if (err instanceof AssignSequenceError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

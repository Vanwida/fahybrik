import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { loadCoachSessionDetail } from '@/lib/coach/session-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — full detail of ONE athlete session (materialized workout_assignment) for
// the coach SessionDrawer: template blocks (read-only reference), decoded
// per-assignment coach overrides (display title + notes), the athlete's execution
// reality (tiempo, RPE, notas) and the per-tramo running compliance.
//
// The assembly itself lives in `lib/coach/session-detail.ts` because the MCP
// connector's `get_session` asks the same question and must get the same answer.
// This file is the HTTP mouth: parse, authorize, translate the two refusals.

const SessionIdSchema = z.object({
  session_id: z.string().regex(/^\d+$/, 'session_id inválido'),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; session_id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, session_id } = await ctx.params;

  const parsedAthlete = AthleteIdParamSchema.safeParse({ id });
  if (!parsedAthlete.success) return jsonError('bad_request', 'ID atleta inválido', 400);

  const parsedSession = SessionIdSchema.safeParse({ session_id });
  if (!parsedSession.success) return jsonError('bad_request', 'ID entreno inválido', 400);

  try {
    const result = await loadCoachSessionDetail({
      sql,
      coach_id: session.coach_id,
      athlete_id: Number(parsedAthlete.data.id),
      assignment_id: Number(parsedSession.data.session_id),
      include_trace: false,
    });

    if (!result.ok) {
      return result.reason === 'athlete_not_found'
        ? jsonError('not_found', 'Atleta no encontrado', 404)
        : jsonError('not_found', 'Entreno no encontrado', 404);
    }

    return jsonOk({ session: result.session });
  } catch {
    return jsonError('internal_error', 'No se pudo cargar el detalle del entreno.', 500);
  }
}

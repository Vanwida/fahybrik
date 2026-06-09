import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { updateDaySession, DaySessionError } from '@/lib/dashboard/coach/day-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchBodySchema = z.object({
  display_title: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; session_id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, session_id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID atleta inválido', 400);

  const assignmentId = Number(session_id);
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return jsonError('bad_request', 'ID entreno inválido', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await updateDaySession({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      assignment_id: assignmentId,
      display_title: parsed.data.display_title,
      notes: parsed.data.notes,
    });
    return jsonOk({ session: result });
  } catch (err) {
    if (err instanceof DaySessionError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

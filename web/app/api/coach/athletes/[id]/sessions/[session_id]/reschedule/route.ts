import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteDeepDiveError } from '@/lib/coach/athlete-deep-dive';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';
import { isDemoAthleteId } from '@/lib/coach/deep-dive-demo';
import { rescheduleAssignment, RescheduleBodySchema } from '@/lib/coach/deep-dive-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; session_id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Coach session required', 401);

  const { id, session_id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'invalid athlete id', 400, parsedId.error.flatten());
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON body', 400);
  }
  const parsed = RescheduleBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid reschedule payload', 400, parsed.error.flatten());
  }

  // Demo athletes accept the reschedule optimistically without persisting.
  if (isDemoAthleteId(parsedId.data.id)) {
    return jsonOk({
      reschedule: {
        session_id,
        iso_date: parsed.data.to_iso_date,
        slot: parsed.data.to_slot ?? 'AM',
        is_demo: true,
      },
    });
  }

  try {
    const out = await rescheduleAssignment({
      coach_id: session.coach_id,
      athlete_id: parsedId.data.id,
      session_id,
      to_iso_date: parsed.data.to_iso_date,
      to_slot: parsed.data.to_slot,
    });
    return jsonOk({ reschedule: out });
  } catch (err) {
    if (err instanceof AthleteDeepDiveError) {
      const status = err.code === 'forbidden' ? 403 : 404;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}

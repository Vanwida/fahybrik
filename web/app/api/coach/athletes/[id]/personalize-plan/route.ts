import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  PersonalizePlanError,
  personalizePlanForAthlete,
} from '@/lib/dashboard/coach/personalize-plan';
import { personalizePlanInputSchema } from '@fahybrid/shared/schema/personalize-plan';
import { coachActor } from '@/lib/audit/record-edit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/personalize-plan
// Forks the athlete's CURRENT microciclo into a personal plan for just them,
// detaches them from the level×días sequence, and re-materializes so the fork
// is live immediately. Body is optional: { start?: 'current_week'|'next_week' }
// (#4 — defaults to 'current_week', the historical behaviour). See
// lib/dashboard/coach/personalize-plan.ts for the full mechanism.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = personalizePlanInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await personalizePlanForAthlete({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      start: parsed.data.start,
      actor: coachActor(session),
    });
    return jsonOk({ personalize: result });
  } catch (err) {
    if (err instanceof PersonalizePlanError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

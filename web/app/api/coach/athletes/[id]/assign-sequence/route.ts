import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  AssignSequenceError,
  assignSequenceToAthlete,
} from '@/lib/dashboard/coach/assign-sequence';
import { assignSequenceInputSchema } from '@fahybrid/shared/schema/assign-sequence';
import { notifyAthlete } from '@/lib/notifications/dispatch';
import { planPublishedPush } from '@/lib/notifications/plan-published';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/assign-sequence
// Enrolls the athlete in their RESOLVED sequence (level × days) and materializes
// the first microciclo into real dated workout_assignments via the existing
// month-instantiation pipeline. Coach-scoped (athletes.coach_id = session coach).
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  // Body is optional: { start_date? } to override the default (next Monday).
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = assignSequenceInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await assignSequenceToAthlete(
      Number(parsedId.data.id),
      session.coach_id,
      parsed.data.start_date,
    );

    // Notify the athlete that a plan was published — only when we actually
    // materialized sessions this call (skip the idempotent no-op re-enroll and
    // empty materializations). Best-effort: the assign is already committed; a
    // failed push must not roll it back (same posture as assign-month).
    if (
      !result.already_enrolled &&
      result.materialization &&
      result.materialization.assignment_count > 0
    ) {
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
          ...(await planPublishedPush(sql, BigInt(parsedId.data.id), 'assigned')),
          deeplink: { screen: 'plan', week_start: result.materialization.start_date },
        },
      }).catch(() => undefined);
    }

    return jsonOk({ assign_sequence: result });
  } catch (err) {
    if (err instanceof AssignSequenceError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

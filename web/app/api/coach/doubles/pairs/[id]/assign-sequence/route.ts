import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  assignSequenceToPair,
  AssignSequenceError,
  DoublesPairError,
} from '@/lib/dashboard/coach/doubles-pairs';
import { assignPairSequenceInputSchema } from '@fahybrid/shared/schema/doubles-pairs';
import { notifyPlanAssignedIfVisible } from '@/lib/notifications/plan-published';
import type { AssignSequenceResult } from '@/lib/dashboard/coach/assign-sequence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePairId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Best-effort push: tell an athlete their plan was published, only when we
// actually materialized sessions this call (skip idempotent no-op re-enrolls)
// AND the athlete already sees one of those weeks — the same rule as the
// individual assign-sequence route. The pair's weeks open N days before (auto
// delivery), so a plan starting in three weeks gets its notice from the publish
// cron that day, not a «Tu plan está listo» onto an empty Plan today (D-10).
async function notifyIfMaterialized(
  athleteId: number,
  result: AssignSequenceResult,
): Promise<void> {
  if (
    result.already_enrolled ||
    !result.materialization ||
    result.materialization.assignment_count <= 0
  ) {
    return;
  }
  const { sql } = await import('@/lib/db');
  await notifyPlanAssignedIfVisible({
    sql,
    athlete_id: athleteId,
    start_date: result.materialization.start_date,
    week_count: result.materialization.microcycle_ids.length,
  });
}

// POST /api/coach/doubles/pairs/[id]/assign-sequence — ONE call materializes the
// plan for BOTH athletes (each at their own intensity, same sequence cell).
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const pairId = parsePairId(id);
  if (pairId == null) return jsonError('bad_request', 'ID de pareja inválido', 400);

  // Body optional: { start_date? } overrides the default (next Monday).
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = assignPairSequenceInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await assignSequenceToPair({
      coach_id: session.coach_id,
      pair_id: pairId,
      start_date: parsed.data.start_date,
    });

    await Promise.all([
      notifyIfMaterialized(result.athlete_a.athlete_id, result.athlete_a.result),
      notifyIfMaterialized(result.athlete_b.athlete_id, result.athlete_b.result),
    ]);

    return jsonOk({ assign_pair: result });
  } catch (err) {
    if (err instanceof AssignSequenceError || err instanceof DoublesPairError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

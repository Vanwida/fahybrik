import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { publishBlock, publishWeek, PublishWeekError } from '@/lib/coach/publish-week';
import { publishWeekInputSchema } from '@fahybrid/shared/schema/weekly-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/weekly-plan/publish
// Publishes a week (or a whole run of microcycles) so the athlete plan endpoint stops
// hiding it, and fires the `plan_published` notification. Coach auth via
// getCoachSession; ownership verified inside publishWeek()/publishBlock().
//   - { week_start }  → single week (proposal / next-week review path).
//   - { week_starts } → every week of a block created in draft (assign-draft
//                       loop), published together with ONE notification.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = publishWeekInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  const athleteId = Number(parsedId.data.id);

  try {
    // Block publish: flip every week of the block to published with ONE notice.
    if (parsed.data.week_starts) {
      const result = await publishBlock({
        coach_id: session.coach_id,
        athlete_id: athleteId,
        week_starts: parsed.data.week_starts,
      });
      return jsonOk({ weekly_plan: result });
    }

    // Single week (the schema guarantees week_start is present in this branch).
    const result = await publishWeek({
      coach_id: session.coach_id,
      athlete_id: athleteId,
      week_start: parsed.data.week_start as string,
    });
    return jsonOk({ weekly_plan: result });
  } catch (err) {
    if (err instanceof PublishWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

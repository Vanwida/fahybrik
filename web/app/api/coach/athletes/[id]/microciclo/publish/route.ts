import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { publishMicrociclo } from '@/lib/coach/publish-microciclo';
import { PublishWeekError } from '@/lib/coach/publish-week';
import { publishMicrocicloInputSchema } from '@fahybrid/shared/schema/weekly-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/microciclo/publish
// Publishes a whole ASSIGNED microciclo (an athlete_month_assignments row) to the
// athlete: every weekly_plans week of the assignment flips to 'published', so the
// athlete plan endpoint stops hiding them. Reuses publishBlock (idempotent +
// notifies once); rejects an empty microciclo (no materialized sessions). Coach
// auth + athlete ownership verified inside publishMicrociclo().
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID de atleta inválido', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = publishMicrocicloInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await publishMicrociclo({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_assignment_id: parsed.data.month_assignment_id,
    });
    return jsonOk({ microciclo_publish: result });
  } catch (err) {
    if (err instanceof PublishWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

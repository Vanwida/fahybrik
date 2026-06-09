import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';
import { buildModalityAnalytics } from '@/lib/coach/modality-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/athletes/[id]/modality
// Run-vs-row(-vs-ski/bike/strength) breakdown for a coach-owned athlete.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Coach session required', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'invalid athlete id', 400);

  const { sql } = await import('@/lib/db');
  const athleteId = Number(parsedId.data.id);
  const owned = await sql<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${Number(session.coach_id)} limit 1
  `;
  if (!owned[0]) return jsonError('not_found', 'Athlete not found', 404);

  const analytics = await buildModalityAnalytics({ athlete_id: athleteId });
  return jsonOk(analytics);
}

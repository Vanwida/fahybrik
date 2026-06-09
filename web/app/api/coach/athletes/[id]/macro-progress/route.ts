import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';
import { AthleteDeepDiveError } from '@/lib/coach/athlete-deep-dive';
import { buildMacroProgress } from '@/lib/coach/macro-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const progress = await buildMacroProgress({ athlete_id: athleteId });
  return jsonOk({ macro_progress: progress });
}

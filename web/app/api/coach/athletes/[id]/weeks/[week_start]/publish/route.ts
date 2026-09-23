// POST /api/coach/athletes/[id]/weeks/[week_start]/publish
//
// Publicar UNA semana de un atleta: la ve ya. Idempotente (publicar una semana ya
// visible no la toca ni vuelve a avisar). Avisa al atleta solo si pasó de oculta a
// visible y tiene entrenos.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId, parseWith } from '@/lib/coach/api-input';
import { publishAthleteWeek, WeekPublishingError } from '@/lib/coach/week-publishing';
import { mondaySchema } from '@fahybrid/shared/schema/assign-many';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; week_start: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const params = await ctx.params;
  const id = parseRouteId(params.id, 'atleta');
  if (!id.ok) return id.response;
  const week = parseWith(mondaySchema, params.week_start);
  if (!week.ok) return week.response;

  try {
    const result = await publishAthleteWeek({
      coach_id: auth.session.coach_id,
      athlete_id: id.data,
      week_start: week.data,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof WeekPublishingError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

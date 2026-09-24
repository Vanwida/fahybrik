// POST /api/coach/weeks/publish   body: { athlete_ids, week_start }
//
// Publicar la misma semana a varios atletas («Publicar a los 47» en Hoy). Todos
// tienen que ser del coach: si uno no lo es, no se publica ninguna (404).

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { publishWeekForAthletes, WeekPublishingError } from '@/lib/coach/week-publishing';
import { bulkWeekPublishSchema } from '@fahybrid/shared/schema/week-publishing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, bulkWeekPublishSchema);
  if (!body.ok) return body.response;

  try {
    const result = await publishWeekForAthletes({
      coach_id: auth.session.coach_id,
      athlete_ids: body.data.athlete_ids.map(Number),
      week_start: body.data.week_start,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof WeekPublishingError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

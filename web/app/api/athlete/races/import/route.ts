import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { undoHyresultImport } from '@/lib/hyrox/hyresult';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/athlete/races/import — the athlete undoes a by-name hyresult import
// ("No soy yo"). Purges EVERY race they imported from hyresult + clears their
// hyresult_slug identity link, atomically and scoped to ownership, so they can
// re-search and pick the CORRECT profile. Manually-added races, the legacy
// single-link import, and catalog-target objectives are untouched (different
// source/priority). Athlete bearer. snake_case response { deleted_races,
// slug_cleared }.
export async function DELETE(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const result = await undoHyresultImport({ athlete_id: auth.athlete_id });
  return jsonOk(result);
}

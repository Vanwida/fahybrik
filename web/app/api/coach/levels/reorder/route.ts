// PUT /api/coach/levels/reorder  body: { ids: [...] } — el orden nuevo de TODOS
// los niveles activos. El orden es la escalera: decide qué va antes en los
// selectores y en qué escalón cae cada nivel para la sugerencia.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { LevelError, reorderCoachLevels } from '@/lib/coach/levels';
import { levelReorderSchema } from '@fahybrid/shared/domain/coach/level-editor';
import { levelErrorResponse } from '../errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, levelReorderSchema);
  if (!body.ok) return body.response;
  try {
    await reorderCoachLevels(auth.session.coach_id, body.data.ids);
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    throw err;
  }
}

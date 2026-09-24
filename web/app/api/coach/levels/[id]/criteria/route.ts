// PUT /api/coach/levels/[id]/criteria  body: { criteria: [...] | null }
//
// Qué marca abre este nivel (la sugerencia de nivel). Reemplaza el conjunto
// entero; `null` vuelve al defecto del producto para su posición; `[]` = «este
// nivel no se abre por marcas».

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { LevelError, setLevelCriteria } from '@/lib/coach/levels';
import { levelCriteriaSchema } from '@fahybrid/shared/domain/coach/level-editor';
import { levelErrorResponse } from '../../errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const raw = (await ctx.params).id;
  const level_id = Number.parseInt(raw, 10);
  if (!Number.isFinite(level_id) || level_id <= 0 || String(level_id) !== raw) {
    return jsonError('bad_request', 'id inválido', 400);
  }
  const body = await parseBody(req, levelCriteriaSchema);
  if (!body.ok) return body.response;
  try {
    await setLevelCriteria(auth.session.coach_id, level_id, body.data.criteria);
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    throw err;
  }
}

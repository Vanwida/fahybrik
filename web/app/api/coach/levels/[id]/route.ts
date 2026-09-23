// PATCH  /api/coach/levels/[id]  body: { name?, label?, description?, archived? }
// DELETE /api/coach/levels/[id]  → 204; 409 si alguien lo usa (se retira, no se borra)
//
// La propiedad viaja dentro de cada escritura (lib/coach/levels.ts).

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { deleteCoachLevel, LevelError, updateCoachLevel } from '@/lib/coach/levels';
import { levelPatchSchema } from '@fahybrid/shared/domain/coach/level-editor';
import { levelErrorResponse } from '../errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseLevelId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && String(n) === raw ? n : null;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const level_id = parseLevelId((await ctx.params).id);
  if (level_id === null) return jsonError('bad_request', 'id inválido', 400);
  const body = await parseBody(req, levelPatchSchema);
  if (!body.ok) return body.response;
  try {
    await updateCoachLevel(auth.session.coach_id, level_id, body.data);
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const level_id = parseLevelId((await ctx.params).id);
  if (level_id === null) return jsonError('bad_request', 'id inválido', 400);
  try {
    await deleteCoachLevel(auth.session.coach_id, level_id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    throw err;
  }
}

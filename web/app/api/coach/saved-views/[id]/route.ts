// PATCH  /api/coach/saved-views/[id] → { view }   body: { name?, query?, position? }
// DELETE /api/coach/saved-views/[id] → { deleted: true }

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId } from '@/lib/coach/api-input';
import { deleteSavedView, SavedViewError, updateSavedView } from '@/lib/coach/saved-views';
import { savedViewPatchSchema } from '@fahybrid/shared/schema/saved-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'vista');
  if (!id.ok) return id.response;
  const body = await parseBody(req, savedViewPatchSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk({ view: await updateSavedView(auth.session.coach_id, id.data, body.data) });
  } catch (err) {
    if (err instanceof SavedViewError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'vista');
  if (!id.ok) return id.response;
  try {
    await deleteSavedView(auth.session.coach_id, id.data);
    return jsonOk({ deleted: true });
  } catch (err) {
    if (err instanceof SavedViewError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

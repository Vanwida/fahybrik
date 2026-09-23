// GET    /api/coach/groups/[id] → { group: GroupDetail } (miembros, cadena, calendario, candidatos)
// PATCH  /api/coach/groups/[id] → { group }   body: cualquier campo de createGroup;
//        `programs: [{ program_id, item_id? }]` deja la cadena en ese orden (item_id
//        conserva la identidad: los miembros siguen en el programa que hacen).
// DELETE /api/coach/groups/[id] → { deleted: true } (409 si tiene atletas dentro)

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId } from '@/lib/coach/api-input';
import { deleteGroup, getGroup, GroupError, updateGroup } from '@/lib/coach/groups';
import { groupPatchSchema } from '@fahybrid/shared/schema/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function failure(err: unknown) {
  if (err instanceof GroupError) return jsonError(err.code, err.message, err.status);
  throw err;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'grupo');
  if (!id.ok) return id.response;
  const group = await getGroup(auth.session.coach_id, id.data);
  if (!group) return jsonError('group_not_found', 'No encuentro ese grupo entre los tuyos.', 404);
  return jsonOk({ group });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'grupo');
  if (!id.ok) return id.response;
  const body = await parseBody(req, groupPatchSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk({ group: await updateGroup(auth.session.coach_id, id.data, body.data) });
  } catch (err) {
    return failure(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'grupo');
  if (!id.ok) return id.response;
  try {
    await deleteGroup(auth.session.coach_id, id.data);
    return jsonOk({ deleted: true });
  } catch (err) {
    return failure(err);
  }
}

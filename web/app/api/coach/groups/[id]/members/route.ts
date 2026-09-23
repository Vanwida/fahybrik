// POST /api/coach/groups/[id]/members
//   { athlete_ids, action: 'add', start_date?, start_position?, start_week?,
//     on_conflict? ('chain'), delivery? ('auto'), dry_run? }
//     → la misma respuesta que «Asignar» ({ preview, applied? } con batch_id):
//       cada atleta entra en el programa y la semana en que ESTÁ el grupo
//       (alineado), salvo que se fuerce start_position/start_week. Si estaba en
//       otro grupo, sale de él. Deshacer: POST /api/coach/assign/[batch_id]/undo.
//   { athlete_ids, action: 'remove' } → { removed[{ athlete_id, plan_until }], skipped[] }
//       Sale del grupo; conserva lo que ya tiene hasta que acabe.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId } from '@/lib/coach/api-input';
import { AssignManyError } from '@/lib/coach/assign-many';
import { addMembers, GroupError, removeMembers } from '@/lib/coach/groups';
import { groupMembersSchema } from '@fahybrid/shared/schema/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'grupo');
  if (!id.ok) return id.response;
  const body = await parseBody(req, groupMembersSchema);
  if (!body.ok) return body.response;

  try {
    if (body.data.action === 'remove') {
      const result = await removeMembers({
        coach_id: auth.session.coach_id,
        group_id: id.data,
        athlete_ids: body.data.athlete_ids.map(Number),
      });
      return jsonOk(result);
    }
    const result = await addMembers({
      coach_id: auth.session.coach_id,
      user_id: auth.session.user_id,
      group_id: id.data,
      input: body.data,
    });
    return jsonOk(result, result.applied && !result.applied.replayed ? 201 : 200);
  } catch (err) {
    if (err instanceof GroupError || err instanceof AssignManyError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

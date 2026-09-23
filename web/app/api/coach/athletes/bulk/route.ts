// POST /api/coach/athletes/bulk — acciones en bloque desde la lista de Atletas (§4.8).
//
// body: { athlete_ids, action: 'set_level' | 'pause' | 'resume' | 'add_to_group'
//         | 'remove_from_group', level_id?, group_id?, reason? (pausa), note?,
//         end_date?, start_date?, on_conflict?, delivery?, dry_run? (grupo) }
// → { action, changed, skipped, results[{ athlete_id, ok, code, message }],
//     assign? (add_to_group: previa + batch_id para deshacer), group_removal? }
//
// Tenencia: si un atleta no es del coach → 404 y no se toca ninguno.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { BulkAthletesError, runBulkAthletes } from '@/lib/coach/bulk-athletes';
import { AssignManyError } from '@/lib/coach/assign-many';
import { GroupError } from '@/lib/coach/groups';
import { bulkAthletesSchema } from '@fahybrid/shared/schema/bulk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, bulkAthletesSchema);
  if (!body.ok) return body.response;
  try {
    const result = await runBulkAthletes({
      coach_id: auth.session.coach_id,
      user_id: auth.session.user_id,
      input: body.data,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof BulkAthletesError || err instanceof GroupError || err instanceof AssignManyError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

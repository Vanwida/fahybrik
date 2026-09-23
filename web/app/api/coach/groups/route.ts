// GET  /api/coach/groups → { groups: GroupSummary[] }
// POST /api/coach/groups → { group }   body: { name, level_id?, days_per_week?, end_policy?,
//                                             progression_pct?, progression_applies_to?, programs? }
//
// Un grupo = atletas + su plan (cadena ordenada de programas). Nivel y días son
// opcionales: con los dos puestos, el grupo propone a los atletas que encajan
// («Asignar a nuevos»). Contrato §4.5.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { createGroup, GroupError, listGroups } from '@/lib/coach/groups';
import { groupCreateSchema } from '@fahybrid/shared/schema/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk({ groups: await listGroups(auth.session.coach_id) });
}

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, groupCreateSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk({ group: await createGroup(auth.session.coach_id, body.data) }, 201);
  } catch (err) {
    if (err instanceof GroupError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

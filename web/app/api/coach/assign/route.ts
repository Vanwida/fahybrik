// POST /api/coach/assign — «Asignar a varios» (§4.6).
//
// body: { program_id, athlete_ids?, group_ids?, start_date (lunes), start_week?,
//         delivery: 'auto'|'visible'|'draft', on_conflict: 'chain'|'replace'|'skip',
//         dry_run? }
// → { preview: { athletes[{ id, name, conflict, action, start_date, end_date, … }],
//                weeks, sessions_per_athlete, start_date, end_date, counts },
//     applied?: { batch_id, assigned, skipped, failed, replayed, results } }
//
// `dry_run: true` solo calcula la previa (nada se escribe). Sin dry_run crea un
// lote: cada atleta en su transacción; un envío idéntico en los minutos
// siguientes devuelve el mismo lote (replayed) en vez de asignar dos veces.
// Deshacer: POST /api/coach/assign/[batch_id]/undo.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { AssignManyError, runAssign } from '@/lib/coach/assign-many';
import { assignManyInputSchema } from '@fahybrid/shared/schema/assign-many';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, assignManyInputSchema);
  if (!body.ok) return body.response;

  try {
    const result = await runAssign({
      coach_id: auth.session.coach_id,
      user_id: auth.session.user_id,
      input: body.data,
    });
    return jsonOk(result, result.applied && !result.applied.replayed ? 201 : 200);
  } catch (err) {
    if (err instanceof AssignManyError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

// POST /api/coach/import/confirm — #28 importer, STEP 2 (write). Persists the
// coach-approved, fully-typed days into their EXPLICITLY-mapped week templates and
// learns his resolved notation. Rejects (400) if any line still has no catalog
// exercise — nothing untyped/unresolved is ever saved (Alex's sacred rule). Coach
// session required; microcycle + week ownership enforced in the service.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { confirmImport } from '@/lib/import/confirm-service';
import { confirmCycleImport, isCycleConfirmRequest } from '@/lib/import/cycle-confirm';
import { ImportError } from '@/lib/import/proposal-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const result = isCycleConfirmRequest(body)
      ? await confirmCycleImport({ coach_id: session.coach_id, body })
      : await confirmImport({ coach_id: session.coach_id, body });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof ImportError) {
      return jsonError(err.code, err.message, err.status, err.details);
    }
    const message = err instanceof Error ? err.message : 'No se pudo confirmar la importación';
    return jsonError('internal_error', message, 500);
  }
}

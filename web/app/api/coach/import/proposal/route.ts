// POST /api/coach/import/proposal — #28 importer, STEP 1 (review). Reads the
// coach's chosen range/variant from the uploaded xlsx (or pasted text, or Pablo's
// canonical workbook), runs the grammar + per-coach resolver + LLM-assist, and
// returns a TYPED per-day proposal. Saves NOTHING — the coach reviews it, then
// the separate /confirm step writes. Coach session required; microcycle ownership
// enforced in the service.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  buildImportProposalFromRequest,
  ImportError,
} from '@/lib/import/proposal-service';

// The xlsx reader shells out to python3/openpyxl and touches the filesystem, so
// this must run on the Node runtime (not edge). Never statically rendered.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The GENERATE branch (#48) may call the coach-IA LLM to compose the week; allow
// the same budget as the standalone suggest-week route.
export const maxDuration = 180;

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
    const proposal = await buildImportProposalFromRequest({
      coach_id: session.coach_id,
      body,
    });
    return jsonOk(proposal);
  } catch (err) {
    if (err instanceof ImportError) {
      return jsonError(err.code, err.message, err.status, err.details);
    }
    const message = err instanceof Error ? err.message : 'No se pudo extraer la propuesta';
    return jsonError('internal_error', message, 500);
  }
}

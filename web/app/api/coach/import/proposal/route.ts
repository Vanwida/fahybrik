// POST /api/coach/import/proposal — #28 importer, STEP 1 (review). Reads the
// coach's chosen source — an uploaded xlsx, pasted text, an AI-generated week
// (`mode: 'generate'`), or screenshots already uploaded via
// /api/coach/import/upload-url (`mode: 'photo'`) — runs the grammar +
// per-coach resolver + LLM-assist (or, for photo, the vision reader first),
// and returns a TYPED per-day proposal. Saves NOTHING — the coach reviews it,
// then the separate /confirm step writes. Coach session required; microcycle
// ownership and the request shape for every mode are validated inside
// `buildImportProposalFromRequest` (lib/import/proposal-service.ts) — this
// route stays a thin session+dispatch wrapper, same as every mode before it.

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
// The GENERATE branch (#48) composes the week with one LLM call per SESSION. A
// double-session week is 12 of them, and the provider queues concurrent calls, so
// the measured end-to-end is ~204s — over the 180s this used to carry. 300s is the
// ceiling the cron routes already run at. The PHOTO branch shares this ceiling:
// it downloads up to IMPORT_PHOTO_MAX_IMAGES blobs (lib/import/photo-proposal.ts)
// THEN makes its own single vision call, well inside the same budget.
export const maxDuration = 300;

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

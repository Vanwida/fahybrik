// GET  /api/coach/saved-views → { builtin: vistas de serie, views: las del coach }
// POST /api/coach/saved-views → { view }   body: { name, query?, position? }
//
// `query` es la cadena de consulta de la URL de Atletas (sin «?»). Contrato §4.8.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { createSavedView, listSavedViews, SavedViewError } from '@/lib/coach/saved-views';
import { BUILTIN_SAVED_VIEWS, savedViewCreateSchema } from '@fahybrid/shared/schema/saved-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk({ builtin: BUILTIN_SAVED_VIEWS, views: await listSavedViews(auth.session.coach_id) });
}

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, savedViewCreateSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk({ view: await createSavedView(auth.session.coach_id, body.data) }, 201);
  } catch (err) {
    if (err instanceof SavedViewError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}

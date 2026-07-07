// POST /api/coach/session-reports — create a 1:1 session report (#14) for a lead or an
// athlete. Coach-guarded, Zod-validated. The report is the write-up of a videollamada
// (outcome + price for a sales call; notes + next steps always).

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sessionReportInput } from '@fahybrid/shared/schema';
import { createSessionReport, SessionReportError } from '@/lib/coach/session-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = sessionReportInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos del parte inválidos', 400, parsed.error.flatten());
  }

  try {
    const report = await createSessionReport({ coach_id: session.coach_id, input: parsed.data });
    return jsonOk({ report }, 201);
  } catch (err) {
    if (err instanceof SessionReportError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/coach/session-reports]', err);
    return jsonError('error', 'No se pudo guardar el parte', 500);
  }
}

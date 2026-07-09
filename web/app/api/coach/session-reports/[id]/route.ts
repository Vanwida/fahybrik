// PATCH  /api/coach/session-reports/[id] — edit a report's content (#14).
// DELETE /api/coach/session-reports/[id] — soft-delete a report.
// Coach-guarded, Zod-validated, coach-scoped in the store.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sessionReportUpdateInput } from '@fahybrid/shared/schema';
import {
  deleteSessionReport,
  updateSessionReport,
  SessionReportError,
} from '@/lib/coach/session-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return jsonError('invalid_id', 'id inválido', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = sessionReportUpdateInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos del parte inválidos', 400, parsed.error.flatten());
  }

  try {
    const report = await updateSessionReport({
      id: reportId,
      coach_id: session.coach_id,
      input: parsed.data,
      // #43: authorship — the acting coach's users.id (coach_id is a coaches.id).
      by_user_id: session.user_id,
    });
    return jsonOk({ report });
  } catch (err) {
    if (err instanceof SessionReportError) return jsonError(err.code, err.message, err.status);
    console.error('[PATCH /api/coach/session-reports/[id]]', err);
    return jsonError('error', 'No se pudo actualizar el parte', 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return jsonError('invalid_id', 'id inválido', 400);

  try {
    await deleteSessionReport({ id: reportId, coach_id: session.coach_id });
    return jsonOk({ deleted: true });
  } catch (err) {
    if (err instanceof SessionReportError) return jsonError(err.code, err.message, err.status);
    console.error('[DELETE /api/coach/session-reports/[id]]', err);
    return jsonError('error', 'No se pudo borrar el parte', 500);
  }
}

// POST /api/coach/session-reports/[id]/send-summary — send the post-call summary email
// (#11) to the lead. Body may carry coach-edited text (summary / next_steps) used for
// THIS send only (the saved parte is never modified). Falls back to the report's saved
// notes/next_steps. Stamps summary_email_sent_at only on a successful send (re-sendable).

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getSessionReportForSummary, markSummarySent } from '@/lib/coach/session-reports';
import { sendSessionSummaryEmail } from '@/lib/citas/session-summary-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

const bodySchema = z
  .object({
    summary: z.string().trim().max(8000).optional(),
    next_steps: z.string().trim().max(4000).optional(),
  })
  .strict();

function parseId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return jsonError('invalid_id', 'id inválido', 400);

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return jsonError('validation_error', 'Datos inválidos', 400, parsed.error.flatten());

  const found = await getSessionReportForSummary({ id: reportId, coach_id: session.coach_id });
  if (!found) return jsonError('not_found', 'Parte no encontrado o sin lead asociado', 404);

  // Coach-edited text wins for this send; else the saved parte.
  const summary = (parsed.data.summary ?? found.report.notes ?? '').trim();
  const nextSteps = parsed.data.next_steps ?? found.report.next_steps ?? null;
  if (!summary) return jsonError('empty_summary', 'El resumen está vacío — escribe lo que hablasteis.', 400);

  const result = await sendSessionSummaryEmail({
    to: found.lead_email,
    name: found.lead_nombre,
    summary,
    nextSteps,
  });

  if (!result.sent) {
    const msg =
      result.skipped_reason === 'resend_not_configured'
        ? 'Email no configurado en este entorno.'
        : 'No se pudo enviar el email. La nota está intacta, reinténtalo.';
    return jsonError('send_failed', msg, 502);
  }

  await markSummarySent({ id: reportId, coach_id: session.coach_id });
  return jsonOk({ sent: true });
}

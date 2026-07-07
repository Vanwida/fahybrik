// GET  /api/coach/leads/[id] — one lead's full onboarding detail.
// PATCH /api/coach/leads/[id] — advance the lead's pipeline status (coach-settable
//   subset only: contactado | agendado | descartado), enforcing the NO-RETREAT rule.
//   `convertido` is the alta flow (task #5); `parcial`/`nuevo` are system-set. Coach-guarded.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getLeadDetail } from '@/lib/dashboard/coach/leads';
import { LeadTransitionError, reopenLead, transitionLeadStatus } from '@/lib/leads/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseLeadId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const leadId = parseLeadId(id);
  if (leadId == null) return jsonError('invalid_id', 'id debe ser un entero positivo', 400);

  const lead = await getLeadDetail(leadId);
  if (!lead) return jsonError('not_found', 'Lead no encontrado', 404);
  return jsonOk({ lead });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const leadId = parseLeadId(id);
  if (leadId == null) return jsonError('invalid_id', 'id debe ser un entero positivo', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }
  const status = body && typeof body === 'object' ? (body as Record<string, unknown>).status : undefined;
  if (typeof status !== 'string') {
    return jsonError('invalid_status', 'status (string) requerido', 400);
  }

  try {
    // `nuevo` is not a pipeline transition — the only way to reach it is the explicit
    // human-correction reopen (descartado → nuevo). Everything else is the no-retreat
    // pipeline. Both are validated in web/lib/leads/store.ts.
    const lead =
      status === 'nuevo'
        ? await reopenLead({ id: leadId })
        : await transitionLeadStatus({ id: leadId, to: status });
    return jsonOk({ lead });
  } catch (err) {
    if (err instanceof LeadTransitionError) return jsonError(err.code, err.message, err.status);
    console.error('[PATCH /api/coach/leads/[id]]', err);
    return jsonError('update_failed', 'No se pudo actualizar el lead', 500);
  }
}

// POST /api/leads — partial lead capture (two-phase, phase 1).
//
// Fired when the visitor enters their email at the end of bloque A. Creates/updates
// a lead with status='parcial' so an abandoned onboarding still leaves a workable
// lead (feeds nurturing, task #10). Public + IP rate-limited + honeypot-guarded.

import { leadDraftInput } from '@fahybrid/shared/schema';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import { upsertLeadDraft } from '@/lib/leads/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? 'unknown';
  const rl = await withRateLimit({ scope: 'ip', identifier: ip, ...RATE_LIMITS.leadsDraft });
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = leadDraftInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Datos no válidos', 400, parsed.error.flatten());
  }

  // Honeypot: a real user never fills the hidden field. Feign success, persist nothing.
  const { website, ...input } = parsed.data;
  if (website && website.length > 0) {
    return jsonOk({ ok: true }, 200);
  }

  const res = await upsertLeadDraft(input);

  return jsonOk({ ok: true, lead_id: res.id, status: res.status }, res.created ? 201 : 200);
}

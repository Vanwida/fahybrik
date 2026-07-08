// POST /api/leads/unsubscribe — public RGPD opt-out (#10). Body: { token }.
//
// Token-gated (no auth), rate-limited. Sets leads.no_contactar=true for the lead owning
// the unsubscribe_token, which stops ALL future nurturing for that lead (the selector
// excludes no_contactar leads). Idempotent and safe on an unknown token — we always return
// ok so the endpoint never leaks whether a token exists.
//
// It is a POST (not a GET) on purpose: the confirmation page (/es/no-mas-emails) collects
// the click, so an email-client GET prefetch can never auto-unsubscribe someone.

import { z } from 'zod';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import { setLeadNoContactar } from '@/lib/leads/nurture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Opaque token (leads.unsubscribe_token = 32 hex chars today; kept tolerant + charset-safe).
const bodySchema = z.object({
  token: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9]+$/),
});

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req) ?? 'unknown';
  const rl = await withRateLimit({ scope: 'ip', identifier: ip, ...RATE_LIMITS.leadsUnsubscribe });
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Token no válido', 400, parsed.error.flatten());
  }

  try {
    await setLeadNoContactar(parsed.data.token);
    // Always ok — never disclose whether the token matched a lead.
    return jsonOk({ ok: true }, 200);
  } catch (err) {
    console.error('[POST /api/leads/unsubscribe]', err);
    return jsonError('error', 'No se pudo procesar la baja', 500);
  }
}

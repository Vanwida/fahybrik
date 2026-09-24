// POST /api/leads — partial lead capture (two-phase, phase 1).
//
// Fired when the visitor enters their email at the end of bloque A. Creates/updates
// a lead with status='parcial' so an abandoned onboarding still leaves a workable
// lead (feeds nurturing, task #10). Public + IP rate-limited + honeypot-guarded.

import { leadDraftInput } from '@fahybrid/shared/schema';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import { upsertLeadDraft } from '@/lib/leads/store';
import { captureKeyFromCookieHeader, captureKeySetCookie } from '@/lib/leads/capture-key';

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

  // Un lead que ya existe solo lo retoca el navegador que lo creó (su clave de
  // captura). La respuesta no dice nada de la fila: ni id ni estado — así un email
  // ajeno no revela si esa persona es lead ni en qué punto está.
  const res = await upsertLeadDraft(input, { key: captureKeyFromCookieHeader(req.headers.get('cookie')) });

  const out = jsonOk({ ok: true }, res.created ? 201 : 200);
  if (res.capture_key) out.headers.append('set-cookie', captureKeySetCookie(res.capture_key));
  return out;
}

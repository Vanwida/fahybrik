import { z } from 'zod';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { declineInvitation } from '@/lib/partner/invitations';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const declineSchema = z.object({
  token: z.string().min(1).max(512),
});

// POST /api/athlete/partner/decline — the INVITEE rejects a pending invitation
// (pending → declined). The token IS the authorization (held from the deeplink),
// so no session is required — mirrors the unauthenticated redeem path. Rate-
// limited per IP against token guessing. Declining an already-declined
// invitation is an idempotent success.
export async function POST(req: Request) {
  const rl = await withRateLimit({
    scope: 'ip',
    identifier: getClientIp(req) ?? 'unknown',
    ...RATE_LIMITS.partnerRedeem,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = declineSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  const result = await declineInvitation(parsed.data.token);
  if (!result.ok) {
    const httpStatus = result.error.code === 'token_invalid' ? 404 : 410;
    return jsonError(result.error.code, result.error.message, httpStatus);
  }
  return jsonOk({ declined: true });
}

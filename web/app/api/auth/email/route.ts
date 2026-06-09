import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/auth/config';
import {
  createMagicLink,
  isCoachAllowlisted,
  sendMagicLinkEmail,
} from '@/lib/auth/magic-link';
import { getClientIp, jsonError } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const emailRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export async function POST(req: Request) {
  // A1: throttle magic-link requests per IP to prevent email enumeration/spam.
  const rlIp = getClientIp(req) ?? 'unknown';
  const rl = await withRateLimit({
    scope: 'ip',
    identifier: rlIp,
    ...RATE_LIMITS.authEmail,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = emailRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'A valid email is required', 400, parsed.error.flatten());
  }

  const email = parsed.data.email;

  if (!(await isCoachAllowlisted(email))) {
    return new Response(null, { status: 204 });
  }

  const link = await createMagicLink(email, { requested_ip: getClientIp(req) });
  const url = new URL(`${AUTH_CONFIG.appUrl()}/auth/verify`);
  url.searchParams.set('token', link.token_plaintext);

  await sendMagicLinkEmail({
    to: email,
    link: url.toString(),
    expires_at: link.expires_at,
  });

  return new Response(null, { status: 204 });
}

import { z } from 'zod';
import { verifyAppleIdToken } from '@/lib/auth/apple';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { audiences, issueSession } from '@/lib/auth/session';
import { findOrCreateAthleteForApple } from '@/lib/auth/users';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const appleSignInSchema = z.object({
  id_token: z.string().min(20),
  nonce: z.string().min(1).max(256).optional(),
  full_name: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = appleSignInSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  let identity;
  try {
    identity = await verifyAppleIdToken({
      id_token: parsed.data.id_token,
      ...(parsed.data.nonce !== undefined ? { expected_nonce: parsed.data.nonce } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'apple_token_invalid';
    return jsonError('apple_token_invalid', message, 401);
  }

  const result = await findOrCreateAthleteForApple(
    { apple_user_id: identity.apple_user_id, email: identity.email },
    { full_name: parsed.data.full_name ?? null },
  );

  const userAgent = req.headers.get('user-agent');
  const ip = getClientIp(req);
  const session = await issueSession({
    user_id: result.user.id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: userAgent,
    ip,
  });

  return jsonOk({
    user_id: result.user.id.toString(),
    athlete_id: result.athlete.id.toString(),
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
    email: result.user.email,
    is_private_email: identity.is_private_email,
    full_name: result.athlete.full_name,
    onboarded_at: result.athlete.onboarded_at?.toISOString() ?? null,
  });
}

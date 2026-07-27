import { z } from 'zod';
import { verifyAppleIdToken } from '@/lib/auth/apple';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { createFreeAthlete, isFreeSignupEnabled } from '@/lib/auth/free-signup';
import { audiences, issueSession } from '@/lib/auth/session';
import { findAthleteForApple } from '@/lib/auth/users';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const appleSignInSchema = z.object({
  id_token: z.string().min(20),
  nonce: z.string().min(1).max(256).optional(),
  full_name: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  // A1: throttle Apple sign-in per IP (brute-force / token-replay floods).
  const rl = await withRateLimit({
    scope: 'ip',
    identifier: getClientIp(req) ?? 'unknown',
    ...RATE_LIMITS.appleSignIn,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

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

  let result = await findAthleteForApple({
    apple_user_id: identity.apple_user_id,
    email: identity.email,
    email_verified: identity.email_verified,
  });

  // Alta free (solo con FREE_SIGNUP encendido): un Apple ID desconocido crea su
  // cuenta con los datos del identity token verificado — atleta SIN coach y la
  // MISMA sesión de siempre. createFreeAthlete rechaza (null) las colisiones
  // inseguras (email sin verificar sobre cuenta ajena, cuenta de coach) → caen
  // en el mismo 404 no_account de hoy.
  if (!result && isFreeSignupEnabled()) {
    result = await createFreeAthlete({
      email: identity.email,
      email_verified: identity.email_verified,
      apple_user_id: identity.apple_user_id,
      full_name: parsed.data.full_name ?? null,
    });
  }

  // Login never provisions membership: an unknown Apple ID (organic download)
  // has no account → 404 no_account. The app routes them to the funnel.
  if (!result) {
    return jsonError('no_account', 'No hay ninguna cuenta asociada a este Apple ID.', 404);
  }

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
    // Campo ADITIVO (los decoders instalados ignoran claves desconocidas):
    // false = atleta sin coach (tier free) → la app decide qué superficie enseña.
    has_coach: result.athlete.coach_id != null,
  });
}

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AUTH_CONFIG } from './config';

const APPLE_JWKS = createRemoteJWKSet(new URL(AUTH_CONFIG.appleJwksUrl), {
  cooldownDuration: 30_000,
});

export interface AppleIdTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  nonce?: string;
  nonce_supported?: boolean;
}

export interface VerifyAppleTokenInput {
  id_token: string;
  expected_nonce?: string;
}

export interface VerifiedAppleIdentity {
  apple_user_id: string;
  email: string | null;
  email_verified: boolean;
  is_private_email: boolean;
}

function coerceBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

export async function verifyAppleIdToken(
  input: VerifyAppleTokenInput,
): Promise<VerifiedAppleIdentity> {
  const expectedAudience = AUTH_CONFIG.appleClientId();
  if (!expectedAudience) {
    throw new Error('APPLE_CLIENT_ID is not configured');
  }

  const { payload } = await jwtVerify(input.id_token, APPLE_JWKS, {
    issuer: AUTH_CONFIG.appleIssuer,
    audience: expectedAudience,
    algorithms: ['RS256'],
  });

  const claims = payload as AppleIdTokenClaims;

  if (!claims.sub) {
    throw new Error('apple_token_missing_sub');
  }

  if (input.expected_nonce && claims.nonce && claims.nonce !== input.expected_nonce) {
    throw new Error('apple_token_nonce_mismatch');
  }

  return {
    apple_user_id: claims.sub,
    email: claims.email ? claims.email.toLowerCase() : null,
    email_verified: coerceBoolean(claims.email_verified),
    is_private_email: coerceBoolean(claims.is_private_email),
  };
}

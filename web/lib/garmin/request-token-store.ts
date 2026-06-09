// Transient store for the OAuth 1.0a *request token secret*.
//
// WHY THIS EXISTS
// ---------------
// Garmin's OAuth 1.0a flow (RFC 5849) returns an `oauth_token` AND an
// `oauth_token_secret` from the request_token step. That secret is REQUIRED to
// sign the later access_token exchange — the signing key for that call is
// `consumer_secret & request_token_secret`. Without it, Garmin rejects the
// access_token request. There is no DB table for this short-lived secret and we
// don't want one: it lives for the duration of a single browser authorize
// round-trip (typically < 2 min).
//
// We therefore carry it in an encrypted, HttpOnly, SameSite=Lax cookie scoped to
// the athlete + oauth_token. SameSite=Lax is correct because Garmin redirects the
// athlete's browser back to /api/garmin/callback as a top-level GET navigation,
// so the cookie is sent. The payload is AES-256-GCM encrypted (same key as the
// token store) so the secret is never exposed in plaintext, even client-side.
//
// DRY: reuses @/lib/crypto/aes-gcm; no new dependency, no migration.

import { encrypt, decrypt } from '@/lib/crypto/aes-gcm';

export const GARMIN_REQUEST_COOKIE = 'garmin_oauth_req';

// Short TTL — the authorize round-trip is seconds; cap at 15 min to bound risk.
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

type RequestTokenPayload = {
  athlete_id: string;
  oauth_token: string;
  oauth_token_secret: string;
  // Unix seconds; rejected on read if past.
  expires_at: number;
};

// Build the Set-Cookie header value carrying the encrypted request-token secret.
export function buildRequestTokenCookie(params: {
  athlete_id: string;
  oauth_token: string;
  oauth_token_secret: string;
  secure: boolean;
}): string {
  const payload: RequestTokenPayload = {
    athlete_id: params.athlete_id,
    oauth_token: params.oauth_token,
    oauth_token_secret: params.oauth_token_secret,
    expires_at: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS,
  };
  const value = encrypt(JSON.stringify(payload)).toString('base64url');
  const attrs = [
    `${GARMIN_REQUEST_COOKIE}=${value}`,
    'Path=/api/garmin',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    params.secure ? 'Secure' : '',
  ].filter(Boolean);
  return attrs.join('; ');
}

// Clears the cookie (post-exchange or on error).
export function clearRequestTokenCookie(secure: boolean): string {
  const attrs = [
    `${GARMIN_REQUEST_COOKIE}=`,
    'Path=/api/garmin',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean);
  return attrs.join('; ');
}

// Parse + validate the request-token cookie from a raw Cookie header. Returns
// null if absent, malformed, expired, or if athlete/oauth_token don't match the
// callback (which guards against a cross-flow / replayed cookie).
export function readRequestTokenCookie(params: {
  cookieHeader: string | null;
  expected_athlete_id: string;
  expected_oauth_token: string;
}): RequestTokenPayload | null {
  if (!params.cookieHeader) return null;
  const raw = extractCookie(params.cookieHeader, GARMIN_REQUEST_COOKIE);
  if (!raw) return null;
  let payload: RequestTokenPayload;
  try {
    payload = JSON.parse(decrypt(Buffer.from(raw, 'base64url'))) as RequestTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.expires_at !== 'number' ||
    payload.expires_at < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  if (payload.athlete_id !== params.expected_athlete_id) return null;
  if (payload.oauth_token !== params.expected_oauth_token) return null;
  return payload;
}

function extractCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

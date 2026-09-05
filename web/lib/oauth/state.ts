// Generic OAuth 2.0 CSRF/state via an encrypted, HttpOnly cookie — PROVIDER-
// PARAMETERIZED.
//
// WHY THIS EXISTS
// ---------------
// The OAuth2 authorize redirect must carry a `state` value that we later verify
// on the callback to defend against CSRF / cross-flow replay (RFC 6749 §10.12).
// We also need to recover WHICH athlete started the flow on the callback. Rather
// than a DB table for this seconds-long round-trip, we carry it in an encrypted,
// HttpOnly, SameSite=Lax cookie scoped to /api/{provider} — same approach as the
// Garmin request-token store, generalized across providers.
//
// SameSite=Lax is correct: the provider redirects the athlete's browser back to
// /api/{provider}/callback as a top-level GET navigation, so the cookie is sent.
// The payload is AES-256-GCM encrypted (same key as the token store) so neither
// the athlete id nor the nonce is ever exposed in plaintext, even client-side.
//
// DRY: reuses @/lib/crypto/aes-gcm and the WearableProvider union; no new
// dependency, no migration.

import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '@/lib/crypto/aes-gcm';
import type { WearableProvider } from '@/lib/wearables/token-store';

// 900s TTL — the authorize round-trip is seconds; cap at 15 min to bound risk.
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

// 16 random bytes -> 32 hex chars. Comfortably above WHOOP's >=8-char minimum
// and provides ~128 bits of CSRF entropy.
const NONCE_BYTES = 16;

type StatePayload = {
  athlete_id: string;
  provider: WearableProvider;
  nonce: string;
  // Unix seconds; rejected on read if past.
  expires_at: number;
  // PKCE S256 verifier (COROS MCP). Polar ignores this field.
  code_verifier?: string;
};

export function stateCookieName(provider: WearableProvider): string {
  return `${provider}_oauth_state`;
}

// Build the Set-Cookie header carrying the encrypted state payload, and return
// the nonce to embed as the OAuth `state` query param in the authorize URL.
export function buildStateCookie(params: {
  provider: WearableProvider;
  athlete_id: bigint;
  secure: boolean;
  code_verifier?: string;
}): { cookie: string; state: string } {
  const nonce = randomBytes(NONCE_BYTES).toString('hex');
  const payload: StatePayload = {
    athlete_id: params.athlete_id.toString(),
    provider: params.provider,
    nonce,
    expires_at: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS,
    ...(params.code_verifier ? { code_verifier: params.code_verifier } : {}),
  };
  const value = encrypt(JSON.stringify(payload)).toString('base64url');
  const attrs = [
    `${stateCookieName(params.provider)}=${value}`,
    `Path=/api/${params.provider}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    params.secure ? 'Secure' : '',
  ].filter(Boolean);
  return { cookie: attrs.join('; '), state: nonce };
}

// Parse + validate the state cookie against the `state` echoed back by the
// provider. Returns the athlete_id on success; null if the cookie is absent,
// malformed, expired, for a different provider, or the nonce does not match
// (CSRF / replay guard).
export function readStateCookie(params: {
  provider: WearableProvider;
  cookieHeader: string | null;
  state: string;
}): { athlete_id: bigint; code_verifier?: string } | null {
  if (!params.cookieHeader || !params.state) return null;
  const raw = extractCookie(params.cookieHeader, stateCookieName(params.provider));
  if (!raw) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(decrypt(Buffer.from(raw, 'base64url'))) as StatePayload;
  } catch {
    return null;
  }

  if (
    typeof payload.expires_at !== 'number' ||
    payload.expires_at < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  if (payload.provider !== params.provider) return null;
  if (payload.nonce !== params.state) return null;
  if (typeof payload.athlete_id !== 'string' || !/^\d+$/.test(payload.athlete_id)) return null;

  return {
    athlete_id: BigInt(payload.athlete_id),
    ...(typeof payload.code_verifier === 'string' && payload.code_verifier.length > 0
      ? { code_verifier: payload.code_verifier }
      : {}),
  };
}

// Clears the cookie (post-exchange or on error).
export function clearStateCookie(provider: WearableProvider, secure: boolean): string {
  const attrs = [
    `${stateCookieName(provider)}=`,
    `Path=/api/${provider}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean);
  return attrs.join('; ');
}

function extractCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

// Single-purpose signed token that authorizes ONE wearable OAuth start.
//
// WHY THIS EXISTS
// ---------------
// The provider `connect` endpoint (e.g. GET /api/polar/connect) is a top-level
// browser navigation — the athlete's phone opens it in Safari, so it cannot
// carry an Authorization: Bearer header. If it trusted a raw `athlete_id` query
// param, anyone could vinculate THEIR provider account to ANY athlete_id and
// poison that athlete's data. Instead the app first calls an authenticated
// endpoint (bearer) that mints this short-lived token bound to the caller's OWN
// athlete_id; the connect endpoint accepts only the token and recovers the
// athlete_id from it. The token never leaves the athlete's device+session chain.
//
// The payload is AES-256-GCM encrypted (same ENCRYPTION_KEY as the OAuth state
// cookie and the token store) so it is BOTH confidential and tamper-evident: the
// GCM auth tag makes any bit-flip fail decryption. DRY: reuses @/lib/crypto and
// the WearableProvider union — no new dependency, no secret, no migration.
//
// Provider-generic on purpose: the same mint/verify serves polar today and any
// future OAuth2 wearable (coros, suunto, …) — `verify` binds the token to the
// provider it was minted for and rejects a cross-provider replay.

import { encrypt, decrypt } from '@/lib/crypto/aes-gcm';
import type { WearableProvider } from '@/lib/wearables/token-store';

// 10 minutes: the app mints the token and immediately opens the connect URL, so
// the useful window is seconds. Cap tight to bound replay if the URL leaks.
const DEFAULT_TTL_SECONDS = 10 * 60;

type ConnectTokenPayload = {
  // Stringified bigint — JSON has no bigint, matches the state-cookie encoding.
  athlete_id: string;
  provider: WearableProvider;
  // Unix seconds; rejected on verify once past.
  exp: number;
};

export type VerifyConnectTokenResult =
  | { ok: true; athlete_id: bigint }
  | { ok: false; reason: 'malformed' | 'provider_mismatch' | 'expired' };

// Mint an encrypted, expiring token binding an athlete to a single provider's
// OAuth start. Requires ENCRYPTION_KEY (throws CryptoConfigError if unset — the
// caller gates on isCryptoConfigured first, exactly like the connect route).
export function mintConnectToken(params: {
  athlete_id: bigint;
  provider: WearableProvider;
  ttlSeconds?: number;
}): string {
  const payload: ConnectTokenPayload = {
    athlete_id: params.athlete_id.toString(),
    provider: params.provider,
    exp: Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  return encrypt(JSON.stringify(payload)).toString('base64url');
}

// Verify a token for the expected provider. Rejects, in order: a tampered /
// unreadable blob or bad shape ('malformed'), a token minted for another
// provider ('provider_mismatch'), or an expired one ('expired'). Returns the
// recovered athlete_id on success.
export function verifyConnectToken(params: {
  token: string;
  provider: WearableProvider;
}): VerifyConnectTokenResult {
  let payload: ConnectTokenPayload;
  try {
    payload = JSON.parse(decrypt(Buffer.from(params.token, 'base64url'))) as ConnectTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload.athlete_id !== 'string' || !/^\d+$/.test(payload.athlete_id)) {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.provider !== params.provider) {
    return { ok: false, reason: 'provider_mismatch' };
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, athlete_id: BigInt(payload.athlete_id) };
}

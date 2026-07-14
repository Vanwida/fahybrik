// Single-purpose OAuth connect token — mint/verify. Pure crypto, no DB.
// Locks: round-trip recovers the athlete; a tampered / garbage blob, an expired
// token, and a cross-provider token are all rejected with the right reason.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mintConnectToken, verifyConnectToken } from '@/lib/wearables/connect-token';

// 32-byte key, hex — the shape lib/crypto/aes-gcm expects.
const TEST_KEY = 'a'.repeat(64);
let prevKey: string | undefined;

beforeAll(() => {
  prevKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = TEST_KEY;
});
afterAll(() => {
  if (prevKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = prevKey;
});

describe('connect-token mint/verify', () => {
  it('round-trips: verify recovers the minted athlete_id', () => {
    const token = mintConnectToken({ athlete_id: BigInt(12345), provider: 'polar' });
    const res = verifyConnectToken({ token, provider: 'polar' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.athlete_id).toBe(BigInt(12345));
  });

  it('rejects an expired token', () => {
    const token = mintConnectToken({ athlete_id: BigInt(7), provider: 'polar', ttlSeconds: -1 });
    const res = verifyConnectToken({ token, provider: 'polar' });
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a tampered token (GCM auth tag fails)', () => {
    const token = mintConnectToken({ athlete_id: BigInt(7), provider: 'polar' });
    const rep = token[0] === 'A' ? 'B' : 'A';
    const tampered = rep + token.slice(1);
    const res = verifyConnectToken({ token: tampered, provider: 'polar' });
    expect(res).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects arbitrary garbage', () => {
    const res = verifyConnectToken({ token: 'not-a-real-token', provider: 'polar' });
    expect(res).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a cross-provider token (minted for coros, verified for polar)', () => {
    const token = mintConnectToken({ athlete_id: BigInt(7), provider: 'coros' });
    const res = verifyConnectToken({ token, provider: 'polar' });
    expect(res).toEqual({ ok: false, reason: 'provider_mismatch' });
  });

  it('a token minted for a provider verifies for THAT provider', () => {
    const token = mintConnectToken({ athlete_id: BigInt(99), provider: 'coros' });
    const res = verifyConnectToken({ token, provider: 'coros' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.athlete_id).toBe(BigInt(99));
  });
});

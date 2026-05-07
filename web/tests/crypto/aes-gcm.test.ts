import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, isCryptoConfigured } from '@/lib/crypto/aes-gcm';

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe('aes-gcm', () => {
  test('round-trips a simple string', () => {
    const blob = encrypt('garmin-access-token-xyz');
    expect(blob).toBeInstanceOf(Buffer);
    expect(blob.length).toBeGreaterThan(12 + 16);
    expect(decrypt(blob)).toBe('garmin-access-token-xyz');
  });

  test('two encryptions of same plaintext differ (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  test('decrypt fails on tampered ciphertext', () => {
    const blob = encrypt('payload');
    blob[blob.length - 1] ^= 0x01;
    expect(() => decrypt(blob)).toThrow();
  });

  test('isCryptoConfigured detects missing key', () => {
    expect(isCryptoConfigured()).toBe(true);
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(isCryptoConfigured()).toBe(false);
    process.env.ENCRYPTION_KEY = saved;
  });

  test('rejects keys with wrong length', () => {
    const saved = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = '0011'; // way too short
    expect(() => encrypt('x')).toThrow();
    process.env.ENCRYPTION_KEY = saved;
  });
});

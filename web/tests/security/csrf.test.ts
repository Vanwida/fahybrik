// A15 — CSRF Origin/Referer check unit tests. Validates that mutations from a
// foreign origin are rejected while same-origin requests and safe methods pass.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { assertSameOrigin, isAllowedOriginHeader, isSameOrigin } from '@/lib/security/csrf';

const APP_ORIGIN = 'https://app.fahybrid.com';

function req(method: string, headers: Record<string, string>): Request {
  return new Request('https://app.fahybrid.com/api/coach/x', { method, headers });
}

let prevAppUrl: string | undefined;
let prevPublicAppUrl: string | undefined;
let prevNodeEnv: string | undefined;

beforeEach(() => {
  prevAppUrl = process.env.APP_URL;
  prevPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  prevNodeEnv = process.env.NODE_ENV;
  process.env.APP_URL = APP_ORIGIN;
  process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
  // Force production semantics so localhost isn't auto-allowed in assertions.
  (process.env as Record<string, string>).NODE_ENV = 'production';
});

afterEach(() => {
  if (prevAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = prevAppUrl;
  if (prevPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = prevPublicAppUrl;
  (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
});

describe('isSameOrigin (method-aware)', () => {
  test('allows GET regardless of origin', () => {
    expect(isSameOrigin(req('GET', { origin: 'https://evil.com' }))).toBe(true);
  });

  test('allows POST from the app origin', () => {
    expect(isSameOrigin(req('POST', { origin: APP_ORIGIN }))).toBe(true);
  });

  test('rejects POST from a foreign origin', () => {
    expect(isSameOrigin(req('POST', { origin: 'https://evil.com' }))).toBe(false);
  });

  test('falls back to Referer when Origin is absent', () => {
    expect(isSameOrigin(req('POST', { referer: `${APP_ORIGIN}/dashboard` }))).toBe(true);
    expect(isSameOrigin(req('POST', { referer: 'https://evil.com/x' }))).toBe(false);
  });

  test('rejects a mutation with no Origin and no Referer', () => {
    expect(isSameOrigin(req('POST', {}))).toBe(false);
  });

  test('rejects PUT/PATCH/DELETE from foreign origin', () => {
    expect(isSameOrigin(req('PUT', { origin: 'https://evil.com' }))).toBe(false);
    expect(isSameOrigin(req('PATCH', { origin: 'https://evil.com' }))).toBe(false);
    expect(isSameOrigin(req('DELETE', { origin: 'https://evil.com' }))).toBe(false);
  });
});

describe('assertSameOrigin', () => {
  test('returns null when allowed', () => {
    expect(assertSameOrigin(req('POST', { origin: APP_ORIGIN }))).toBeNull();
  });

  test('returns a 403 response when rejected', () => {
    const res = assertSameOrigin(req('POST', { origin: 'https://evil.com' }));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });
});

describe('isAllowedOriginHeader (header-only, used in getCoachSession)', () => {
  test('allows when no Origin header (same-origin GET)', () => {
    expect(isAllowedOriginHeader(null)).toBe(true);
  });

  test('allows a matching Origin', () => {
    expect(isAllowedOriginHeader(APP_ORIGIN)).toBe(true);
  });

  test('rejects a foreign Origin', () => {
    expect(isAllowedOriginHeader('https://evil.com')).toBe(false);
  });
});

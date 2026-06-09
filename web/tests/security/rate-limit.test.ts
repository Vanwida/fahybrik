// A1 — table-based rate limiter unit tests. Exercises the fixed-window bucket
// logic against the fake postgres client: window boundaries, increment +
// allow/deny transitions, and fail-open on DB error.

import { describe, expect, test } from 'vitest';
import {
  RATE_LIMITS,
  rateLimitResponse,
  windowStartFor,
  withRateLimit,
} from '@/lib/security/rate-limit';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

const WINDOW_SEC = 60;

/**
 * Build a fake sql whose upsert returns a monotonically increasing count,
 * simulating the real ON CONFLICT ... count + 1 behaviour for a single bucket.
 */
function countingSql(counterRef: { value: number }): ReturnType<typeof createFakeSql> {
  const handler: SqlHandler = (sqlText) => {
    if (sqlText.includes('insert into rate_limit_buckets')) {
      counterRef.value += 1;
      return [{ count: counterRef.value }];
    }
    // delete (prune) — return nothing
    return [];
  };
  return createFakeSql(handler);
}

describe('windowStartFor', () => {
  test('truncates to the start of the fixed window', () => {
    // 90s into the epoch with a 60s window → window starts at 60s.
    const start = windowStartFor(90_000, 60);
    expect(start.getTime()).toBe(60_000);
  });

  test('two timestamps in the same window share a start', () => {
    const a = windowStartFor(61_000, 60);
    const b = windowStartFor(119_999, 60);
    expect(a.getTime()).toBe(b.getTime());
  });

  test('crossing the boundary yields a new window', () => {
    const a = windowStartFor(59_000, 60);
    const b = windowStartFor(60_000, 60);
    expect(b.getTime()).toBeGreaterThan(a.getTime());
  });
});

describe('withRateLimit', () => {
  test('allows requests up to the limit then blocks', async () => {
    const counter = { value: 0 };
    const fake = countingSql(counter);
    const params = {
      scope: 'ip',
      endpoint: 'test',
      identifier: '1.2.3.4',
      limit: 3,
      windowSec: WINDOW_SEC,
    };
    const r1 = await withRateLimit(params, { client: fake, now: () => 1000 });
    const r2 = await withRateLimit(params, { client: fake, now: () => 1000 });
    const r3 = await withRateLimit(params, { client: fake, now: () => 1000 });
    const r4 = await withRateLimit(params, { client: fake, now: () => 1000 });

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfter).toBeGreaterThan(0);
  });

  test('resets in a new window', async () => {
    // Fresh counter per window simulates the (key, window_start) PK reset.
    const params = {
      scope: 'ip',
      endpoint: 'test',
      identifier: 'x',
      limit: 1,
      windowSec: WINDOW_SEC,
    };
    const w1 = { value: 0 };
    const a = await withRateLimit(params, { client: countingSql(w1), now: () => 5_000 });
    const b = await withRateLimit(params, { client: countingSql(w1), now: () => 5_000 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false);

    // New window → new bucket row → count resets.
    const w2 = { value: 0 };
    const c = await withRateLimit(params, { client: countingSql(w2), now: () => 70_000 });
    expect(c.allowed).toBe(true);
  });

  test('fails open when the DB throws', async () => {
    const fake = createFakeSql(() => {
      throw new Error('connection refused');
    });
    const result = await withRateLimit(
      { scope: 'ip', endpoint: 'test', identifier: 'y', limit: 1, windowSec: WINDOW_SEC },
      { client: fake, now: () => 0 },
    );
    expect(result.allowed).toBe(true);
  });

  test('retryAfter is the seconds until the window rolls over', async () => {
    const counter = { value: 0 };
    const result = await withRateLimit(
      { scope: 'ip', endpoint: 'test', identifier: 'z', limit: 5, windowSec: 60 },
      { client: countingSql(counter), now: () => 10_000 },
    );
    // window starts at 0, ends at 60_000; now is 10_000 → 50s left.
    expect(result.retryAfter).toBe(50);
  });
});

describe('RATE_LIMITS spec values', () => {
  test('match the A1 specification', () => {
    expect(RATE_LIMITS.authEmail).toEqual({ endpoint: 'auth-email', limit: 5, windowSec: 60 });
    expect(RATE_LIMITS.appleSignIn).toEqual({ endpoint: 'apple-signin', limit: 5, windowSec: 60 });
    expect(RATE_LIMITS.partnerInvite).toEqual({ endpoint: 'partner-invite', limit: 10, windowSec: 3600 });
    expect(RATE_LIMITS.partnerRedeem).toEqual({ endpoint: 'partner-redeem', limit: 10, windowSec: 60 });
    expect(RATE_LIMITS.aiSuggest).toEqual({ endpoint: 'ai-suggest', limit: 30, windowSec: 3600 });
    expect(RATE_LIMITS.exportData).toEqual({ endpoint: 'export-data', limit: 3, windowSec: 3600 });
    expect(RATE_LIMITS.chatSend).toEqual({ endpoint: 'chat-send', limit: 60, windowSec: 60 });
    expect(RATE_LIMITS.devicesRegister).toEqual({ endpoint: 'devices-register', limit: 30, windowSec: 60 });
  });
});

describe('rateLimitResponse', () => {
  test('returns 429 with a Retry-After header', () => {
    const res = rateLimitResponse({
      allowed: false,
      remaining: 0,
      retryAfter: 42,
      windowStart: new Date(0),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
  });
});

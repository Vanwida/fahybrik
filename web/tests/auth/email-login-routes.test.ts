// Passwordless athlete EMAIL-CODE login — ROUTE layer. Mocks the lib boundaries
// (rate-limit, find-only resolver, code lib, session mint) so the tests pin the
// route ORCHESTRATION: enumeration-safety on request, session-mint on a good code,
// generic rejects on a bad/expired/over-cap code, and rate-limit short-circuits.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/security/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/rate-limit')>();
  return { ...actual, withRateLimit: vi.fn() };
});
vi.mock('@/lib/auth/email-code', () => ({
  createEmailLoginCode: vi.fn(),
  sendEmailLoginCode: vi.fn(),
  consumeEmailLoginCode: vi.fn(),
}));
vi.mock('@/lib/auth/users', () => ({ findAthleteByEmail: vi.fn() }));
vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, issueSession: vi.fn() };
});

const { withRateLimit } = await import('@/lib/security/rate-limit');
const { createEmailLoginCode, sendEmailLoginCode, consumeEmailLoginCode } = await import(
  '@/lib/auth/email-code'
);
const { findAthleteByEmail } = await import('@/lib/auth/users');
const { issueSession, audiences } = await import('@/lib/auth/session');
const { POST: requestPOST } = await import('@/app/api/auth/email/request/route');
const { POST: verifyPOST } = await import('@/app/api/auth/email/verify/route');

const ALLOWED = { allowed: true, remaining: 5, retryAfter: 600, windowStart: new Date() };
const BLOCKED = { allowed: false, remaining: 0, retryAfter: 600, windowStart: new Date() };

const ACCOUNT = {
  user: { id: BigInt(132), email: 'fabregas.scd@gmail.com', apple_user_id: null, role: 'athlete' as const },
  athlete: { id: BigInt(63), user_id: BigInt(132), full_name: 'Gerard', onboarded_at: null, coach_id: BigInt(60) },
};

function post(body: unknown): Request {
  return new Request('http://localhost/api/auth/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

// The review gate reads these at request time; keep every test hermetic by
// clearing them by default and setting them only in the gate-specific tests.
const REVIEW_EMAIL = 'review@fahybrid.com';
const REVIEW_CODE = 'FAHYBRID-REVIEW-7Q2X'; // alphanumeric on purpose (higher entropy)

const REVIEW_ACCOUNT = {
  user: { id: BigInt(900), email: REVIEW_EMAIL, apple_user_id: null, role: 'athlete' as const },
  athlete: { id: BigInt(901), user_id: BigInt(900), full_name: 'Review FAHYBRID', onboarded_at: null, coach_id: BigInt(60) },
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.REVIEW_ACCESS_EMAIL;
  delete process.env.REVIEW_ACCESS_CODE;
  vi.mocked(withRateLimit).mockResolvedValue(ALLOWED);
  vi.mocked(createEmailLoginCode).mockResolvedValue({
    code_plaintext: '424242',
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
  });
  vi.mocked(sendEmailLoginCode).mockResolvedValue({ sent: true });
  vi.mocked(issueSession).mockResolvedValue({
    token: 'session.jwt.token',
    jti: 'jti-1',
    expires_at: new Date(Date.now() + 1000),
  });
});

describe('POST /api/auth/email/request', () => {
  it('member email → issues + emails a code, generic 200', async () => {
    vi.mocked(findAthleteByEmail).mockResolvedValue(ACCOUNT);
    const res = await requestPOST(post({ email: 'Fabregas.SCD@gmail.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createEmailLoginCode).toHaveBeenCalledOnce();
    expect(sendEmailLoginCode).toHaveBeenCalledOnce();
    const sendArg = vi.mocked(sendEmailLoginCode).mock.calls[0][0];
    expect(sendArg.to).toBe('fabregas.scd@gmail.com');
    expect(sendArg.code).toBe('424242');
  });

  it('non-member email → NO code, NO email, but the SAME generic 200 (no enumeration)', async () => {
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    const res = await requestPOST(post({ email: 'nobody@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createEmailLoginCode).not.toHaveBeenCalled();
    expect(sendEmailLoginCode).not.toHaveBeenCalled();
  });

  it('rate-limited → 429, and never touches the account or the mailer', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce(BLOCKED);
    const res = await requestPOST(post({ email: 'a@b.com' }));
    expect(res.status).toBe(429);
    expect(findAthleteByEmail).not.toHaveBeenCalled();
    expect(sendEmailLoginCode).not.toHaveBeenCalled();
  });

  it('invalid email → 400 invalid_request', async () => {
    const res = await requestPOST(post({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });
});

describe('POST /api/auth/email/verify', () => {
  it('valid code → mints an ATHLETE session and returns the apple-shaped body', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'fabregas.scd@gmail.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(ACCOUNT);

    const res = await verifyPOST(post({ email: 'fabregas.scd@gmail.com', code: '424242' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_token).toBe('session.jwt.token');
    expect(body.athlete_id).toBe('63');
    expect(body.user_id).toBe('132');
    expect(body.onboarded_at).toBeNull();
    expect(body.has_coach).toBe(true);
    expect(issueSession).toHaveBeenCalledOnce();
    expect(vi.mocked(issueSession).mock.calls[0][0].audience).toBe(audiences.athlete);
  });

  it('wrong / expired code → 400 invalid_code, no session minted', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: false, reason: 'invalid' });
    const res = await verifyPOST(post({ email: 'a@b.com', code: '000000' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_code');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('over the attempt cap → 429 too_many_attempts', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: false, reason: 'too_many_attempts' });
    const res = await verifyPOST(post({ email: 'a@b.com', code: '000000' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('too_many_attempts');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('valid code but account vanished (race) → generic 400 invalid_code', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'a@b.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    const res = await verifyPOST(post({ email: 'a@b.com', code: '424242' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_code');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rate-limited → 429, never consumes a code', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce(BLOCKED);
    const res = await verifyPOST(post({ email: 'a@b.com', code: '424242' }));
    expect(res.status).toBe(429);
    expect(consumeEmailLoginCode).not.toHaveBeenCalled();
  });

  it('malformed code (not 6 digits) → 400 invalid_request', async () => {
    const res = await verifyPOST(post({ email: 'a@b.com', code: '12' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });
});

// ── App Store review access gate (env-gated) ──────────────────────────────────
// Apple's reviewer cannot receive our SiwA / email codes, so a FIXED email+code
// pair (only in App Review notes) logs into the seeded review athlete. The gate
// must be INVISIBLE when the envs are unset, must NOT open any other account, and
// must keep responses indistinguishable from the normal flow.
describe('App Store review access gate', () => {
  function enableGate() {
    process.env.REVIEW_ACCESS_EMAIL = REVIEW_EMAIL;
    process.env.REVIEW_ACCESS_CODE = REVIEW_CODE;
  }

  describe('envs ABSENT → identical to current behavior', () => {
    it('request: review-looking email is just a normal (non-member) request', async () => {
      vi.mocked(findAthleteByEmail).mockResolvedValue(null);
      const res = await requestPOST(post({ email: REVIEW_EMAIL }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      // Gate inert → the normal find-only path runs.
      expect(findAthleteByEmail).toHaveBeenCalledOnce();
    });

    it('verify: review email with a 6-digit code takes the normal consume path', async () => {
      vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: false, reason: 'invalid' });
      const res = await verifyPOST(post({ email: REVIEW_EMAIL, code: '000000' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_code');
      expect(consumeEmailLoginCode).toHaveBeenCalledOnce();
      expect(issueSession).not.toHaveBeenCalled();
    });

    it('verify: the fixed code is not special when the gate is off (fails 6-digit schema)', async () => {
      const res = await verifyPOST(post({ email: REVIEW_EMAIL, code: REVIEW_CODE }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_request');
      expect(issueSession).not.toHaveBeenCalled();
    });
  });

  describe('envs PRESENT', () => {
    beforeEach(enableGate);

    it('request: review email → generic 200, NO code issued, NO email sent, account untouched', async () => {
      const res = await requestPOST(post({ email: REVIEW_EMAIL }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(findAthleteByEmail).not.toHaveBeenCalled();
      expect(createEmailLoginCode).not.toHaveBeenCalled();
      expect(sendEmailLoginCode).not.toHaveBeenCalled();
    });

    it('request: a NON-review email still runs the normal find-only path', async () => {
      vi.mocked(findAthleteByEmail).mockResolvedValue(null);
      const res = await requestPOST(post({ email: 'someone.else@example.com' }));
      expect(res.status).toBe(200);
      expect(findAthleteByEmail).toHaveBeenCalledOnce();
    });

    it('verify: review email + correct fixed code → mints the SAME athlete session', async () => {
      vi.mocked(findAthleteByEmail).mockResolvedValue(REVIEW_ACCOUNT);
      const res = await verifyPOST(post({ email: REVIEW_EMAIL, code: REVIEW_CODE }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session_token).toBe('session.jwt.token');
      expect(body.athlete_id).toBe('901');
      expect(body.user_id).toBe('900');
      expect(issueSession).toHaveBeenCalledOnce();
      expect(vi.mocked(issueSession).mock.calls[0][0].audience).toBe(audiences.athlete);
      // The fixed code bypasses the one-time-code machinery entirely.
      expect(consumeEmailLoginCode).not.toHaveBeenCalled();
    });

    it('verify: case/space-insensitive review email still matches', async () => {
      vi.mocked(findAthleteByEmail).mockResolvedValue(REVIEW_ACCOUNT);
      const res = await verifyPOST(post({ email: `  ${REVIEW_EMAIL.toUpperCase()} `, code: REVIEW_CODE }));
      expect(res.status).toBe(200);
      expect(issueSession).toHaveBeenCalledOnce();
    });

    it('verify: review email + WRONG code → generic 400, no session, code machinery untouched', async () => {
      const res = await verifyPOST(post({ email: REVIEW_EMAIL, code: 'wrong-code' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_code');
      expect(issueSession).not.toHaveBeenCalled();
      expect(consumeEmailLoginCode).not.toHaveBeenCalled();
    });

    it('verify: review email but account missing (race) → generic 400, no session', async () => {
      vi.mocked(findAthleteByEmail).mockResolvedValue(null);
      const res = await verifyPOST(post({ email: REVIEW_EMAIL, code: REVIEW_CODE }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_code');
      expect(issueSession).not.toHaveBeenCalled();
    });

    it('verify: the fixed code with ANOTHER email opens nothing → 400, no session', async () => {
      const res = await verifyPOST(post({ email: 'attacker@example.com', code: REVIEW_CODE }));
      expect(res.status).toBe(400);
      expect(issueSession).not.toHaveBeenCalled();
    });

    it('verify: a real member + real code still works with the gate on', async () => {
      vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'fabregas.scd@gmail.com' });
      vi.mocked(findAthleteByEmail).mockResolvedValue(ACCOUNT);
      const res = await verifyPOST(post({ email: 'fabregas.scd@gmail.com', code: '424242' }));
      expect(res.status).toBe(200);
      expect(consumeEmailLoginCode).toHaveBeenCalledOnce();
      expect(issueSession).toHaveBeenCalledOnce();
    });
  });
});

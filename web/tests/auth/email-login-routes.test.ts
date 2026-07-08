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
vi.mock('@/lib/athlete/invitations', () => ({ redeemAthleteInvitationByEmail: vi.fn() }));
vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, issueSession: vi.fn() };
});

const { withRateLimit } = await import('@/lib/security/rate-limit');
const { createEmailLoginCode, sendEmailLoginCode, consumeEmailLoginCode } = await import(
  '@/lib/auth/email-code'
);
const { findAthleteByEmail } = await import('@/lib/auth/users');
const { redeemAthleteInvitationByEmail } = await import('@/lib/athlete/invitations');
const { issueSession, audiences } = await import('@/lib/auth/session');
const { POST: requestPOST } = await import('@/app/api/auth/email/request/route');
const { POST: verifyPOST } = await import('@/app/api/auth/email/verify/route');

const ALLOWED = { allowed: true, remaining: 5, retryAfter: 600, windowStart: new Date() };
const BLOCKED = { allowed: false, remaining: 0, retryAfter: 600, windowStart: new Date() };

const ACCOUNT = {
  user: { id: BigInt(132), email: 'fabregas.scd@gmail.com', apple_user_id: null, role: 'athlete' as const },
  athlete: { id: BigInt(63), user_id: BigInt(132), full_name: 'Gerard', onboarded_at: null },
};

function post(body: unknown): Request {
  return new Request('http://localhost/api/auth/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe('POST /api/auth/email/verify — invite activation (invite_token present)', () => {
  const REDEEMED = {
    user_id: BigInt(132),
    athlete_id: BigInt(63),
    email: 'fabregas.scd@gmail.com',
    full_name: 'Gerard',
    onboarded_at: null,
  };

  it('valid code + matching invite → redeems, activates, mints the session', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'fabregas.scd@gmail.com' });
    vi.mocked(redeemAthleteInvitationByEmail).mockResolvedValue({ ok: true, result: REDEEMED });

    const res = await verifyPOST(post({ email: 'fabregas.scd@gmail.com', code: '424242', invite_token: 'invite-tok-123456' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_token).toBe('session.jwt.token');
    expect(body.athlete_id).toBe('63');
    // Redeemed by the PROVEN email, not the raw request field.
    expect(vi.mocked(redeemAthleteInvitationByEmail).mock.calls[0][0]).toEqual({
      token: 'invite-tok-123456',
      verified_email: 'fabregas.scd@gmail.com',
    });
    // Invite path does NOT go through the plain login resolver.
    expect(findAthleteByEmail).not.toHaveBeenCalled();
    expect(issueSession).toHaveBeenCalledOnce();
  });

  it('email does not match the invitation → 409 email_mismatch, no session', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'someone@else.com' });
    vi.mocked(redeemAthleteInvitationByEmail).mockResolvedValue({
      ok: false,
      error: { code: 'email_mismatch', message: 'x' },
    });
    const res = await verifyPOST(post({ email: 'someone@else.com', code: '424242', invite_token: 'invite-tok-123456' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('email_mismatch');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('expired invitation → 410 token_expired', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'a@b.com' });
    vi.mocked(redeemAthleteInvitationByEmail).mockResolvedValue({
      ok: false,
      error: { code: 'token_expired', message: 'x' },
    });
    const res = await verifyPOST(post({ email: 'a@b.com', code: '424242', invite_token: 'invite-tok-123456' }));
    expect(res.status).toBe(410);
    expect((await res.json()).error.code).toBe('token_expired');
  });

  it('bad code with an invite_token → 400 invalid_code, never attempts the redeem', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: false, reason: 'invalid' });
    const res = await verifyPOST(post({ email: 'a@b.com', code: '000000', invite_token: 'invite-tok-123456' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_code');
    expect(redeemAthleteInvitationByEmail).not.toHaveBeenCalled();
  });
});

// FREE SIGNUP — barrido defensivo a nivel de ROUTE (mocks en las fronteras de
// lib, como email-login-routes.test.ts). Lo que se clava aquí:
//   · flag APAGADO (FREE_SIGNUP ausente o != '1') → find-only EXACTO de hoy:
//     request no emite código para no-miembros, verify responde el 400
//     invalid_code genérico y JAMÁS llama a createFreeAthlete; Apple → 404.
//   · flag ENCENDIDO → request emite código igualmente (misma respuesta
//     genérica: enumeración imposible), verify/Apple crean vía createFreeAthlete
//     y emiten la MISMA sesión de siempre.
//   · has_coach es ADITIVO e independiente del flag: true con coach_id, false
//     sin él, presente en verify y en Apple.
// isFreeSignupEnabled se deja REAL (lee el env); solo se mockea la creación.

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
vi.mock('@/lib/auth/users', () => ({
  findAthleteByEmail: vi.fn(),
  findAthleteForApple: vi.fn(),
}));
vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, issueSession: vi.fn() };
});
vi.mock('@/lib/auth/free-signup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/free-signup')>();
  return { ...actual, createFreeAthlete: vi.fn() };
});
vi.mock('@/lib/auth/apple', () => ({ verifyAppleIdToken: vi.fn() }));

const { withRateLimit } = await import('@/lib/security/rate-limit');
const { createEmailLoginCode, sendEmailLoginCode, consumeEmailLoginCode } = await import(
  '@/lib/auth/email-code'
);
const { findAthleteByEmail, findAthleteForApple } = await import('@/lib/auth/users');
const { issueSession, audiences } = await import('@/lib/auth/session');
const { createFreeAthlete, isFreeSignupEnabled } = await import('@/lib/auth/free-signup');
const { verifyAppleIdToken } = await import('@/lib/auth/apple');
const { POST: requestPOST } = await import('@/app/api/auth/email/request/route');
const { POST: verifyPOST } = await import('@/app/api/auth/email/verify/route');
const { POST: applePOST } = await import('@/app/api/auth/apple/route');

const ALLOWED = { allowed: true, remaining: 5, retryAfter: 600, windowStart: new Date() };

/** Miembro del club (con coach) — el caso de siempre. */
const COACHED_ACCOUNT = {
  user: { id: BigInt(132), email: 'member@example.com', apple_user_id: null, role: 'athlete' as const },
  athlete: { id: BigInt(63), user_id: BigInt(132), full_name: 'Gerard', onboarded_at: null, coach_id: BigInt(60) },
};

/** Atleta free recién creado — sin coach. */
const FREE_ACCOUNT = {
  user: { id: BigInt(500), email: 'nuevo@example.com', apple_user_id: null, role: 'athlete' as const },
  athlete: { id: BigInt(501), user_id: BigInt(500), full_name: 'nuevo', onboarded_at: null, coach_id: null },
};

const APPLE_IDENTITY = {
  apple_user_id: 'apple-sub-000123',
  email: 'nuevo@example.com',
  email_verified: true,
  is_private_email: false,
};

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FREE_SIGNUP;
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
  vi.mocked(verifyAppleIdToken).mockResolvedValue(APPLE_IDENTITY);
});

describe('isFreeSignupEnabled', () => {
  it('ausente → false; "0" → false; "1" → true', () => {
    expect(isFreeSignupEnabled()).toBe(false);
    process.env.FREE_SIGNUP = '0';
    expect(isFreeSignupEnabled()).toBe(false);
    process.env.FREE_SIGNUP = '1';
    expect(isFreeSignupEnabled()).toBe(true);
  });
});

describe('flag APAGADO → find-only exacto de hoy', () => {
  it('request: no-miembro → SIN código, SIN email, mismo 200 genérico', async () => {
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    const res = await requestPOST(post('/api/auth/email/request', { email: 'nuevo@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createEmailLoginCode).not.toHaveBeenCalled();
    expect(sendEmailLoginCode).not.toHaveBeenCalled();
  });

  it('request: FREE_SIGNUP="0" tampoco abre la puerta', async () => {
    process.env.FREE_SIGNUP = '0';
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    const res = await requestPOST(post('/api/auth/email/request', { email: 'nuevo@example.com' }));
    expect(res.status).toBe(200);
    expect(createEmailLoginCode).not.toHaveBeenCalled();
  });

  it('verify: código válido pero sin cuenta → 400 invalid_code y NO se crea nada', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'nuevo@example.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    const res = await verifyPOST(post('/api/auth/email/verify', { email: 'nuevo@example.com', code: '424242' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_code');
    expect(createFreeAthlete).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('apple: identidad desconocida → 404 no_account y NO se crea nada', async () => {
    vi.mocked(findAthleteForApple).mockResolvedValue(null);
    const res = await applePOST(post('/api/auth/apple', { id_token: 'x'.repeat(32) }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('no_account');
    expect(createFreeAthlete).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });
});

describe('flag ENCENDIDO → el alta crea', () => {
  beforeEach(() => {
    process.env.FREE_SIGNUP = '1';
  });

  it('request: no-miembro → emite y envía código IGUALMENTE, mismo 200 genérico', async () => {
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    const res = await requestPOST(post('/api/auth/email/request', { email: 'nuevo@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createEmailLoginCode).toHaveBeenCalledOnce();
    expect(sendEmailLoginCode).toHaveBeenCalledOnce();
  });

  it('request: miembro → sin cambios (un solo código, como siempre)', async () => {
    vi.mocked(findAthleteByEmail).mockResolvedValue(COACHED_ACCOUNT);
    const res = await requestPOST(post('/api/auth/email/request', { email: 'member@example.com' }));
    expect(res.status).toBe(200);
    expect(createEmailLoginCode).toHaveBeenCalledOnce();
  });

  it('verify: código probado + sin cuenta → crea atleta SIN coach y emite la sesión de siempre', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'nuevo@example.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    vi.mocked(createFreeAthlete).mockResolvedValue(FREE_ACCOUNT);

    const res = await verifyPOST(post('/api/auth/email/verify', { email: 'nuevo@example.com', code: '424242' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_token).toBe('session.jwt.token');
    expect(body.user_id).toBe('500');
    expect(body.athlete_id).toBe('501');
    expect(body.has_coach).toBe(false);
    expect(createFreeAthlete).toHaveBeenCalledOnce();
    expect(createFreeAthlete).toHaveBeenCalledWith({
      email: 'nuevo@example.com',
      email_verified: true,
    });
    expect(issueSession).toHaveBeenCalledOnce();
    expect(vi.mocked(issueSession).mock.calls[0][0].audience).toBe(audiences.athlete);
  });

  it('verify: creación rechazada (email de cuenta no-atleta) → mismo 400 invalid_code', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'coach@example.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(null);
    vi.mocked(createFreeAthlete).mockResolvedValue(null);
    const res = await verifyPOST(post('/api/auth/email/verify', { email: 'coach@example.com', code: '424242' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_code');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('verify: código MALO → jamás se crea (la creación exige buzón probado)', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: false, reason: 'invalid' });
    const res = await verifyPOST(post('/api/auth/email/verify', { email: 'nuevo@example.com', code: '000000' }));
    expect(res.status).toBe(400);
    expect(createFreeAthlete).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('apple: identidad desconocida → crea con los datos del identity token', async () => {
    vi.mocked(findAthleteForApple).mockResolvedValue(null);
    vi.mocked(createFreeAthlete).mockResolvedValue(FREE_ACCOUNT);

    const res = await applePOST(
      post('/api/auth/apple', { id_token: 'x'.repeat(32), full_name: 'Nuevo Atleta' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_token).toBe('session.jwt.token');
    expect(body.has_coach).toBe(false);
    expect(createFreeAthlete).toHaveBeenCalledOnce();
    expect(createFreeAthlete).toHaveBeenCalledWith({
      email: 'nuevo@example.com',
      email_verified: true,
      apple_user_id: 'apple-sub-000123',
      full_name: 'Nuevo Atleta',
    });
    expect(vi.mocked(issueSession).mock.calls[0][0].audience).toBe(audiences.athlete);
  });

  it('apple: creación rechazada → mismo 404 no_account de hoy', async () => {
    vi.mocked(findAthleteForApple).mockResolvedValue(null);
    vi.mocked(createFreeAthlete).mockResolvedValue(null);
    const res = await applePOST(post('/api/auth/apple', { id_token: 'x'.repeat(32) }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('no_account');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('apple: cuenta existente → NO se toca la creación', async () => {
    vi.mocked(findAthleteForApple).mockResolvedValue(COACHED_ACCOUNT);
    const res = await applePOST(post('/api/auth/apple', { id_token: 'x'.repeat(32) }));
    expect(res.status).toBe(200);
    expect(createFreeAthlete).not.toHaveBeenCalled();
  });
});

describe('has_coach — aditivo e independiente del flag', () => {
  it('verify: atleta CON coach → has_coach true (flag apagado)', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'member@example.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(COACHED_ACCOUNT);
    const res = await verifyPOST(post('/api/auth/email/verify', { email: 'member@example.com', code: '424242' }));
    expect(res.status).toBe(200);
    expect((await res.json()).has_coach).toBe(true);
  });

  it('verify: atleta SIN coach → has_coach false (flag apagado)', async () => {
    vi.mocked(consumeEmailLoginCode).mockResolvedValue({ ok: true, email: 'nuevo@example.com' });
    vi.mocked(findAthleteByEmail).mockResolvedValue(FREE_ACCOUNT);
    const res = await verifyPOST(post('/api/auth/email/verify', { email: 'nuevo@example.com', code: '424242' }));
    expect(res.status).toBe(200);
    expect((await res.json()).has_coach).toBe(false);
  });

  it('apple: atleta CON coach → has_coach true (flag apagado)', async () => {
    vi.mocked(findAthleteForApple).mockResolvedValue(COACHED_ACCOUNT);
    const res = await applePOST(post('/api/auth/apple', { id_token: 'x'.repeat(32) }));
    expect(res.status).toBe(200);
    expect((await res.json()).has_coach).toBe(true);
  });
});

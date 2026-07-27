// SUSCRIPCIÓN DEL ATLETA — ROUTE layer (mocks en las fronteras, como
// history-route). Lo que se clava aquí es el campo ADITIVO `tier` (free fase 2)
// y que el shape previo queda INTACTO campo a campo:
//   · CON coach → tier 'coached', tanto con fila de subscriptions (el espejo
//     Stripe manda en `subscribed`) como sin ella (subscribed:false de siempre).
//   · SIN coach → tier 'free': la ausencia de subscriptions es estado legítimo
//     (no hay nada que pagar), nunca una suscripción caducada. El gate lo
//     decidirá iOS con tier — este route NUNCA miente subscribed:true.
// El tier deriva de athletes.coach_id, jamás de la tabla subscriptions.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ getSubscriptionByUserId: vi.fn(), isActive: vi.fn() }));
vi.mock('@/lib/partner/invitations', () => ({ loadPartner: vi.fn() }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { sql } = await import('@/lib/db');
const { getSubscriptionByUserId, isActive } = await import('@/lib/stripe');
const { loadPartner } = await import('@/lib/partner/invitations');
const { GET } = await import('@/app/api/athlete/subscription/route');

const SESSION = { user_id: BigInt(132), athlete_id: BigInt(63) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

const ACTIVE_SUB = {
  id: BigInt(9),
  user_id: BigInt(132),
  partner_user_id: null,
  plan_type: 'individual',
  status: 'active',
  current_period_end: new Date('2026-08-15T10:00:00Z'),
  cancel_at_period_end: false,
} as unknown as NonNullable<Awaited<ReturnType<typeof getSubscriptionByUserId>>>;

const PARTNER = {
  user_id: BigInt(200),
  athlete_id: BigInt(201),
  full_name: 'Marta',
  email: 'marta@example.com',
  onboarded_at: null,
  modality: 'dobles',
} as unknown as NonNullable<Awaited<ReturnType<typeof loadPartner>>>;

function req(withAuth = true): Request {
  return new Request('http://localhost/api/athlete/subscription', {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

/** El único query directo del route: el select de athletes.coach_id (tier). */
function stubCoachRow(coach_id: string | null) {
  vi.mocked(sql).mockResolvedValue([{ coach_id }] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
  vi.mocked(getSubscriptionByUserId).mockResolvedValue(null);
  vi.mocked(loadPartner).mockResolvedValue(null);
  vi.mocked(isActive).mockReturnValue(true);
});

describe('GET /api/athlete/subscription', () => {
  it('401 sin bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(getSubscriptionByUserId).not.toHaveBeenCalled();
  });

  it('CON coach + suscripción activa → tier coached y el shape previo intacto campo a campo', async () => {
    stubCoachRow('60');
    vi.mocked(getSubscriptionByUserId).mockResolvedValue(ACTIVE_SUB);
    vi.mocked(loadPartner).mockResolvedValue(PARTNER);

    const res = await GET(req());
    expect(res.status).toBe(200);
    // toEqual sobre el objeto ENTERO: cualquier campo que cambie o desaparezca
    // del shape previo rompe aquí, no en el Codable del iOS instalado.
    expect(await res.json()).toEqual({
      subscribed: true,
      status: 'active',
      plan_type: 'individual',
      current_period_end: '2026-08-15T10:00:00.000Z',
      cancel_at_period_end: false,
      partner: {
        user_id: '200',
        athlete_id: '201',
        full_name: 'Marta',
        email: 'marta@example.com',
      },
      tier: 'coached',
    });
  });

  it('CON coach sin fila de subscriptions → subscribed:false de siempre + tier coached', async () => {
    stubCoachRow('60');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      subscribed: false,
      status: null,
      plan_type: null,
      current_period_end: null,
      cancel_at_period_end: false,
      partner: null,
      tier: 'coached',
    });
  });

  it('SIN coach → tier free, y jamás se inventa subscribed:true', async () => {
    stubCoachRow(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      subscribed: false,
      status: null,
      plan_type: null,
      current_period_end: null,
      cancel_at_period_end: false,
      partner: null,
      tier: 'free',
    });
  });
});

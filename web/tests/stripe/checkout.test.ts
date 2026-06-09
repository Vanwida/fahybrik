import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the args the fake Stripe SDK was called with.
let createdSession: { url: string | null; id: string } = {
  url: 'https://checkout.stripe.com/c/pay/cs_test_123',
  id: 'cs_test_123',
};
const sessionsCreate = vi.fn(async (params: unknown) => {
  capturedParams = params;
  return createdSession;
});
let capturedParams: unknown = null;

vi.mock('@/lib/stripe/client', () => ({
  getStripeOrThrow: () => ({
    stripe: { checkout: { sessions: { create: sessionsCreate } } },
    config: {
      secret_key: 'sk_test_x',
      webhook_secret: 'whsec_x',
      portal_return_url: 'https://app.fahybrik.com/perfil',
      checkout_success_url: 'https://app.fahybrik.com/ok',
      checkout_cancel_url: 'https://app.fahybrik.com/cancel',
    },
  }),
}));

import { createCheckoutSession } from '@/lib/stripe/checkout';

const ENV_KEYS = [
  'STRIPE_PRICE_ID_INDIVIDUAL',
  'STRIPE_PRICE_ID_DOBLES',
  'STRIPE_PRICE_ID_PRO',
] as const;

describe('createCheckoutSession', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    sessionsCreate.mockClear();
    capturedParams = null;
    createdSession = { url: 'https://checkout.stripe.com/c/pay/cs_test_123', id: 'cs_test_123' };
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('creates a subscription session with the tier price + metadata', async () => {
    process.env.STRIPE_PRICE_ID_INDIVIDUAL = 'price_indiv';
    const result = await createCheckoutSession({
      stripe_customer_id: 'cus_123',
      user_id: BigInt(7),
      plan_type: 'individual',
    });
    expect(result).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      session_id: 'cs_test_123',
    });
    const p = capturedParams as Record<string, unknown>;
    expect(p.mode).toBe('subscription');
    expect(p.customer).toBe('cus_123');
    expect(p.line_items).toEqual([{ price: 'price_indiv', quantity: 1 }]);
    expect(p.metadata).toEqual({ fahybrik_user_id: '7', plan_type: 'individual' });
  });

  it('stamps dobles metadata (payer only; partner linked later)', async () => {
    process.env.STRIPE_PRICE_ID_DOBLES = 'price_dobles';
    const result = await createCheckoutSession({
      stripe_customer_id: 'cus_d',
      user_id: BigInt(99),
      plan_type: 'dobles',
    });
    expect(result.ok).toBe(true);
    const p = capturedParams as Record<string, unknown>;
    expect(p.line_items).toEqual([{ price: 'price_dobles', quantity: 1 }]);
    expect(p.metadata).toEqual({ fahybrik_user_id: '99', plan_type: 'dobles' });
    // Only one line item / quantity 1 → a single charge for the payer.
    expect((p.line_items as Array<{ quantity: number }>)[0].quantity).toBe(1);
  });

  it('returns price_not_configured when the tier price is unset', async () => {
    const result = await createCheckoutSession({
      stripe_customer_id: 'cus_x',
      user_id: BigInt(1),
      plan_type: 'pro_elite',
    });
    expect(result).toEqual({ ok: false, reason: 'price_not_configured' });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('throws when Stripe returns no url', async () => {
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
    createdSession = { url: null, id: 'cs_no_url' };
    await expect(
      createCheckoutSession({
        stripe_customer_id: 'cus_x',
        user_id: BigInt(1),
        plan_type: 'pro_elite',
      }),
    ).rejects.toThrow('stripe_checkout_no_url');
  });
});

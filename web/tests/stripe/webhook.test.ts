import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { verifyWebhook } from '@/lib/stripe/webhook';
import { claimAccessEmailStamp, mapStripeStatus } from '@/lib/stripe/subscriptions';
import { buildAdHocSubscriptionLineItems, ALTA_PRODUCT_NAME } from '@/lib/stripe/checkout';
import { createFakeSql } from '../utils/fake-sql';

// Pure/node tests for the Stripe payment core (#15). No DB, no network — the
// money-critical invariants (signature verification, exactly-once access email,
// past_due mapping, ad-hoc price_data) are each testable in isolation.

const SECRET_KEY = 'sk_test_fahybrik';
const WEBHOOK_SECRET = 'whsec_test_fahybrik_secret';

const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  saved.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  saved.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterAll(() => {
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Build a signed webhook delivery for a checkout.session.completed event. */
function signedCheckoutCompleted(): { payload: string; header: string } {
  const stripe = new Stripe(SECRET_KEY);
  const event = {
    id: 'evt_test_1',
    object: 'event',
    api_version: '2024-01-01',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_alta_1',
        object: 'checkout.session',
        mode: 'subscription',
        subscription: 'sub_test_1',
        customer: 'cus_test_1',
      },
    },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, header };
}

describe('webhook signature verification', () => {
  it('accepts a correctly-signed checkout.session.completed', () => {
    const { payload, header } = signedCheckoutCompleted();
    const res = verifyWebhook({ raw_body: payload, signature_header: header });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.event.type).toBe('checkout.session.completed');
      expect(res.event.id).toBe('evt_test_1');
    }
  });

  it('rejects a tampered signature', () => {
    const { payload, header } = signedCheckoutCompleted();
    // Corrupt the v1 signature so the HMAC no longer matches.
    const tampered = header.replace(/v1=[0-9a-f]{6}/, 'v1=000000');
    const res = verifyWebhook({ raw_body: payload, signature_header: tampered });
    expect(res.ok).toBe(false);
  });

  it('rejects a body that does not match the signature (replayed payload swap)', () => {
    const { header } = signedCheckoutCompleted();
    const res = verifyWebhook({ raw_body: '{"id":"evt_forged"}', signature_header: header });
    expect(res.ok).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const { payload } = signedCheckoutCompleted();
    const res = verifyWebhook({ raw_body: payload, signature_header: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('missing_signature_header');
  });
});

describe('access-email exactly-once stamp (idempotency)', () => {
  it('claims once and refuses a duplicate delivery', async () => {
    // Simulate the DB row: access_email_sent_at is null the first time (claim
    // wins → 1 row) and non-null thereafter (duplicate webhook → 0 rows).
    let stamped = false;
    const fake = createFakeSql((text) => {
      if (
        text.includes('update subscriptions set access_email_sent_at') &&
        text.includes('access_email_sent_at is null')
      ) {
        if (stamped) return [];
        stamped = true;
        return [{ id: '1' }];
      }
      return [];
    });

    const first = await claimAccessEmailStamp(fake, BigInt(1));
    const second = await claimAccessEmailStamp(fake, BigInt(1));
    const third = await claimAccessEmailStamp(fake, BigInt(1));

    expect(first).toBe(true); // this delivery sends the access email
    expect(second).toBe(false); // duplicate → no second send
    expect(third).toBe(false);
  });
});

describe('invoice.payment_failed → past_due mapping', () => {
  it('maps Stripe past-payment statuses to the local past_due state', () => {
    // A failed invoice pushes the Stripe subscription to past_due / unpaid; both
    // collapse to our past_due state that drives "Cobro en riesgo".
    expect(mapStripeStatus('past_due')).toBe('past_due');
    expect(mapStripeStatus('unpaid')).toBe('past_due');
  });
});

describe('ad-hoc subscription price_data builder', () => {
  it('builds a recurring monthly line item from the agreed price', () => {
    const items = buildAdHocSubscriptionLineItems({ amount_cents: 7000, currency: 'eur' });
    expect(items).toHaveLength(1);
    const li = items[0]!;
    expect(li.quantity).toBe(1);
    expect(li.price_data?.currency).toBe('eur');
    expect(li.price_data?.unit_amount).toBe(7000);
    expect(li.price_data?.recurring?.interval).toBe('month');
    expect(li.price_data?.product_data?.name).toBe(ALTA_PRODUCT_NAME);
  });

  it('honours a custom product name and keeps money as integer cents', () => {
    const items = buildAdHocSubscriptionLineItems({
      amount_cents: 11550,
      currency: 'eur',
      product_name: 'Plan Dobles',
    });
    expect(items[0]!.price_data?.unit_amount).toBe(11550);
    expect(items[0]!.price_data?.product_data?.name).toBe('Plan Dobles');
  });
});

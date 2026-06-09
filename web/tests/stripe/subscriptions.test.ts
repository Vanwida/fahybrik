import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import {
  mapStripeStatus,
  upsertSubscription,
  markCanceled,
  findUserIdByCustomerId,
} from '@/lib/stripe/subscriptions';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

const ENV_KEYS = [
  'STRIPE_PRICE_ID_INDIVIDUAL',
  'STRIPE_PRICE_ID_DOBLES',
  'STRIPE_PRICE_ID_PRO',
] as const;

// Minimal Stripe.Subscription shape for the fields our code reads.
function fakeSub(opts: {
  id: string;
  status: string;
  customer: string;
  price_id?: string;
  period_end?: number;
  cancel_at_period_end?: boolean;
}): Stripe.Subscription {
  return {
    id: opts.id,
    status: opts.status,
    customer: opts.customer,
    cancel_at_period_end: opts.cancel_at_period_end ?? false,
    items: {
      data: [
        {
          price: { id: opts.price_id ?? 'price_indiv' },
          current_period_end: opts.period_end ?? 1_900_000_000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe('mapStripeStatus', () => {
  it('maps Stripe statuses into the narrow local enum', () => {
    expect(mapStripeStatus('active')).toBe('active');
    expect(mapStripeStatus('trialing')).toBe('trialing');
    expect(mapStripeStatus('past_due')).toBe('past_due');
    expect(mapStripeStatus('unpaid')).toBe('past_due');
    expect(mapStripeStatus('canceled')).toBe('canceled');
    expect(mapStripeStatus('incomplete')).toBe('incomplete');
    expect(mapStripeStatus('incomplete_expired')).toBe('canceled');
    expect(mapStripeStatus('paused')).toBe('incomplete');
    expect(mapStripeStatus('something_new')).toBe('incomplete'); // future-proof
  });
});

describe('findUserIdByCustomerId', () => {
  it('resolves user_id from a subscriptions row', async () => {
    const fake = createFakeSql((sqlText) => {
      if (sqlText.includes('from subscriptions')) return [{ user_id: '42' }];
      return [];
    });
    const uid = await findUserIdByCustomerId(fake, 'cus_1');
    expect(uid).toBe(BigInt(42));
  });

  it('returns null when no row matches', async () => {
    const fake = createFakeSql(() => []);
    expect(await findUserIdByCustomerId(fake, 'cus_x')).toBeNull();
  });
});

describe('upsertSubscription', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.STRIPE_PRICE_ID_INDIVIDUAL = 'price_indiv';
    process.env.STRIPE_PRICE_ID_DOBLES = 'price_dobles';
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('attaches to a pending checkout row (no stripe_subscription_id yet)', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const handler: SqlHandler = (sqlText, values) => {
      calls.push({ text: sqlText, values });
      if (sqlText.includes('select id') && sqlText.includes('stripe_subscription_id is null')) {
        return [{ id: '5' }];
      }
      return [];
    };
    await upsertSubscription({
      client: createFakeSql(handler),
      user_id: BigInt(10),
      subscription: fakeSub({
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
        price_id: 'price_indiv',
      }),
    });
    // It should UPDATE the pending row by id, not INSERT a new one.
    const updated = calls.find((c) => c.text.startsWith('update subscriptions'));
    expect(updated).toBeTruthy();
    expect(updated!.values).toContain('sub_1');
    expect(calls.some((c) => c.text.startsWith('insert into subscriptions'))).toBe(false);
  });

  it('inserts (upsert by stripe_subscription_id) when no pending row', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const handler: SqlHandler = (sqlText, values) => {
      calls.push({ text: sqlText, values });
      return []; // no pending row
    };
    await upsertSubscription({
      client: createFakeSql(handler),
      user_id: BigInt(10),
      subscription: fakeSub({
        id: 'sub_2',
        status: 'active',
        customer: 'cus_2',
        price_id: 'price_dobles',
      }),
    });
    const inserted = calls.find((c) => c.text.startsWith('insert into subscriptions'));
    expect(inserted).toBeTruthy();
    expect(inserted!.text).toContain('on conflict (stripe_subscription_id)');
    // plan_type resolved from price → 'dobles'
    expect(inserted!.values).toContain('dobles');
    expect(inserted!.values).toContain('sub_2');
  });

  it('backfills partner_user_id (both directions) when user has a linked partner', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const handler: SqlHandler = (sqlText, values) => {
      calls.push({ text: sqlText, values });
      // The Dobles backfill reads users.partner_id for the synced user.
      if (sqlText.includes('select partner_id') && sqlText.includes('from users')) {
        return [{ partner_id: '11' }];
      }
      return []; // no pending row
    };
    await upsertSubscription({
      client: createFakeSql(handler),
      user_id: BigInt(10),
      subscription: fakeSub({
        id: 'sub_dob',
        status: 'active',
        customer: 'cus_dob',
        price_id: 'price_dobles',
      }),
    });
    // Two partner_user_id updates, one per direction (10→11 and 11→10).
    const partnerUpdates = calls.filter(
      (c) => c.text.startsWith('update subscriptions') && c.text.includes('partner_user_id'),
    );
    expect(partnerUpdates.length).toBe(2);
    // 10's sub points at 11; 11's sub points at 10.
    expect(partnerUpdates[0]!.values).toContain(BigInt(11));
    expect(partnerUpdates[0]!.values).toContain(BigInt(10));
    expect(partnerUpdates[1]!.values).toContain(BigInt(10));
    expect(partnerUpdates[1]!.values).toContain(BigInt(11));
    // Both target a Dobles sub only.
    for (const u of partnerUpdates) {
      expect(u.text).toContain("plan_type = 'dobles'");
    }
  });

  it('does not touch partner_user_id when the user has no partner', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const handler: SqlHandler = (sqlText, values) => {
      calls.push({ text: sqlText, values });
      return []; // no pending row, no partner_id
    };
    await upsertSubscription({
      client: createFakeSql(handler),
      user_id: BigInt(10),
      subscription: fakeSub({
        id: 'sub_solo',
        status: 'active',
        customer: 'cus_solo',
        price_id: 'price_indiv',
      }),
    });
    const partnerUpdates = calls.filter(
      (c) => c.text.startsWith('update subscriptions') && c.text.includes('partner_user_id'),
    );
    expect(partnerUpdates.length).toBe(0);
  });
});

describe('markCanceled', () => {
  it('returns the row id + partner_user_id for cascade', async () => {
    const fake = createFakeSql((sqlText) => {
      if (sqlText.startsWith('update subscriptions')) {
        return [{ id: '200', partner_user_id: '11' }];
      }
      return [];
    });
    const result = await markCanceled({ client: fake, stripe_subscription_id: 'sub_x' });
    expect(result).toEqual({ id: BigInt(200), partner_user_id: BigInt(11) });
  });

  it('returns null partner when single-user subscription', async () => {
    const fake = createFakeSql(() => [{ id: '5', partner_user_id: null }]);
    const result = await markCanceled({ client: fake, stripe_subscription_id: 'sub_y' });
    expect(result).toEqual({ id: BigInt(5), partner_user_id: null });
  });

  it('returns null when no row matched', async () => {
    const fake = createFakeSql(() => []);
    expect(await markCanceled({ client: fake, stripe_subscription_id: 'sub_z' })).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isPlanType,
  planForPriceId,
  priceIdForPlan,
  PLAN_TYPES,
} from '@/lib/stripe/prices';

const ENV_KEYS = [
  'STRIPE_PRICE_ID_INDIVIDUAL',
  'STRIPE_PRICE_ID_DOBLES',
  'STRIPE_PRICE_ID_PRO',
] as const;

describe('stripe/prices', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('exposes the three tiers', () => {
    expect(PLAN_TYPES).toEqual(['individual', 'dobles', 'pro_elite']);
  });

  it('validates plan types', () => {
    expect(isPlanType('individual')).toBe(true);
    expect(isPlanType('dobles')).toBe(true);
    expect(isPlanType('pro_elite')).toBe(true);
    expect(isPlanType('pro')).toBe(false);
    expect(isPlanType('')).toBe(false);
    expect(isPlanType(undefined)).toBe(false);
    expect(isPlanType(42)).toBe(false);
  });

  it('resolves the configured price id per tier', () => {
    process.env.STRIPE_PRICE_ID_INDIVIDUAL = 'price_indiv';
    process.env.STRIPE_PRICE_ID_DOBLES = 'price_dobles';
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
    expect(priceIdForPlan('individual')).toBe('price_indiv');
    expect(priceIdForPlan('dobles')).toBe('price_dobles');
    expect(priceIdForPlan('pro_elite')).toBe('price_pro');
  });

  it('returns null when a tier price is not configured (test mode partial)', () => {
    process.env.STRIPE_PRICE_ID_INDIVIDUAL = 'price_indiv';
    expect(priceIdForPlan('individual')).toBe('price_indiv');
    expect(priceIdForPlan('dobles')).toBeNull();
    expect(priceIdForPlan('pro_elite')).toBeNull();
  });

  it('reverse-maps a price id to its tier', () => {
    process.env.STRIPE_PRICE_ID_INDIVIDUAL = 'price_indiv';
    process.env.STRIPE_PRICE_ID_DOBLES = 'price_dobles';
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
    expect(planForPriceId('price_dobles')).toBe('dobles');
    expect(planForPriceId('price_pro')).toBe('pro_elite');
    expect(planForPriceId('price_indiv')).toBe('individual');
    expect(planForPriceId('price_unknown')).toBeNull();
  });
});

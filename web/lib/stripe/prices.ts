// Plan tier → Stripe Price ID resolution.
//
// FAHYBRID has three subscription tiers (matching subscriptions.plan_type and
// the DB check constraint in migration 0021):
//
//   * individual — ~70€/mes,  one account.
//   * dobles     — ~115€/mes, ONE payment that covers two accounts. The payer
//                  (user_a) is charged at checkout; the partner is linked
//                  afterwards via the W4 invitation flow. Stripe only ever sees
//                  one subscription / one charge.
//   * pro_elite  — ~95€/mes,  one account, premium tier.
//
// The Product + Price objects are created in the Stripe dashboard (NOT via the
// API) and exposed to the app via env. We resolve per checkout so a partially
// configured test environment (only some tiers set) still works for the tiers
// that ARE configured — an unset tier returns null + logs, and the caller
// surfaces a 503 rather than crashing.

export type PlanType = 'individual' | 'dobles' | 'pro_elite';

export const PLAN_TYPES: readonly PlanType[] = ['individual', 'dobles', 'pro_elite'];

// plan_type → env var holding its Stripe Price ID. Centralised so the env
// contract has exactly one source of truth (mirrored in .env.example).
const PLAN_PRICE_ENV: Record<PlanType, string> = {
  individual: 'STRIPE_PRICE_ID_INDIVIDUAL',
  dobles: 'STRIPE_PRICE_ID_DOBLES',
  pro_elite: 'STRIPE_PRICE_ID_PRO',
};

export function isPlanType(value: unknown): value is PlanType {
  return typeof value === 'string' && (PLAN_TYPES as readonly string[]).includes(value);
}

/**
 * Resolve the Stripe Price ID for a tier.
 *
 * @returns the price_… string, or null when the tier's env var is unset (test
 *          mode without that tier configured). On null, logs a warning so the
 *          gap is visible in server logs; the caller maps null → 503.
 */
export function priceIdForPlan(plan: PlanType): string | null {
  const envKey = PLAN_PRICE_ENV[plan];
  const value = process.env[envKey];
  if (!value || value.length === 0) {
    console.warn('[stripe/prices] no price id configured for plan', {
      plan,
      env_key: envKey,
    });
    return null;
  }
  return value;
}

/**
 * Reverse lookup: given a Stripe Price ID (e.g. from a webhook subscription
 * item), determine which tier it corresponds to. Returns null when no tier
 * env matches — used by the webhook to record plan_type on the subscription
 * row without trusting client input.
 */
export function planForPriceId(priceId: string): PlanType | null {
  for (const plan of PLAN_TYPES) {
    if (process.env[PLAN_PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}

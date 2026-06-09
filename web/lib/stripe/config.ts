// Stripe env config. Mirrors the loader pattern used by Garmin / APNS so
// that missing creds → 503 with a clear message rather than 500.
//
// Required env (loaded lazily — dev / preview without billing creds is
// expected during early development):
//
//   * STRIPE_SECRET_KEY      — sk_live_… or sk_test_…
//   * STRIPE_WEBHOOK_SECRET  — whsec_… from the Stripe dashboard webhook
//   * STRIPE_PORTAL_RETURN_URL — public URL athletes return to from the
//                                Customer Portal (e.g.
//                                https://app.fahybrik.com/perfil)
//   * STRIPE_CHECKOUT_SUCCESS_URL — post-checkout redirect.
//   * STRIPE_CHECKOUT_CANCEL_URL  — checkout-abandoned redirect.
//
// Per-tier price IDs are NOT part of the required set — they're resolved
// per checkout via lib/stripe/prices.ts (a missing tier price → null + log,
// so test mode can be partially configured). See that file for the mapping:
//   * STRIPE_PRICE_ID_INDIVIDUAL — price_… individual tier (~70€/mes)
//   * STRIPE_PRICE_ID_DOBLES     — price_… dobles tier (~115€/mes, 1 pago)
//   * STRIPE_PRICE_ID_PRO        — price_… pro/elite tier (~95€/mes)
//
// All keys live in ~/.openclaw/credentials/vanwida-tokens.env locally and
// in Vercel project env in production. Never expose STRIPE_SECRET_KEY to
// the client.

export type StripeConfig = {
  secret_key: string;
  webhook_secret: string;
  portal_return_url: string;
  checkout_success_url: string;
  checkout_cancel_url: string;
};

export type StripeConfigResult =
  | { ok: true; config: StripeConfig }
  | { ok: false; missing: string[] };

const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PORTAL_RETURN_URL',
  'STRIPE_CHECKOUT_SUCCESS_URL',
  'STRIPE_CHECKOUT_CANCEL_URL',
] as const;

export function loadStripeConfig(): StripeConfigResult {
  const missing: string[] = [];
  const values: Record<string, string> = {};
  for (const key of REQUIRED_ENV) {
    const raw = process.env[key];
    if (!raw || raw.length === 0) {
      missing.push(key);
      continue;
    }
    values[key] = raw;
  }
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    config: {
      secret_key: values.STRIPE_SECRET_KEY!,
      webhook_secret: values.STRIPE_WEBHOOK_SECRET!,
      portal_return_url: values.STRIPE_PORTAL_RETURN_URL!,
      checkout_success_url: values.STRIPE_CHECKOUT_SUCCESS_URL!,
      checkout_cancel_url: values.STRIPE_CHECKOUT_CANCEL_URL!,
    },
  };
}

export function gatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'stripe_not_configured',
      message:
        'Stripe billing is not configured for this environment. Set the missing env vars and create the Product/Price in the Stripe dashboard.',
      missing_env: missing,
      docs: '/docs/billing/stripe-setup.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}

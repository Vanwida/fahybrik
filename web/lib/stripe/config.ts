// Stripe env config. Mirrors the loader pattern used by Garmin / APNS so
// that missing creds → 503 with a clear message rather than 500.
//
// REQUIRED env (loaded lazily — dev / preview without billing creds is
// expected during early development):
//
//   * STRIPE_SECRET_KEY      — sk_live_… or sk_test_…
//   * STRIPE_WEBHOOK_SECRET  — whsec_… from the Stripe dashboard webhook
//
// OPTIONAL env — the redirect / portal URLs. When unset they DEFAULT from
// APP_URL so a working billing environment only needs the two secrets above:
//
//   * STRIPE_CHECKOUT_SUCCESS_URL — default `${APP_URL}/es/pago/exito?session={CHECKOUT_SESSION_ID}`
//   * STRIPE_CHECKOUT_CANCEL_URL  — default `${APP_URL}/es/pago/cancelado`
//   * STRIPE_PORTAL_RETURN_URL    — default `${APP_URL}/es/perfil`
//
// `{CHECKOUT_SESSION_ID}` is a Stripe template token — Stripe substitutes the
// real session id into the success redirect, so the success page can read it.
//
// Per-tier price IDs are NOT part of the config — legacy tiered checkout resolves
// them per checkout via lib/stripe/prices.ts. The #15 athlete alta flow uses an
// ad-hoc price (price_data) built from the coach-agreed euros/mes, so it needs no
// price id at all.
//
// All keys live in ~/.openclaw/credentials/vanwida-tokens.env locally and in
// Vercel project env in production. Never expose STRIPE_SECRET_KEY to the client.

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

// Only the two secrets are hard requirements — everything else defaults.
const REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;

/** Base app URL for defaulting the redirect URLs. Mirrors AUTH_CONFIG.appUrl(). */
function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

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

  const base = appUrl();
  return {
    ok: true,
    config: {
      secret_key: values.STRIPE_SECRET_KEY!,
      webhook_secret: values.STRIPE_WEBHOOK_SECRET!,
      // Optional URLs default from APP_URL so only the two secrets are needed.
      portal_return_url: envOr('STRIPE_PORTAL_RETURN_URL', `${base}/es/perfil`),
      checkout_success_url: envOr(
        'STRIPE_CHECKOUT_SUCCESS_URL',
        `${base}/es/pago/exito?session={CHECKOUT_SESSION_ID}`,
      ),
      checkout_cancel_url: envOr('STRIPE_CHECKOUT_CANCEL_URL', `${base}/es/pago/cancelado`),
    },
  };
}

function envOr(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw && raw.length > 0 ? raw : fallback;
}

export function gatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'stripe_not_configured',
      message:
        'Stripe billing is not configured for this environment. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      missing_env: missing,
      docs: '/docs/billing/stripe-setup.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}

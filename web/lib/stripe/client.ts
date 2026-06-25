// Stripe SDK client factory.
//
// We do NOT pin apiVersion — letting Stripe default to the account's
// pinned version means upgrading the dashboard pin is the single switch
// (no need to bump code). Stripe's Node SDK is forward-compatible.
//
// One client per process. Stripe's SDK is stateless, but constructing the
// client allocates an http agent so cache it.

import Stripe from 'stripe';
import { loadStripeConfig, type StripeConfig } from './config';

declare global {
  // Reuse across hot reloads in dev — same trick as the postgres client.
  // eslint-disable-next-line no-var
  var __fahybrik_stripe: Stripe | undefined;
}

export class StripeNotConfiguredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Stripe not configured (missing: ${missing.join(', ')})`);
    this.missing = missing;
  }
}

export type StripeWithConfig = { stripe: Stripe; config: StripeConfig };

export function getStripeOrThrow(): StripeWithConfig {
  const cfg = loadStripeConfig();
  if (!cfg.ok) throw new StripeNotConfiguredError(cfg.missing);
  if (!globalThis.__fahybrik_stripe) {
    globalThis.__fahybrik_stripe = new Stripe(cfg.config.secret_key, {
      typescript: true,
      // Identify our integration in Stripe logs/dashboards.
      appInfo: {
        name: 'FAHYBRID',
        version: '0.1.0',
      },
    });
  }
  return { stripe: globalThis.__fahybrik_stripe, config: cfg.config };
}

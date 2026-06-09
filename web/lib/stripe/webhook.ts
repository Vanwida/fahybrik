// Stripe webhook signature verification + event dispatch.
//
// Signature: Stripe signs every webhook delivery with HMAC-SHA256 over
// `${timestamp}.${rawBody}`, keyed by the webhook secret. We MUST verify
// before trusting any event — otherwise an attacker could POST a
// `customer.subscription.updated` with `status: 'active'` and grant
// themselves a free subscription.
//
// We use Stripe's `webhooks.constructEvent` which:
//   * parses the `Stripe-Signature` header (`t=…,v1=…`)
//   * checks the timestamp against a tolerance (default 5min) to prevent
//     replay
//   * timing-safe compares the v1 signature against HMAC of
//     `${t}.${rawBody}`
//
// IMPORTANT: rawBody MUST be the byte-identical request body Stripe sent.
// Next.js gives us this via `await req.text()` BEFORE any JSON parse.

import type Stripe from 'stripe';
import { getStripeOrThrow } from './client';

export type VerifyWebhookResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; reason: string };

export function verifyWebhook(args: {
  raw_body: string;
  signature_header: string | null;
}): VerifyWebhookResult {
  if (!args.signature_header) {
    return { ok: false, reason: 'missing_signature_header' };
  }
  const { stripe, config } = getStripeOrThrow();
  try {
    const event = stripe.webhooks.constructEvent(
      args.raw_body,
      args.signature_header,
      config.webhook_secret,
    );
    return { ok: true, event };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_signature';
    return { ok: false, reason: message };
  }
}

// Promise version used in tests where we want to call the SDK's
// async-capable verifier (Edge runtime needs it). Currently aliases the
// sync version — kept as a separate symbol so we can swap impl later.
export const verifyWebhookAsync = verifyWebhook;

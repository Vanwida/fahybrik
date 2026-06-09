// Stripe customer get-or-create (user-scoped).
//
// Source of truth: the `subscriptions` table (Finding M9). The Stripe customer
// id lives in subscriptions.stripe_customer_id. We create the customer lazily,
// the first time the user opens checkout — NOT on signup:
//   1. Creating a customer for every signup pollutes Stripe with rows for
//      users who never reach billing.
//   2. Apple Sign In emails are sometimes private relays; we fall back to
//      whatever `users.email` is.
//
// A user can have multiple historical `subscriptions` rows (cancel +
// resubscribe). We reuse the first stripe_customer_id we find so invoice
// history stays on one Stripe customer record.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getStripeOrThrow } from './client';

export type StripeCustomerRecord = {
  user_id: bigint;
  stripe_customer_id: string;
  email: string;
};

export async function getOrCreateStripeCustomer(args: {
  user_id: bigint;
  email: string;
  full_name: string;
  client?: Sql;
}): Promise<StripeCustomerRecord> {
  const client = args.client ?? defaultSql;

  const existing = await client<{ stripe_customer_id: string }[]>`
    select stripe_customer_id
    from subscriptions
    where user_id = ${args.user_id}
      and stripe_customer_id is not null
    order by created_at asc
    limit 1
  `;
  if (existing[0]?.stripe_customer_id) {
    return {
      user_id: args.user_id,
      stripe_customer_id: existing[0].stripe_customer_id,
      email: args.email,
    };
  }

  const { stripe } = getStripeOrThrow();
  const customer = await stripe.customers.create({
    email: args.email,
    name: args.full_name,
    metadata: {
      fahybrik_user_id: args.user_id.toString(),
    },
  });

  return {
    user_id: args.user_id,
    stripe_customer_id: customer.id,
    email: args.email,
  };
}

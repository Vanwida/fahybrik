import { z } from 'zod';
import {
  idSchema,
  isoDateTime,
  subscriptionPlanType,
  subscriptionStatus,
} from './_primitives';

// User-scoped billing record (migration 0021).
//
// Covers Individual, Dobles, and Pro Elite tiers in a single table. For
// Dobles, the same subscription is linked to both partners via
// `partner_user_id`. Coexists with the legacy `stripe_subscriptions` table
// (athlete-scoped, single-tier); future migrations may consolidate.

export const subscriptionSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  // Set when plan_type = 'dobles'. NULL otherwise.
  partner_user_id: idSchema.nullable(),
  plan_type: subscriptionPlanType,
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  status: subscriptionStatus,
  current_period_end: isoDateTime.nullable(),
  cancel_at_period_end: z.boolean(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const subscriptionInsertSchema = subscriptionSchema
  .omit({ id: true, created_at: true, updated_at: true })
  .partial({
    partner_user_id: true,
    stripe_customer_id: true,
    stripe_subscription_id: true,
    status: true,
    current_period_end: true,
    cancel_at_period_end: true,
  });
export type SubscriptionInsert = z.infer<typeof subscriptionInsertSchema>;

export const subscriptionUpdateSchema = subscriptionSchema
  .pick({
    partner_user_id: true,
    plan_type: true,
    stripe_customer_id: true,
    stripe_subscription_id: true,
    status: true,
    current_period_end: true,
    cancel_at_period_end: true,
  })
  .partial();
export type SubscriptionUpdate = z.infer<typeof subscriptionUpdateSchema>;

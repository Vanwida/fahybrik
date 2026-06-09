-- FAHYBRIK migration 0012: Stripe billing scaffold (#40).
--
-- Two tables, one per concept:
--
--   * stripe_customers — 1:1 with athletes. PK is athlete_id so we can't
--     accidentally create multiple Stripe customers for the same athlete.
--     We don't store coach billing because Pablo doesn't pay; he charges
--     athletes (per-athlete subscription, his MRR is sum of theirs).
--
--   * stripe_subscriptions — 1:1 with athletes (only one active sub per
--     athlete by design). We mirror Stripe's lifecycle in the `status`
--     column ('active', 'trialing', 'past_due', 'canceled', 'incomplete',
--     'incomplete_expired', 'unpaid', 'paused') so the dashboard can answer
--     "is this athlete current?" without round-tripping to Stripe. Webhook
--     keeps it in sync; we never trust client-side state for billing.
--
-- Why no enum: Stripe occasionally adds statuses (they introduced 'paused'
-- mid-2023). Text + check constraint is friendlier to future changes.
--
-- Why no `stripe_invoices` table: invoices are append-only and we don't
-- need queryable history yet — Pablo can see them in Stripe Dashboard.
-- Add later if we surface them in-app.

begin;

-- =============================================================================
-- Stripe customers
-- =============================================================================

create table stripe_customers (
  athlete_id          bigint primary key references athletes(id) on delete cascade,
  stripe_customer_id  text   not null unique,
  -- Email at the time of customer creation. Stripe stores this too but
  -- duplicating here saves a round-trip when we render the billing
  -- dashboard.
  email               text   not null,
  created_at          timestamptz not null default now()
);

create index stripe_customers_customer_id_idx on stripe_customers (stripe_customer_id);

-- =============================================================================
-- Stripe subscriptions
-- =============================================================================
--
-- One row per athlete. If an athlete cancels and resubscribes, we update
-- this row with the new subscription_id rather than insert a second one.

create table stripe_subscriptions (
  athlete_id              bigint primary key references athletes(id) on delete cascade,
  stripe_subscription_id  text   not null unique,
  -- Stripe subscription status — see file header for value set.
  status                  text   not null,
  -- The price the athlete is on. Single tier today; field exists so future
  -- multi-tier (Athlete vs Athlete Plus) doesn't need a schema change.
  price_id                text   not null,
  -- End of the current billing period; 'next invoice' for active subs,
  -- 'access expires' for canceled-but-still-paid subs.
  current_period_end      timestamptz,
  -- True when the athlete has clicked Cancel in the Customer Portal but the
  -- period hasn't ended yet. Coach UI shows "cancelado, acceso hasta DD/MM".
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint stripe_subscriptions_status_chk check (
    status in (
      'active', 'trialing', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    )
  )
);

create index stripe_subscriptions_status_idx
  on stripe_subscriptions (status, current_period_end);

commit;

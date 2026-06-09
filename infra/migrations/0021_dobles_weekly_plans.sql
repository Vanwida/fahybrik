-- 0021: Dobles + weekly_plans + box-class awareness (Sprint W1 foundation).
--
-- This migration is the schema foundation for the Dobles HYROX feature, the
-- coach's weekly planning surface, and the subscription model that covers
-- both individual + dobles + pro_elite tiers.
--
-- Idempotent by design — every change uses `IF NOT EXISTS` (columns, tables,
-- indexes) and DO-blocks for enum creation, so re-running the migration is a
-- safe no-op.
--
-- Sections
-- --------
-- 1. users: partner pairing (Dobles), box member flag (D1 box-class
--    awareness), language preference, optional box class schedule.
-- 2. weekly_plans: coach-curated weekly proposals (one row per athlete per
--    week_start). Can be IA-proposed and coach-approved; supports sharing
--    between paired Dobles athletes via `shared = true`.
-- 3. workout_assignments: station assignment for Dobles (which partner does
--    which HYROX station) + partner_visibility to gate sharing per-assignment.
-- 4. subscriptions: per-user billing record covering Individual, Dobles, and
--    Pro Elite tiers. Coexists with the existing `stripe_subscriptions` table
--    (which is athlete-scoped, single-tier legacy). Future migrations may
--    consolidate; for now both live side-by-side.

begin;

-- =============================================================================
-- 1. users — Dobles pairing + box member + language + box class schedule
-- =============================================================================

alter table users
  add column if not exists partner_id bigint null references users(id) on delete set null,
  add column if not exists box_member boolean not null default false,
  add column if not exists idioma text not null default 'es',
  add column if not exists box_class_schedule jsonb null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_idioma_chk'
      and conrelid = 'public.users'::regclass
  ) then
    alter table users
      add constraint users_idioma_chk check (idioma in ('es', 'en'));
  end if;
end $$;

create index if not exists users_partner_id_idx
  on users (partner_id)
  where partner_id is not null;

-- =============================================================================
-- 2. weekly_plans — coach weekly planning surface (D1)
-- =============================================================================

do $$
begin
  create type weekly_plan_status as enum ('draft', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists weekly_plans (
  id              bigserial primary key,
  athlete_id      bigint not null references athletes(id) on delete cascade,
  microcycle_id   bigint null references microcycles(id) on delete set null,
  week_start      date not null,
  status          weekly_plan_status not null default 'draft',
  ia_proposed     boolean not null default false,
  approved_by     bigint null references coaches(id),
  shared          boolean not null default false,
  notes           text null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (athlete_id, week_start)
);

create index if not exists weekly_plans_status_idx
  on weekly_plans (status);

create index if not exists weekly_plans_athlete_week_idx
  on weekly_plans (athlete_id, week_start);

-- =============================================================================
-- 3. workout_assignments — station assignment + partner visibility (Dobles)
-- =============================================================================

alter table workout_assignments
  add column if not exists station_assignment jsonb null,
  add column if not exists partner_visibility text not null default 'shared';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_assignments_partner_visibility_chk'
      and conrelid = 'public.workout_assignments'::regclass
  ) then
    alter table workout_assignments
      add constraint workout_assignments_partner_visibility_chk
      check (partner_visibility in ('shared', 'self_only'));
  end if;
end $$;

-- =============================================================================
-- 4. subscriptions — user-scoped billing covering individual / dobles / pro_elite
-- =============================================================================
--
-- Lives alongside stripe_subscriptions (athlete-scoped legacy). The new
-- table is user-scoped so a Dobles subscription can be linked to two users
-- via partner_user_id without duplicating billing.

do $$
begin
  create type subscription_status as enum (
    'active', 'past_due', 'canceled', 'incomplete', 'trialing'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists subscriptions (
  id                       bigserial primary key,
  user_id                  bigint not null references users(id) on delete cascade,
  partner_user_id          bigint null references users(id) on delete set null,
  plan_type                text not null,
  stripe_customer_id       text null,
  stripe_subscription_id   text null unique,
  status                   subscription_status not null default 'incomplete',
  current_period_end       timestamptz null,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_type_chk'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table subscriptions
      add constraint subscriptions_plan_type_chk
      check (plan_type in ('individual', 'dobles', 'pro_elite'));
  end if;
end $$;

create index if not exists subscriptions_user_idx
  on subscriptions (user_id);

create index if not exists subscriptions_partner_idx
  on subscriptions (partner_user_id)
  where partner_user_id is not null;

create index if not exists subscriptions_status_idx
  on subscriptions (status);

commit;

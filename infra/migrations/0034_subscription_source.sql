-- 0034: subscriptions.source — origin of the billing record.
--
-- Adds a `source` discriminator so we can tell genuine Stripe-billed
-- subscriptions apart from coach-granted "comp" (courtesy / comp'd) access.
-- A comp athlete has status='active' (full app access on every surface) but
-- pays nothing — so revenue metrics (MRR, revenue churn) must EXCLUDE comp.
--
-- Behavior-preserving for existing rows: the column defaults to 'stripe', so
-- every pre-existing subscription is treated exactly as before. Prior reads
-- that never SELECTed `source` keep working unchanged.
--
-- Idempotent: `add column if not exists` + a guarded check constraint (only
-- added when not already present). Re-running is a no-op.

alter table subscriptions
  add column if not exists source text not null default 'stripe';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_source_chk'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table subscriptions
      add constraint subscriptions_source_chk
      check (source in ('stripe', 'comp'));
  end if;
end $$;

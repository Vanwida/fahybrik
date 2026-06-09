-- 0031: Deprecate legacy stripe_customers / stripe_subscriptions (Finding M9).
--
-- Reconciliation decision (Phase 1b — Stripe backend):
--   The user-scoped `subscriptions` table (0021) is the SINGLE SOURCE OF TRUTH
--   for billing going forward. It covers all three tiers (individual / dobles /
--   pro_elite) and supports the Dobles partner model via `partner_user_id` —
--   neither of which the athlete-scoped, single-tier legacy tables can express.
--
--   The legacy tables (`stripe_customers`, `stripe_subscriptions` from 0012)
--   were verified EMPTY (0 rows) at reconciliation time, so there is NO data to
--   migrate. We do NOT drop them in this migration:
--     * Dropping is irreversible; keeping them costs nothing (they're empty).
--     * They remain as an audit trail of the original scaffold.
--   All application code has been rewired off these tables onto `subscriptions`.
--
--   A future migration MAY drop them once we are confident nothing references
--   them. For now they are marked deprecated via a table comment so anyone
--   inspecting the schema sees the intent immediately.
--
-- Idempotent: COMMENT ON is a metadata-only no-op when re-run.

begin;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'stripe_customers'
  ) then
    comment on table stripe_customers is
      'DEPRECATED (0031): superseded by subscriptions.stripe_customer_id. Empty, retained for audit only. Do not write.';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'stripe_subscriptions'
  ) then
    comment on table stripe_subscriptions is
      'DEPRECATED (0031): superseded by the user-scoped subscriptions table. Empty, retained for audit only. Do not write.';
  end if;
end $$;

commit;

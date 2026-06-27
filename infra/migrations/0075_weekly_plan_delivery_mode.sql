-- 0075_weekly_plan_delivery_mode.sql
-- Discriminator for HOW a DRAFT weekly_plan reaches the athlete.
--
-- Before this, weekly_plans.status='draft' had TWO indistinguishable meanings and
-- the Saturday publish cron (lib/cron/publish-weekly-plans) blindly published
-- BOTH — leaking private coach drafts to athletes:
--   'scheduled' (DEFAULT) — staggered delivery from /assign-month: the cron
--                releases one draft week each weekend. Existing rows inherit this
--                default, preserving the current staggered behavior exactly.
--   'manual'   — a PRIVATE coach draft (/assign-draft + the intake
--                first-microciclo): the athlete sees NOTHING until the coach
--                publishes it by hand. The cron NEVER auto-publishes these — this
--                column is the real publish GATE.
--
-- Only meaningful while status='draft'; ignored once 'published'/'archived'.
-- Additive + idempotent: a not-null column with a safe default + a CHECK guard.

alter table weekly_plans
  add column if not exists delivery_mode text not null default 'scheduled';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weekly_plans_delivery_mode_chk'
  ) then
    alter table weekly_plans
      add constraint weekly_plans_delivery_mode_chk
      check (delivery_mode in ('scheduled', 'manual'));
  end if;
end $$;

comment on column weekly_plans.delivery_mode is
  'How a draft week reaches the athlete: scheduled (cron staggered release) | manual (private coach draft; the cron never auto-publishes). Only meaningful while status=draft.';

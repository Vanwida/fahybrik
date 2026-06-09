-- Athlete-facing `plan_published` notification type (phase 1c crons).
--
-- Emitted by the publish-weekly-plans cron (Saturday 23:59 UTC) when an
-- athlete's draft weekly_plan for the upcoming week transitions to
-- 'published'. The iOS app deep-links into the published week.
--
-- Idempotent: ADD VALUE IF NOT EXISTS — safe to re-run against any branch
-- bootstrapped after 0001/0018.

begin;

alter type notification_type add value if not exists 'plan_published';

commit;

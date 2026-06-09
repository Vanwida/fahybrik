-- Coach inbox notification types (phase 1c).
--
-- Extends `notification_type` enum with the four coach-facing kinds used to
-- surface AI proposals and intake-ready signals inside the dashboard inbox /
-- review badge / bell dropdown.
--
-- Kept idempotent so the migration is safe to re-run against branches that
-- may have been bootstrapped from a snapshot taken after 0017.

begin;

alter type notification_type add value if not exists 'week_adjustment_pending';
alter type notification_type add value if not exists 'monthly_block_pending';
alter type notification_type add value if not exists 'intake_pending';
alter type notification_type add value if not exists 'atr_transition_suggested';

commit;

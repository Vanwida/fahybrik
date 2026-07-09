-- 0116: authorship columns on OPERATIONAL / lifecycle entities.
--
-- Same standard quartet as 0115 (created_by_user_id/_kind, last_edited_by_user_id/
-- _kind → users(id) + actor_kind) so recordEdit()/AuthorStamp are uniform here too.
-- These entities have mixed actors: a coach dado-de-alta / edita, an athlete
-- self-logs or reports a lesión, the IA proposes a weekly plan, the SYSTEM (Stripe/
-- cron) writes a subscription/appointment. The `*_by_kind` column carries that.
--
-- Existing partial-provenance columns are KEPT (injuries.registered_by,
-- injury_updates.recorded_by, workout_assignments.origin, weekly_plans.ia_proposed
-- / approved_by, *_by_coach_id): the new *_by_user_id columns UPGRADE them to
-- user-level attribution without dropping anything.
--
-- Backfill only where the coach owner is unambiguous (athletes, athlete_invitations
-- → coach's user). Ambiguous historical rows stay unattributed (render no sello) —
-- authorship counts from the team's first login, by design.
--
-- Additive + idempotent. Runner strips begin/commit, wraps in one transaction.

begin;

alter table athletes
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table athlete_invitations
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table athlete_pauses
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table athlete_pause_requests
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table appointments
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table subscriptions
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table coach_availability
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table coach_availability_exceptions
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table injuries
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table injury_updates
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind;

alter table workout_assignments
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table weekly_plans
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

-- leads are self-captured by the prospect (not a user), so NO created_by here —
-- coach attribution on a lead lives in its status transitions (0117). This column
-- captures a coach EDITING a lead's fields.
alter table leads
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

-- Backfill created_by where the coach owner is unambiguous.
update athletes a
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where a.coach_id = c.id and a.created_by_user_id is null;

update athlete_invitations i
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where i.created_by_coach_id = c.id and i.created_by_user_id is null;

commit;

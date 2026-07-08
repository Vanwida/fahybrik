-- 0102_athlete_cap_waitlist.sql
--
-- Coach capacity cap + lead waitlist (#18). Pablo trains a LIMITED group so he can follow
-- each plan closely. When he is at capacity, a lead that finishes onboarding goes onto a
-- FIFO waitlist instead of booking the intro call. Releasing a plaza is MANUAL by the coach
-- (there is no cron, no auto-release): a plaza only opens when an athlete leaves, and bajas
-- (#13) do not exist yet, so "a plaza opened" cannot be detected automatically. The coach
-- clicks "liberar plaza" on the next lead in line and that lead is emailed the booking link.
--
-- See web/lib/coach/capacity.ts (active-vs-cap) + web/lib/leads/waitlist.ts (the store).
--
-- Additive + idempotent (guarded with `if not exists`). Runner wraps the file in one
-- transaction, so no begin/commit here.

-- Coach cap -----------------------------------------------------------------------
alter table coaches add column if not exists max_athletes int;
comment on column coaches.max_athletes is
  'Cupo máximo de atletas activos del coach (#18). null = sin límite, waitlist desactivada. Cuando activos >= max, los leads que completan onboarding entran en lista de espera en vez de reservar cita.';

-- Lead waitlist stamps ------------------------------------------------------------
alter table leads add column if not exists waitlisted_at timestamptz;
comment on column leads.waitlisted_at is
  'Cuándo el lead entró en la lista de espera (#18). null = no está en espera. El valor marca el orden FIFO de liberación (más antiguo, primero).';

alter table leads add column if not exists waitlist_released_at timestamptz;
comment on column leads.waitlist_released_at is
  'Cuándo el coach le liberó una plaza y se envió el email de aviso (#18). null = sigue esperando. Se sella MANUALMENTE, nunca de forma automática.';

-- FIFO index over the leads that are ACTIVELY waiting (waitlisted, not yet released) — the
-- set the coach picks the next release from, ordered by arrival.
create index if not exists leads_waitlist_idx on leads (waitlisted_at)
  where waitlisted_at is not null and waitlist_released_at is null;

-- 0104_athlete_lifecycle.sql
--
-- Athlete lifecycle (#13) — a state that is DISTINCT from billing. Until now
-- "is this athlete active" was derived purely from subscriptions.status='active'.
-- That conflates two different truths: whether Pablo is CURRENTLY coaching the
-- athlete (lifecycle) vs whether Stripe is billing them (subscription). #13 splits
-- them out with an explicit lifecycle state so a paused or baja athlete stops
-- counting toward the cupo (web/lib/coach/capacity.ts) and freezes their plan,
-- WITHOUT touching billing history or the RGPD account-deletion path (#19).
--
-- States (athlete_lifecycle_status):
--   activo   — coaching normally (the default for every existing + new athlete)
--   pausado  — plan frozen, an OPEN athlete_pauses interval excludes this range
--              from adherence (built by the adherence agent). Never automatic.
--   baja     — left the roster. Plan frozen immediately, billing cancels at period
--              end (cancel_at_period_end), history ALWAYS preserved. Reversible via
--              re-alta. This is NOT an RGPD deletion (that is #19, a separate path).
--
-- Additive + idempotent (guarded enum + `if not exists` everywhere). The runner
-- wraps the whole file in one transaction, so there is no begin/commit here. Note
-- no comment string literal below contains a semicolon, so the statement splitter
-- never mis-splits a comment.

-- Lifecycle enum (guarded, mirrors the lead_status idempotent pattern) ------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'athlete_lifecycle_status') then
    create type athlete_lifecycle_status as enum ('activo', 'pausado', 'baja');
  end if;
end $$;

-- Lifecycle columns on athletes --------------------------------------------------
alter table athletes add column if not exists lifecycle_status athlete_lifecycle_status not null default 'activo';
comment on column athletes.lifecycle_status is
  'Ciclo de vida del atleta (#13), DISTINTO de la facturación. activo = entrenando. pausado = plan congelado y rango excluido de adherencia (athlete_pauses abierto). baja = fuera del roster, plan congelado, cancel_at_period_end en la subscripción, historial conservado, reversible con re-alta. No cuenta para el cupo salvo activo.';

alter table athletes add column if not exists baja_at timestamptz;
comment on column athletes.baja_at is
  'Cuándo el atleta pasó a baja (#13). null salvo lifecycle_status=baja. Se limpia en la re-alta.';

alter table athletes add column if not exists baja_reason text;
comment on column athletes.baja_reason is
  'Motivo de la baja (#13), código estable de PAUSE_REASONS (lesion|vacaciones|paron|otro). null salvo baja. Se limpia en la re-alta.';

-- Pause intervals ----------------------------------------------------------------
-- One row per pause. end_date null = pausa abierta (el atleta sigue pausado ahora,
-- se excluye hasta hoy). La adherencia excluye el rango [start_date, coalesce(end_date, hoy)].
create table if not exists athlete_pauses (
  id                  bigint generated always as identity primary key,
  athlete_id          bigint not null references athletes(id) on delete cascade,
  start_date          date not null,
  end_date            date,
  reason              text not null,
  note                text,
  requested_by        text not null,
  created_by_coach_id bigint references coaches(id),
  created_at          timestamptz not null default now(),
  constraint athlete_pauses_reason_chk check (reason in ('lesion', 'vacaciones', 'paron', 'otro')),
  constraint athlete_pauses_requested_by_chk check (requested_by in ('coach', 'athlete')),
  constraint athlete_pauses_range_chk check (end_date is null or end_date >= start_date)
);
comment on table athlete_pauses is
  'Intervalos de pausa del atleta (#13). end_date null = pausa abierta (pausado ahora). La adherencia excluye [start_date, coalesce(end_date, hoy)]. requested_by = quién la pidió (coach|athlete).';

-- Range scan for the adherence exclusion + the coach history view.
create index if not exists athlete_pauses_athlete_idx on athlete_pauses (athlete_id, start_date, end_date);
-- The at-most-one currently-open pause per athlete (pausado ahora).
create index if not exists athlete_pauses_open_idx on athlete_pauses (athlete_id) where end_date is null;

-- Pause requests (athlete-initiated, coach-confirmed) ----------------------------
-- The athlete asks for a pause from the app. The coach confirms (→ pauseAthlete) or
-- declines. A pause is NEVER automatic: this row is the request, not the pause.
create table if not exists athlete_pause_requests (
  id                   bigint generated always as identity primary key,
  athlete_id           bigint not null references athletes(id) on delete cascade,
  reason               text not null,
  note                 text,
  status               text not null default 'pending',
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  resolved_by_coach_id bigint references coaches(id),
  constraint athlete_pause_requests_reason_chk check (reason in ('lesion', 'vacaciones', 'paron', 'otro')),
  constraint athlete_pause_requests_status_chk check (status in ('pending', 'confirmed', 'declined'))
);
comment on table athlete_pause_requests is
  'Solicitudes de pausa iniciadas por el atleta (#13). status pending → confirmed (el coach confirma y llama a pauseAthlete) | declined. La pausa nunca es automática.';

-- At most one pending request matters per athlete (the requestPause guard reads this).
create index if not exists athlete_pause_requests_pending_idx on athlete_pause_requests (athlete_id) where status = 'pending';

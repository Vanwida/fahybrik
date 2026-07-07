-- 0093_appointments.sql
--
-- Videollamada booking between a lead and the coach (funnel tasks #2 + #4). A lead
-- picks a 30-min slot (from the onboarding end or a public link); the coach accepts /
-- rejects / cancels from the dashboard. On accept the lead advances to `agendado`.
--
-- Single-coach launch: no coach_id anywhere (appointments, availability). When the
-- product goes multi-coach these grow a coach_id FK — noted at each table.
-- All wall-clock reasoning is Europe/Madrid (BOX_TIMEZONE); instants are timestamptz (UTC).
--
-- Additive + idempotent. Runner wraps the file in one transaction; no begin/commit.

-- Appointment lifecycle enum -----------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type appointment_status as enum (
      'pendiente',   -- lead requested a slot, awaiting coach
      'aceptada',    -- coach confirmed (lead → agendado; meet link may follow)
      'rechazada',   -- coach declined this slot (lead invited to re-book)
      'cancelada',   -- called off after acceptance (either side)
      'completada',  -- the call happened
      'no_show'      -- booked but the lead didn't show
    );
  end if;
end $$;

-- Lead public booking token -----------------------------------------------------
-- Opaque, unguessable token for the public re-book page /es/cita/[token] (never the
-- numeric id). Backfill existing leads, then default + not-null + unique so every lead
-- always has one. gen_random_uuid() is built-in on PG13+ (no extension).
alter table leads add column if not exists token text;
update leads set token = gen_random_uuid()::text where token is null;
alter table leads alter column token set default gen_random_uuid()::text;
alter table leads alter column token set not null;
create unique index if not exists leads_token_key on leads (token);

comment on column leads.token is
  'Opaque public booking token for /es/cita/[token]. Auto-assigned (gen_random_uuid); never expose the numeric id publicly.';

-- Appointments ------------------------------------------------------------------
create table if not exists appointments (
  id               bigint generated always as identity primary key,
  lead_id          bigint not null references leads(id) on delete cascade,
  requested_start  timestamptz not null,               -- slot start (UTC; Madrid wall-clock)
  duration_minutes int not null default 30,            -- Alex's rule: 30-min blocks (fixed in v1)
  status           appointment_status not null default 'pendiente',
  meet_link        text,                               -- Google Meet URL (adapter/manual); null = "llegará antes de la llamada"
  coach_note       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint appointments_duration_chk check (duration_minutes between 15 and 120)
);
create index if not exists appointments_lead_id_idx on appointments (lead_id);
create index if not exists appointments_status_idx on appointments (status);
create index if not exists appointments_requested_start_idx on appointments (requested_start);
-- At most ONE active (pendiente/aceptada) appointment per lead — a lead books one call
-- at a time. Enforced with a partial unique index on lead_id for the active states.
create unique index if not exists appointments_one_active_per_lead
  on appointments (lead_id)
  where status in ('pendiente', 'aceptada');

comment on table appointments is
  'Lead↔coach videollamada bookings (funnel #2/#4). One active (pendiente|aceptada) per lead. 30-min Europe/Madrid slots. On accept the lead → agendado.';

-- Coach weekly availability -----------------------------------------------------
-- Recurring weekly windows the coach is bookable. weekday uses JS getUTCDay():
-- 0=Sunday … 6=Saturday, interpreted in Europe/Madrid. (Single-coach → no coach_id;
-- add one for multi-coach.)
create table if not exists coach_availability (
  id         bigint generated always as identity primary key,
  weekday    int not null,                             -- 0=Sun … 6=Sat (Europe/Madrid)
  start_time time not null,                            -- Madrid wall-clock
  end_time   time not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_availability_weekday_chk check (weekday between 0 and 6),
  constraint coach_availability_window_chk check (end_time > start_time)
);
create index if not exists coach_availability_weekday_idx on coach_availability (weekday) where activo;

comment on table coach_availability is
  'Coach recurring weekly availability windows (Europe/Madrid). weekday 0=Sun..6=Sat (JS getUTCDay). Slots are 30-min splits of these windows minus exceptions + busy appointments.';

-- Blocked dates (holidays / one-offs) -------------------------------------------
create table if not exists coach_availability_exceptions (
  id         bigint generated always as identity primary key,
  fecha      date not null,                            -- blocked calendar day (Europe/Madrid)
  motivo     text,
  created_at timestamptz not null default now(),
  constraint coach_availability_exceptions_fecha_unique unique (fecha)
);

comment on table coach_availability_exceptions is
  'Blocked calendar days (Europe/Madrid) — no slots offered. Overrides coach_availability for that date.';

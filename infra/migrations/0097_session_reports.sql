-- Reporting de la sesión 1:1 (#14) — el parte de una videollamada 1:1, escrito por el
-- coach. Historial por persona, fuente del email post-llamada (#11), consultable después.
-- Nada de lo hablado se pierde.
--
-- Doble sujeto (lead_id | athlete_id, al menos uno): una llamada de VENTAS es con un lead;
-- un 1:1 de seguimiento es con un atleta. Un lead que convierte conserva sus partes de
-- venta, y aparecen en la ficha del atleta vía leads.converted_athlete_id (join, no copia).
-- appointment_id enlaza el parte con la cita completada de la que sale (null si la llamada
-- fue fuera del sistema de citas). coach_id denormalizado para el futuro multi-coach.
--
-- Estructurado lo que es dato (outcome + precio → alimentan métricas #20); prosa lo que es
-- conversación (notas + próximos pasos).

do $$ begin
  if not exists (select 1 from pg_type where typname = 'session_report_outcome') then
    create type session_report_outcome as enum (
      'convertido',   -- firmó / se da de alta
      'pensandolo',   -- se lo piensa
      'no',           -- declina
      'seguimiento',  -- requiere otra llamada / acción antes de decidir
      'no_show'       -- no se presentó
    );
  end if;
end $$;

create table if not exists session_reports (
  id                     bigint generated always as identity primary key,
  lead_id                bigint references leads(id) on delete cascade,
  athlete_id             bigint references athletes(id) on delete cascade,
  appointment_id         bigint references appointments(id) on delete set null,
  coach_id               bigint not null references coaches(id) on delete cascade,
  occurred_at            timestamptz not null,
  duration_minutes       int not null default 30,
  notes                  text,
  next_steps             text,
  -- Contexto de llamada de VENTAS (null en un 1:1 de atleta).
  outcome                session_report_outcome,
  quoted_price_eur       numeric(8,2),
  -- #11: cuándo se envió el email post-llamada con este parte (idempotencia). Null = no enviado.
  summary_email_sent_at  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  constraint session_reports_subject_chk check (lead_id is not null or athlete_id is not null),
  constraint session_reports_duration_chk check (duration_minutes between 5 and 300),
  constraint session_reports_notes_len_chk check (notes is null or char_length(notes) <= 8000),
  constraint session_reports_next_len_chk check (next_steps is null or char_length(next_steps) <= 4000),
  constraint session_reports_price_chk check (quoted_price_eur is null or quoted_price_eur >= 0)
);

create index if not exists session_reports_lead_idx    on session_reports (lead_id, occurred_at desc) where lead_id is not null and deleted_at is null;
create index if not exists session_reports_athlete_idx on session_reports (athlete_id, occurred_at desc) where athlete_id is not null and deleted_at is null;
create index if not exists session_reports_appt_idx    on session_reports (appointment_id) where appointment_id is not null;

comment on table session_reports is 'Funnel #14: parte de videollamada 1:1 (lead=venta / athlete=seguimiento). Fuente del email post-llamada (#11).';

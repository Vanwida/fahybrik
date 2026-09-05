-- 0207: COROS MCP pull — confirmación Sí/No + cupo FIT diario.
--
-- Un activity de COROS SIEMPRE entra en historial (assignment_id NULL, mig 0191).
-- Si ese día hay un planned pendiente, la app pregunta «¿esto es el entreno?».
-- La respuesta se guarda aquí para no repreguntar ni auto-cerrar el planned.
--
-- El cupo de 50 FIT/día es de COROS MCP (por cuenta OAuth), no metodología.

begin;

create table if not exists wearable_activity_confirmations (
  id                    bigserial primary key,
  athlete_id            bigint not null references athletes(id) on delete cascade,
  provider              text not null,
  source_workout_ref    text not null,
  execution_id          bigint not null references workout_executions(id) on delete cascade,
  assignment_id         bigint not null references workout_assignments(id) on delete cascade,
  status                text not null default 'pending',
  created_at            timestamptz not null default now(),
  answered_at           timestamptz,
  unique (athlete_id, provider, source_workout_ref)
);

create index if not exists wearable_activity_confirmations_pending_idx
  on wearable_activity_confirmations (athlete_id, provider, status)
  where status = 'pending';

alter table wearable_activity_confirmations
  add constraint wearable_activity_confirmations_status_chk
  check (status in ('pending', 'yes', 'no'));

create table if not exists wearable_fit_quota (
  athlete_id  bigint not null references athletes(id) on delete cascade,
  provider    text not null,
  day         date not null,
  used        integer not null default 0,
  primary key (athlete_id, provider, day)
);

comment on table wearable_activity_confirmations is
  'Pregunta persistida: si un import wearable es el planned de ese día. Sin respuesta el planned sigue pending.';

comment on table wearable_fit_quota is
  'Cupo diario de descargas FIT por cuenta OAuth (COROS MCP: 50/día).';

commit;

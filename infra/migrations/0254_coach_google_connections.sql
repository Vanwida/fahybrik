-- 0254 — la conexión con Google Calendar es DE CADA COACH, no de la plataforma.
--
-- EL PROBLEMA (revisión de aislamiento, hallazgo 3)
-- -------------------------------------------------
-- 0096 guardaba UN refresh_token para toda la plataforma (`google_oauth_tokens`,
-- `provider` único) y el calendario salía de una variable de entorno
-- (`GOOGLE_CALENDAR_ID`). Con varios coaches, el siguiente que pulsara «conectar
-- Google» se quedaba el token de todos: desde ese momento las llamadas y revisiones
-- de TODOS los clubs (nombre del lead o del atleta, su email, la hora) se creaban en
-- su calendario, y cancelar una cita borraba eventos de ese calendario.
--
-- LA DECISIÓN (2026-09-23)
-- ------------------------
-- `coach_google_connections`: una fila por coach — su refresh_token y el calendario
-- donde se crean sus citas. `calendar_id` NULL = el calendario principal de la cuenta
-- que conectó (lo resuelve el código: 'primary'). Una cita usa la conexión del coach
-- de ESA cita (el dueño del lead, el operador del embudo para un lead sin dueño, el
-- coach del atleta en una revisión); sin conexión no hay evento, y el coach pega el
-- enlace a mano, como siempre.
--
-- LA FILA QUE YA EXISTE — a quién es, por orden de evidencia, nunca por descarte
-- ------------------------------------------------------------------------------
-- La fila global no dice quién la conectó. Se atribuye a un coach SOLO si los datos
-- lo dicen sin ambigüedad:
--   1. Las citas que ya se crearon en ese calendario (`appointments.google_event_id`)
--      son de un único coach (el dueño de su lead, o el coach de su atleta). Es un
--      hecho grabado: esos eventos están en su calendario.
--   2. Si no hay ninguna, los leads con dueño son todos de un único coach: el del
--      único embudo que ha existido (el mismo hecho que usaron 0147 y 0220).
--   3. Si no, una instalación de un solo coach.
-- Si nada de eso da un coach único, la fila NO se migra: cada coach vuelve a
-- conectar. `google_oauth_tokens` se queda donde está (nadie la lee ya) hasta que
-- se borre en una limpieza, para no perder el token si hubiera que atribuirlo a mano.
--
-- El calendario de la fila migrada queda NULL (el principal de esa cuenta): el
-- `GOOGLE_CALENDAR_ID` del entorno no es legible desde SQL. Si apuntaba a otro
-- calendario de la cuenta, se fija con un `update coach_google_connections set
-- calendar_id = '<id>' where coach_id = <coach>` tras desplegar.
--
-- Idempotente. Sin `default` salvo las marcas de tiempo (DECISIONS 2026-08-09).

create table if not exists coach_google_connections (
  coach_id      bigint primary key references coaches(id) on delete cascade,
  refresh_token text not null,
  calendar_id   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table coach_google_connections is
  'La conexión de Google Calendar de cada coach (0254): su refresh_token y su calendario. Las citas de un coach se crean SOLO con su conexión; sin fila, no hay evento.';
comment on column coach_google_connections.calendar_id is
  'Calendario donde se crean las citas del coach. NULL = el principal de la cuenta conectada.';

do $$
declare
  owner bigint;
begin
  if exists (select 1 from coach_google_connections) then
    return; -- ya migrado (o ya hay conexiones nuevas): no se toca nada.
  end if;
  if not exists (select 1 from google_oauth_tokens where provider = 'google') then
    return;
  end if;

  -- (1) El dueño de las citas que ya viven en ese calendario.
  select min(o.coach_id) into owner
    from (
      select coalesce(l.coach_id, a.coach_id) as coach_id
        from appointments ap
        left join leads l on l.id = ap.lead_id
        left join athletes a on a.id = ap.athlete_id
       where ap.google_event_id is not null
    ) o
   where o.coach_id is not null
  having count(distinct o.coach_id) = 1;

  -- (2) El dueño único de los leads (el único embudo que ha existido).
  if owner is null and not exists (select 1 from appointments where google_event_id is not null) then
    select min(coach_id) into owner
      from leads
     where coach_id is not null
    having count(distinct coach_id) = 1;
  end if;

  -- (3) Instalación de un solo coach.
  if owner is null and (select count(*) from coaches) = 1 then
    select min(id) into owner from coaches;
  end if;

  if owner is not null then
    insert into coach_google_connections (coach_id, refresh_token, calendar_id)
    select owner, refresh_token, null
      from google_oauth_tokens
     where provider = 'google';
  end if;
end $$;

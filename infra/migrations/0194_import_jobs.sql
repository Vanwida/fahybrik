-- El JOB de «Trae tu histórico» (importador de archivos FIT — ver
-- docs/DECISIONS.md 2026-08-13). Un export de Garmin son cientos de ficheros
-- dentro de un ZIP que no cabe ni en un body de API (~4,5 MB) ni en una sola
-- invocación: el ZIP sube prefirmado a Vercel Blob y esta fila es el cursor
-- que permite procesarlo POR LOTES y retomar donde iba si algo se corta —
-- el atleta ve «214 de 512 entrenos», no una ruleta que reza.
--
-- Los contadores separan los tres destinos posibles de una actividad
-- (insertada · reemplazó al blob plano de Salud · saltada porque la sesión
-- viva gana) porque el resumen final del flujo se los enseña al atleta y
-- «512 entrenos» a secas sería mentir por omisión. Los totales (km, rango de
-- fechas) se acumulan aquí y no se recalculan leyendo ejecuciones: el resumen
-- es DE ESTE import, y una consulta por source mezclaría imports anteriores.

create table import_jobs (
  id bigint generated always as identity primary key,
  athlete_id bigint not null references athletes(id) on delete cascade,
  -- Pathname del blob prefirmado — el ÚNICO identificador que el procesado
  -- acepta, nunca una URL del cliente (misma regla que el import por foto).
  blob_pathname text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'cancelled')),
  files_total integer,
  files_done integer not null default 0,
  files_unreadable integer not null default 0,
  activities_inserted integer not null default 0,
  activities_superseded integer not null default 0,
  activities_skipped integer not null default 0,
  distance_total_m double precision not null default 0,
  first_activity_at timestamptz,
  last_activity_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_jobs_athlete_recent
  on import_jobs (athlete_id, created_at desc);

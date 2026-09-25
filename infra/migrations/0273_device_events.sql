-- 0273 — El registro técnico de los aparatos: qué pasó en el enlace y en los
-- guardados, visto desde el móvil y desde el reloj.
--
-- Fase 0 del diseño Watch-first (docs/el-reloj-primero/, DECISIONS 2026-09-24):
-- «cierres, bloqueos y un registro de guardados fallidos y eventos del enlace,
-- enviados a nuestro servidor». Hasta hoy, un «a veces no conecta» no dejaba
-- rastro en ningún sitio que pudiéramos leer: el log del aparato se pierde al
-- cerrarlo y el Xcode del gimnasio no está en cada entreno.
--
-- Alcance decidido por Alex (24-09): se recoge a TODOS los atletas, solo datos
-- técnicos — nunca salud, ubicación ni contenido del entreno — y se borra a los
-- 30 días. El escritor (`/api/devices/events`) poda lo del atleta al escribir y
-- el cron diario lo de todos.
--
-- Una fila = un evento, con columnas explícitas:
--   · install_id + seq: el aparato numera sus eventos (seq sube siempre en esa
--     instalación). Un reenvío es el mismo evento: único por atleta+instalación+seq.
--   · device 'phone' | 'watch'; los del reloj llegan por el móvil y conservan
--     su propio install_id, versión y modelo.
--   · kind: link (enlace muñeca↔móvil: lanzar, espejo, alcance, desconexión),
--     session (estado de la sesión de entreno de HealthKit en cada lado),
--     save (guardar/subir un entreno: ok o fallo con su código),
--     lifecycle (arranque, paso a segundo plano, salida no limpia),
--     diagnostic (cierre inesperado o bloqueo que Apple entrega vía MetricKit).
--   · name: el evento concreto en snake_case; la lista vive en la app (una
--     versión nueva puede traer nombres nuevos: el servidor no los cierra).
--   · workout_id: la intención de entreno (el UUID sellado al pulsar Empezar)
--     para juntar los eventos de los dos aparatos de UNA sesión.
--   · outcome / code / domain: resultado y error (código HTTP con domain 'http',
--     o el NSError de Apple).
--   · detail: una línea técnica corta, sin datos personales.

create table if not exists device_events (
  id            bigserial primary key,
  athlete_id    bigint not null references athletes(id) on delete cascade,
  install_id    uuid not null,
  seq           bigint not null,
  device        text not null,
  kind          text not null,
  name          text not null,
  occurred_at   timestamptz not null,
  received_at   timestamptz not null default now(),
  workout_id    uuid,
  outcome       text,
  code          integer,
  domain        text,
  detail        text,
  app_version   text,
  app_build     text,
  os_version    text,
  device_model  text,
  constraint device_events_device_chk check (device in ('phone', 'watch')),
  constraint device_events_kind_chk check (kind in ('link', 'session', 'save', 'lifecycle', 'diagnostic')),
  constraint device_events_name_chk check (name ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint device_events_outcome_chk check (outcome is null or outcome in ('ok', 'failed')),
  constraint device_events_detail_len_chk check (detail is null or length(detail) <= 300),
  constraint device_events_seq_chk check (seq >= 0)
);

create unique index if not exists device_events_install_seq_uq
  on device_events (athlete_id, install_id, seq);

-- Leer lo último de un atleta (la pantalla de diagnóstico, el soporte).
create index if not exists device_events_athlete_time_idx
  on device_events (athlete_id, occurred_at desc);

-- La poda de 30 días.
create index if not exists device_events_received_idx
  on device_events (received_at);

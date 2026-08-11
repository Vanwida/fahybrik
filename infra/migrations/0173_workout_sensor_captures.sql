-- 0173_workout_sensor_captures.sql
--
-- FASE 0 del plan de reconocer el movimiento (docs/plan-reconocer-movimiento.html).
-- Cada sesión hecha con el reloj puede archivar su señal inercial decimada.
-- Las etiquetas de qué se hacía viven en segment_executions (started_at/ended_at
-- + exercise_id); aquí solo vive el archivo y los parámetros de captura.
--
-- Numeración: el plan citaba 0157, pero esas filas ya se ocuparon. Cabeza = 0172.

begin;

create table if not exists workout_sensor_captures (
  id               bigint generated always as identity primary key,
  execution_id     bigint not null references workout_executions(id) on delete cascade,
  athlete_id       bigint not null references athletes(id) on delete cascade,

  -- Dónde quedó el archivo en el almacén (pathname privado, no URL cruda).
  storage_pathname text not null,
  -- Bytes del archivo comprimido/archivado.
  byte_size        integer not null check (byte_size > 0),

  -- Parámetros de la captura — sin ellos el archivo no se interpreta dentro de un año.
  format_version   smallint not null default 1,
  sample_hz        real not null check (sample_hz > 0 and sample_hz <= 200),
  channels         text[] not null,
  -- 'batched' | 'classic' — cambia la interpretación del dato.
  capture_mode     text not null,
  watch_model      text,
  wrist            text, -- 'left' | 'right' | null
  duration_s       real not null check (duration_s >= 0),
  started_at       timestamptz not null,
  ended_at         timestamptz not null,

  -- Consentimiento del atleta en el momento de archivar (inmutable histórico).
  consent_version  text not null,

  created_at       timestamptz not null default now(),

  constraint workout_sensor_captures_execution_unique unique (execution_id),
  constraint workout_sensor_captures_mode_chk
    check (capture_mode in ('batched', 'classic')),
  constraint workout_sensor_captures_wrist_chk
    check (wrist is null or wrist in ('left', 'right')),
  constraint workout_sensor_captures_window_chk
    check (ended_at >= started_at),
  constraint workout_sensor_captures_channels_chk
    check (cardinality(channels) >= 1)
);

create index if not exists workout_sensor_captures_athlete_idx
  on workout_sensor_captures (athlete_id, created_at desc);

comment on table workout_sensor_captures is
  'Archivo de señal inercial de muñeca por ejecución (fase 0). Etiquetas de tramo en segment_executions; aquí solo el blob y los parámetros de captura.';

commit;

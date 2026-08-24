-- 0208 — CARGAS DE COMPETICION DEL COACH (card 130, pieza 2)
--
-- POR QUE
-- Un objetivo relativo «a peso de competicion» se traduce al leer contra los
-- kilos de ESE atleta en SU division y genero. Esos kilos no son nuestros: son
-- metodo del entrenador (HARD RULE N0). El catalogo de estaciones
-- (`shared/domain/hyrox/stations.ts`) declara la FORMA (trineo / implemento /
-- damper) y contesta null al numero, a proposito. Esta tabla es el sitio donde
-- el coach escribe el numero.
--
-- QUÉ
-- Una fila por (coach, estacion, division, genero). Sin seed. Sin default de
-- kilos. Celda ausente = «no lo se». Nunca se adivina el numero de otra celda.
--
-- El kind (sled / single / per_implement / damper) y el numero de implementos
-- del farmers (2) NO se guardan: salen del catalogo. El coach solo rellena kg
-- o damper.
--
-- NO reutilizar `methodology_station_strategy` (sin division, motor muerto).
-- NO escribir en `coach_methodology.run_pace_anchor`: crear esa fila activa
-- 37 columnas con defaults horneados, el anti-patron de DECISIONS.
--
-- Aditivo. Idempotente. El runner envuelve el fichero en UNA transaccion
-- (sin begin/commit aqui) y corta por punto y coma, asi que ningun
-- comentario lleva uno.

create table if not exists coach_station_loads (
  id            bigint      generated always as identity primary key,
  coach_id      bigint      not null references coaches (id) on delete cascade,
  station_slug  text        not null,
  division      text        not null,
  gender        text        not null,
  kg            numeric,
  damper        smallint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint coach_station_loads_cell_uq
    unique (coach_id, station_slug, division, gender),
  constraint coach_station_loads_division_chk
    check (division in ('open', 'pro', 'elite')),
  constraint coach_station_loads_gender_chk
    check (gender in ('men', 'women', 'mixed')),
  constraint coach_station_loads_kg_chk
    check (kg is null or kg > 0),
  constraint coach_station_loads_damper_chk
    check (damper is null or (damper >= 1 and damper <= 10)),
  constraint coach_station_loads_one_value_chk
    check (kg is null or damper is null)
);

create index if not exists coach_station_loads_coach_idx
  on coach_station_loads (coach_id);

comment on table coach_station_loads is
  'Kilos (o damper) de competicion por estacion, division y genero. Metodo del coach. Sin seed: vacio = no lo se. El eje (sled/single/damper) vive en el catalogo de estaciones, no aqui.';

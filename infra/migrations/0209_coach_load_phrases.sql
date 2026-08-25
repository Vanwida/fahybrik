-- 0209 — DICCIONARIO DE FRASES DE CARGA DEL COACH (card 130, pieza 4)
--
-- POR QUE
-- «carga media», «ligera», «pesada» no son un tipo de objetivo. Son palabras
-- de ESE entrenador. Tiparlas dejaría el dato ambiguo para siempre. Esta
-- tabla guarda la traducción UNA vez (frase → patrón ya existente). El
-- importador la reutiliza. Vacío = no lo sé, la línea va a revisión. Nunca
-- se inventa un kilo.
--
-- QUÉ
-- Una fila por (coach, frase normalizada). `as` es el patrón: porcentaje del
-- peso de competición, porcentaje del peso corporal, o kilos fijos. La
-- estación no se guarda: la pone la línea al importar.
--
-- NO añadir un kind cualitativo a Target. NO un segundo camino %1RM. NO
-- seed. NO copiar coach_methodology (defaults horneados).
--
-- Aditivo. Idempotente. El runner envuelve el fichero en UNA transaccion
-- (sin begin/commit aqui) y corta por punto y coma, asi que ningun
-- comentario lleva uno.

create table if not exists coach_load_phrases (
  id          bigint      generated always as identity primary key,
  coach_id    bigint      not null references coaches (id) on delete cascade,
  phrase_key  text        not null,
  phrase      text        not null,
  as_kind     text        not null,
  value       numeric     not null,
  value_max   numeric,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint coach_load_phrases_uq
    unique (coach_id, phrase_key),
  constraint coach_load_phrases_kind_chk
    check (as_kind in ('competition_percent', 'bodyweight_percent', 'kg')),
  constraint coach_load_phrases_value_chk
    check (value > 0 and value <= 500),
  constraint coach_load_phrases_max_chk
    check (value_max is null or (value_max >= value and value_max <= 500))
);

create index if not exists coach_load_phrases_coach_idx
  on coach_load_phrases (coach_id);

comment on table coach_load_phrases is
  'Traducción de una frase de carga del coach a un objetivo ya existente. Vacío = no lo sé. Sin seed. La estación la pone la línea al importar.';

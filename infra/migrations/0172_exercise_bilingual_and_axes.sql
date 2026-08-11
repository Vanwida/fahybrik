-- 0172_exercise_bilingual_and_axes.sql
--
-- EL CATÁLOGO HABLA DOS IDIOMAS, Y DICE POR QUÉ EJE SE BUSCA UN MOVIMIENTO.
-- (Ver docs/DECISIONS.md 2026-08-11 «La biblioteca de ejercicios».)
--
-- EL HUECO, MEDIDO
-- ----------------
-- 126 ejercicios, y 121 de ellos con el nombre SOLO en inglés («Back Squat»);
-- cinco en castellano («Puente de glúteo»). El coach escribe «sentadilla» y no
-- encuentra nada, aunque el movimiento esté en su biblioteca. El vocabulario que
-- SÍ sabe que «sentadilla trasera» es `back-squat` vive hoy cableado en
-- TypeScript (`GLOBAL_ALIASES`, 101 entradas en `web/lib/import/exercise-resolve.ts`,
-- espejo a su vez de `infra/scripts/parse_blocks_lib.ts`): lo usa el importador y
-- NO lo usa el buscador, así que el mismo conocimiento sirve a una superficie y no
-- a la otra. Y `coach_exercise_synonyms` (0109), la capa que aprende el dialecto
-- de CADA coach, tiene cero filas: no es sustituto de un vocabulario base.
--
-- Además el catálogo solo ofrece dos ejes para navegarlo —`category` (7 valores) y
-- `modality` (9)— y ninguno de los dos es la pregunta que hace un entrenador. Nadie
-- pide «un ejercicio de categoría strength»: se pide «una bisagra de cadera», «un
-- empuje vertical», «algo unilateral». Con 126 filas se aguanta a fuerza de scroll;
-- con 500 la lista deja de ser navegable.
--
-- LO QUE SE AÑADE, Y POR QUÉ CADA COSA
-- ------------------------------------
-- · `name_es` / `name_en` — DOS COLUMNAS EXPLÍCITAS, no un blob de i18n (convención
--   del repo). El idioma se resuelve por PERSONA: el coach en el suyo
--   (`users.idioma`) y el atleta en el suyo (`athletes.preferred_language`), que ya
--   existen los dos. `name` NO se toca: sigue siendo el nombre de siempre y el
--   último recurso del resolutor, así que ninguna lectura de hoy se rompe.
--
-- · `movement_pattern` — el eje que faltaba, y es MECANISMO, no método: que una
--   sentadilla búlgara sea una zancada unilateral no es criterio de escuela, es
--   biomecánica, igual que `modality` (0053). Por eso va con CHECK cerrado y no
--   como dato del coach (HARD RULE Nº0: la pregunta es «¿otro entrenador competente
--   lo haría distinto?», y aquí la respuesta es no).
--
-- · `is_unilateral` e `implement_count` — no son adorno de ficha: CAMBIAN LA DOSIS.
--   Un ejercicio unilateral se prescribe por lado, y un farmers carry son 2×32 kg,
--   no 32. Hoy el `Target` de la prescripción ya sabe contar implementos
--   (`implement_count`), pero el EJERCICIO no declara que viene en par, así que
--   quien escribe la dosis tiene que acordarse. Eso es un dato del movimiento.
--
-- · `archived_at` — retirar sin borrar. Hoy solo se puede BORRAR, y solo lo que
--   nadie ha usado nunca (`delete-exercise.ts`, con razón: `segment_executions`
--   tiene ON DELETE SET NULL y un borrado silencioso desnuda el trabajo que un
--   atleta ya hizo). Al crecer el catálogo hace falta la tercera vía: sacarlo de
--   los selectores dejando intacto el histórico.
--
-- · `exercise_aliases` — el vocabulario BASE como DATO. Una fila por término, con
--   su idioma. Es lo que hace que el mismo conocimiento sirva al buscador Y al
--   importador, en vez de tenerlo en un mapa de TypeScript que solo lee uno.
--
--   DOS CAPAS, NO UNA, y con precedencia clara: `coach_exercise_synonyms` (por
--   coach, aprendida de sus correcciones) MANDA sobre `exercise_aliases` (nuestra,
--   base). Al revés sería quitarle al coach lo que ya le enseñamos a la app.
--
--   UN TÉRMINO PUEDE SER AMBIGUO, y eso es DATO, no error: «row» es el ergómetro y
--   también el remo con barra. Por eso la unicidad es por (ejercicio, término) y no
--   global — al contrario que el mapa de TS, que al ser `Record<term, slug>` hacía
--   IMPOSIBLE expresar la ambigüedad y se comía una de las dos. Cuando un término
--   resuelve a varios, el resolutor desempata por la modalidad del bloque y, si aún
--   así no cierra, es un fallo honesto que va al coach — y su elección se aprende
--   como sinónimo suyo y no vuelve a preguntar.
--
-- · pg_trgm + un normalizador INMUTABLE — para que «sentadila» (sin la t) y
--   «GLÚTEO» encuentren lo suyo. `unaccent(text)` a secas es STABLE y no se puede
--   indexar; con el diccionario explícito sí, y es el único motivo de la función.
--
-- SEGURIDAD
-- ---------
-- Todo es aditivo: ni una columna se cae, ni un tipo se estrecha. `name_en` se
-- rellena con el `name` de hoy (es lo que hay: 96% inglés) y el CHECK de «al menos
-- un idioma» se añade DESPUÉS del relleno, no antes. La traducción curada al
-- castellano, los patrones y los alias son contenido y viajan en su propio paso,
-- revisables uno a uno.

create extension if not exists pg_trgm;

-- El normalizador de términos, en SQL y CONSTANTE para poder indexarlo.
-- Mismo contrato que el `normalize` del resolutor en TS: minúsculas, sin acentos,
-- espacios colapsados. Si un día divergen, el índice miente — por eso vive aquí
-- solo, con un nombre que se puede grepear.
create or replace function fahybrid_normalize_term(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  -- Función Y diccionario van CUALIFICADOS a propósito. Sin esquema, ambos se
  -- resuelven por el `search_path` de quien ejecuta, que no es el mismo en una
  -- sesión de psql que en el runner de migraciones ni en una rama de test: los dos
  -- primeros intentos de esta migración murieron justo ahí, uno por el diccionario
  -- y otro por la función. Un índice no puede depender de eso.
  select btrim(regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, input)), '\s+', ' ', 'g'))
$$;

-- ── exercises: los dos idiomas y los ejes que faltaban ──────────────────────
alter table exercises
  add column if not exists name_es text,
  add column if not exists name_en text,
  add column if not exists movement_pattern text,
  add column if not exists is_unilateral boolean not null default false,
  add column if not exists implement_count integer,
  add column if not exists archived_at timestamp with time zone;

-- Lo que hay hoy es el nombre inglés (121 de 126). La traducción curada va aparte.
update exercises set name_en = name where name_en is null;

alter table exercises
  drop constraint if exists exercises_name_lang_chk,
  add constraint exercises_name_lang_chk
    check (name_es is not null or name_en is not null);

alter table exercises
  drop constraint if exists exercises_movement_pattern_chk,
  add constraint exercises_movement_pattern_chk
    check (movement_pattern is null or movement_pattern = any (array[
      'squat', 'hinge',
      'horizontal_push', 'vertical_push',
      'horizontal_pull', 'vertical_pull',
      'lunge', 'carry',
      'rotation', 'anti_rotation',
      'locomotion', 'jump', 'olympic',
      'hold', 'other'
    ]));

alter table exercises
  drop constraint if exists exercises_implement_count_chk,
  add constraint exercises_implement_count_chk
    check (implement_count is null or (implement_count >= 1 and implement_count <= 4));

create index if not exists exercises_movement_pattern_idx
  on exercises (movement_pattern) where movement_pattern is not null;

create index if not exists exercises_archived_idx
  on exercises (archived_at) where archived_at is not null;

create index if not exists exercises_name_es_trgm_idx
  on exercises using gin (fahybrid_normalize_term(name_es) gin_trgm_ops);

create index if not exists exercises_name_en_trgm_idx
  on exercises using gin (fahybrid_normalize_term(name_en) gin_trgm_ops);

-- ── el fork del coach también habla dos idiomas ─────────────────────────────
-- Un coach forkea su VOZ (0132): cómo llama él al movimiento. Si el catálogo tiene
-- dos idiomas, su voz también — puede rellenar uno o los dos, y lo que no diga cae
-- al nombre base del idioma de quien mira.
alter table coach_exercise_overrides
  add column if not exists name_es text,
  add column if not exists name_en text;

-- ── el vocabulario base, como dato ──────────────────────────────────────────
create table if not exists exercise_aliases (
  id                     bigint primary key generated always as identity,
  exercise_id            bigint not null references exercises(id) on delete cascade,
  term                   text not null,
  term_normalized        text not null,
  lang                   text,
  source                 text not null default 'system',
  created_at             timestamp with time zone not null default now(),
  updated_at             timestamp with time zone not null default now(),
  constraint exercise_aliases_lang_chk check (lang is null or lang = any (array['es', 'en'])),
  constraint exercise_aliases_term_chk check (btrim(term) <> '')
);

-- Por (ejercicio, término): el mismo término SÍ puede apuntar a varios ejercicios
-- —«row» es el ergo y el remo con barra— y esa ambigüedad la resuelve el resolutor
-- con la modalidad del bloque, no la base de datos escondiendo una de las dos.
create unique index if not exists exercise_aliases_unique
  on exercise_aliases (exercise_id, term_normalized);

create index if not exists exercise_aliases_term_idx
  on exercise_aliases (term_normalized);

create index if not exists exercise_aliases_trgm_idx
  on exercise_aliases using gin (term_normalized gin_trgm_ops);

drop trigger if exists exercise_aliases_set_updated_at on exercise_aliases;
create trigger exercise_aliases_set_updated_at
  before update on exercise_aliases
  for each row execute function set_updated_at();

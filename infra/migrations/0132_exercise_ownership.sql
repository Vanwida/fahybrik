-- 0132_exercise_ownership.sql
--
-- PROPIEDAD del catalogo de ejercicios + ampliacion del FORK al nombre.
--
-- EL MODELO (aprobado por Alex)
-- -----------------------------
-- "Los ejercicios tienen que estar en todas las cuentas de coach, eso forma parte
-- de lo que ofrecemos. Si un ejercicio es modificado, se forkea -- por ejemplo si
-- le pone un video, o si le cambia la descripcion o el nombre. Una base de
-- ejercicios para que los coaches puedan escoger, y un fork para los que se
-- modifiquen y los tengan personalizados."
--
-- Se traduce en TRES origenes, y solo tres:
--   * BASE           -> exercises.coach_id IS NULL. Nuestro producto. Todo coach lo ve.
--   * PERSONALIZADO  -> un BASE + la fila de coach_exercise_overrides de ESE coach.
--   * PROPIO         -> exercises.coach_id = <coach>. Lo creo el coach. Solo el lo ve.
--
-- QUE SE FORKEA Y QUE NO (la linea, y por que)
-- --------------------------------------------
-- Se forkea lo que el coach AUTORA (su voz): name / cues / description / video_url.
-- NO se forkea lo que el movimiento ES (su identidad): slug / modality / category /
-- primary_muscle_groups / equipment / default_metrics_json / hyrox_station_position.
--
-- El motivo es MECANICO, no estetico. El override vive en el MISMO id, asi que
-- aplica retroactivamente a todo lo que ya apunta ahi (template_segments,
-- block_exercises): si el coach renombra "Wall Balls", sus sesiones YA creadas
-- muestran el nombre nuevo. Un fork por copia de fila (id nuevo) NO seria
-- retroactivo -- sus plantillas seguirian apuntando al id base.
-- Y por lo mismo la identidad NO puede forkearse por override: cambiar category o
-- modality reinterpretaria el historico (las analiticas rutean por modality). El
-- escape hatch correcto para "necesito otro movimiento" es un id NUEVO, es decir
-- un ejercicio PROPIO, que aplica hacia delante y no reescribe el pasado.
--
-- SLUG SIGUE SIENDO UNICO GLOBAL (decision deliberada -- NO se toca)
-- ------------------------------------------------------------------
-- Tentacion descartada: unique parcial por (slug) where coach_id is null + unique
-- (coach_id, slug). Se descarta porque `slug` es el CONTRATO MAQUINA del catalogo
-- BASE: lo resuelven con `limit 1` y SIN desempate station-detail (video de
-- tecnica), calibration-content (tests), create-free-workout, intake y el
-- importador. Un namespace por coach volveria ambiguos esos 5-6 lectores A LA VEZ
-- y obligaria a repetir un desempate en cada uno -- y en cada lector futuro.
-- Con slug unico global la colision es IMPOSIBLE en vez de "superviviente": el
-- ejercicio propio de un coach recibe `sled-push-2` (invisible -- nadie resuelve
-- ejercicios de coach por slug, el importador los caza por NOMBRE en su capa 3).
--
-- ADITIVA Y SEGURA
-- ----------------
-- coach_id nace NULL en las 79 filas existentes => TODAS quedan BASE, que es
-- exactamente lo que queremos (no se migra ningun ejercicio a ningun coach).
-- Ningun lector actual filtra por coach_id, asi que el estado post-migracion es
-- identico al de hoy hasta que el codigo empieza a filtrar. Idempotente
-- (`if not exists`). El runner envuelve el fichero en UNA transaccion (sin
-- begin/commit aqui). Ningun comentario lleva punto y coma.

-- ── Propiedad ────────────────────────────────────────────────────────────────
-- NULL = BASE (nuestro catalogo, global). NOT NULL = del coach (privado suyo).
-- ON DELETE RESTRICT: un coach con ejercicios propios referenciados por
-- template_segments / block_exercises (ambos RESTRICT) no puede desaparecer
-- dejando huerfanos -- borrar sus ejercicios es una decision explicita, nunca un
-- efecto colateral. Coherente con las FKs que ya cuelgan de exercises.
alter table exercises
  add column if not exists coach_id bigint references coaches(id) on delete restrict;

-- El predicado de visibilidad es SIEMPRE `coach_id is null or coach_id = <coach>`.
-- Indexamos solo las filas de coach (las BASE son la inmensa mayoria y se
-- resuelven por el `is null`, que este indice parcial mantiene fuera).
create index if not exists exercises_coach_idx
  on exercises (coach_id) where coach_id is not null;

comment on column exercises.coach_id is
  'Propiedad del ejercicio. NULL = catalogo BASE (nuestro producto, visible para TODO coach). NOT NULL = ejercicio PROPIO de ese coach, invisible para los demas. Todo lector que ENUMERA o RESUELVE (name/slug/id -> ejercicio) filtra por (coach_id is null or coach_id = <coach>). Los joins de hidratacion por FK NO filtran: el id ya viene de una fila scopeada y anadir el predicado haria desaparecer trabajo ya asignado.';

-- ── El fork alcanza al NOMBRE ────────────────────────────────────────────────
-- name se une a cues/description/video_url como campo forkeable: es la ETIQUETA
-- que el coach usa, no lo que el movimiento es. NULL = hereda el nombre BASE,
-- igual que los otros tres (la precedencia la decide el coalesce del lado read,
-- fuente unica en lib/exercises/coach-override.ts).
--
-- Importante: renombrar via override NO recalcula `modality`. La derivacion
-- (migracion 0053) lee exercises.name, y la fila BASE no se toca -- asi que el
-- movimiento sigue siendo el mismo movimiento aunque el coach lo llame de otra
-- forma. Es justo la propiedad que queremos: la voz cambia, la identidad no.
alter table coach_exercise_overrides
  add column if not exists name text;

comment on column coach_exercise_overrides.name is
  'Override del NOMBRE con el que ESTE coach llama al ejercicio BASE (exercises.name). NULL = hereda el nombre base. Aplica retroactivamente a todo lo que referencia ese exercise_id (plantillas y sesiones ya creadas). No afecta a slug ni a modality: la identidad del movimiento es compartida e inmutable.';

comment on table coach_exercise_overrides is
  'Fork por coach del catalogo BASE: los CUATRO campos que el coach autora (name/cues/description/video_url), cada uno independientemente nullable (NULL = hereda el base). El atleta ve coalesce(override, base) por campo. La identidad del movimiento (slug/modality/category/muscles/equipment/default_metrics/hyrox_station_position) NO es per-coach y vive solo en exercises. Un ejercicio PROPIO (exercises.coach_id not null) NO usa esta tabla: se edita directo.';

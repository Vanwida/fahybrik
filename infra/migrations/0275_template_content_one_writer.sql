-- 0275_template_content_one_writer.sql
--
-- UN SOLO ESCRITOR DE PLANTILLAS (docs/DECISIONS.md, 2026-09-28): el entreno libre
-- del atleta y el que programa el coach se guardan con las MISMAS reglas
-- (web/lib/templates/template-content.ts). Esta migración deja las filas que ya
-- existen como las escribiría hoy ese escritor, SOLO donde el dato no deja duda.
-- Tres partes, todas idempotentes (cada una se guarda con la condición que su
-- propio cambio deja de cumplir).
--
-- A · FORMATO DEL BLOQUE QUE CONTRADICE SU PRESCRIPCIÓN. Un bloque de componentes
--     (for_time, amrap, emom, tabata, death_by, chipper, ladder, rounds,
--     intervals) cuyas líneas dicen TODAS otro formato del selector, y solo con
--     los campos que ese formato admite, pasa a ese formato: es la huella del
--     selector «Formato» que cambiaba las líneas y no el bloque (un AMRAP se
--     guardaba for_time y el móvil lo puntuaba por tiempo). Líneas mezcladas, una
--     línea sin prescripción o un campo que el formato no admite = no se toca.
--     Tampoco se toca una plantilla con un entreno ya hecho: ese entreno se
--     registró con el formato viejo y cambiárselo reescribiría su lectura.
--     Un block_format NULL no contradice nada: se deja (son los tests de
--     calibración, escritos así a propósito).
--
-- B · CIRCUITOS CON LAS RONDAS COPIADAS EN CADA ESTACIÓN. Un bloque `circuit` sin
--     fila en template_blocks cuyas estaciones llevan TODAS la misma `rounds`, la
--     misma `work_s` (o ninguna) y el mismo `rest_s` (o ninguno, y si lo hay son
--     líneas `rounds`, donde rest_s es el descanso entre rondas), y todas con su
--     dosis en series: se crea su fila (pacing por_reloj si hay ventana, por_tarea
--     si no — lo que el motor en vivo ya hacía con ese dato, no un defecto
--     inventado) y las estaciones dejan de repetir lo que es del bloque. Una
--     estación sin rondas junto a otra con ellas (el caso roto de 2026-08-07) no
--     es inequívoca y se deja. Mismo respeto por lo ya hecho que en A.
--     Esto supera, solo para lo inequívoco, el «sin backfill» de 0159: allí el
--     pacing no estaba escrito en ningún sitio, y aquí la presencia o ausencia de
--     ventana en TODAS las estaciones es justo lo que lo dice.
--     De paso, una clave que el modelo no conoce (`rest_between_rounds_s`) que
--     repite el descanso que ya guarda el bloque se retira: con ella la
--     prescripción entera no valida (2 líneas en la copia de main).
--
-- C · ENTRENOS LIBRES. El escritor del libre usaba position 1..N y
--     block_position 1/2, guardaba el calentamiento con el formato del entreno
--     (`sets`) y el continuo como `steady`. Se renumeran posiciones desde 0 (los
--     tramos ejecutados se enlazan por id de segmento, no por posición: ningún
--     enlace cambia), el calentamiento pasa a bloque `warmup` con sus líneas en
--     `warmup`, y el bloque principal toma el vocabulario del editor (continuo →
--     `tempo`, una fuerza de un ejercicio → `strength_block`). Es la misma sesión
--     dicha como la dice el coach: se aplica también a los libres ya hechos.
--     `params_json` y la forma canónica de la prescripción NO se derivan aquí:
--     viven en TypeScript (prescriptionToParams) y duplicarlas en SQL sería una
--     segunda fuente de verdad. Lo hace el script
--     infra/scripts/backfill_template_content.ts, que se corre después.
--
-- Medido contra una copia de main del 2026-09-28 (rama desechable): A = 14
-- bloques / 31 líneas (10 for_time→rounds, 3 intervals→rounds, 1
-- for_time→intervals), B = 8 circuitos / 19 estaciones, C = 79 plantillas
-- libres. El informe completo está en la entrada de DECISIONS.
--
-- El runner envuelve el fichero en UNA transacción (sin begin/commit aquí).
-- Ningún comentario lleva punto y coma.

-- ── Tablas de trabajo (se borran al confirmar) ─────────────────────────────

create temporary table _0275_executed on commit drop as
  select distinct wa.template_id
  from workout_assignments wa
  join workout_executions we on we.assignment_id = wa.id
  where wa.template_id is not null;

create temporary table _0275_format_params (fmt text primary key, allowed text[] not null) on commit drop;
insert into _0275_format_params (fmt, allowed) values
  ('for_time',  array['rounds', 'total_s']),
  ('amrap',     array['total_s']),
  ('emom',      array['rounds', 'work_s', 'rest_s']),
  ('tabata',    array['work_s', 'rest_s', 'rounds']),
  ('death_by',  array['work_s', 'start', 'increment']),
  ('intervals', array['rounds', 'work_s', 'rest_s']),
  ('chipper',   array['total_s']),
  ('ladder',    array['total_s']),
  ('rounds',    array['rounds', 'rest_s']);

-- ── A · formato del bloque ─────────────────────────────────────────────────

with seg as (
  select s.template_id, s.block_position, s.block_format,
         case when jsonb_typeof(s.prescription_json) = 'object' then s.prescription_json end as p,
         case s.prescription_json->>'scheme' when 'interval' then 'intervals'
              else s.prescription_json->>'scheme' end as scheme
  from template_segments s
), blk as (
  select template_id, block_position,
         count(*) filter (where block_format is null) as nbf_null,
         count(distinct block_format) as nbf,
         min(block_format) as bf,
         count(*) filter (where p is null) as nnull,
         count(distinct scheme) as nsch,
         min(scheme) as sch
  from seg
  group by template_id, block_position
), target as (
  select b.template_id, b.block_position, b.sch
  from blk b
  where b.nbf_null = 0 and b.nbf = 1 and b.nnull = 0 and b.nsch = 1
    and b.bf in (select fmt from _0275_format_params)
    and b.sch in (select fmt from _0275_format_params)
    and b.sch <> b.bf
    and b.template_id not in (select template_id from _0275_executed)
    and not exists (
      select 1
      from seg s
      cross join lateral jsonb_object_keys(s.p) as k
      where s.template_id = b.template_id
        and s.block_position = b.block_position
        and k in ('rounds', 'work_s', 'rest_s', 'total_s', 'start', 'increment')
        and not (k = any ((select allowed from _0275_format_params where fmt = b.sch)::text[]))
    )
)
update template_segments s
set block_format = t.sch, updated_at = now()
from target t
where s.template_id = t.template_id and s.block_position = t.block_position;

-- ── B · circuitos: la config al bloque ─────────────────────────────────────

with seg as (
  select s.template_id, s.block_position, s.block_format,
         case when jsonb_typeof(s.prescription_json) = 'object' then s.prescription_json end as p
  from template_segments s
), blk as (
  select template_id, block_position,
         bool_and(block_format = 'circuit') as all_circuit,
         count(*) as n,
         count(*) filter (where p is null) as nnull,
         count(p->'rounds') as with_rounds, count(distinct p->'rounds') as n_rounds,
         count(p->'work_s') as with_work, count(distinct p->'work_s') as n_work,
         count(p->'rest_s') as with_rest, count(distinct p->'rest_s') as n_rest,
         bool_and(p->>'scheme' = 'rounds') as all_rounds_scheme,
         bool_and(
           jsonb_typeof(p->'sets') = 'array'
           and exists (
             select 1 from jsonb_array_elements(p->'sets') as e
             where e ? 'measure' or e ? 'reps' or e ? 'duration_s' or e ? 'distance_m'
           )
         ) as all_dosed,
         min((p->>'rounds')::numeric) as rounds,
         min((p->>'work_s')::numeric) as work_s,
         min((p->>'rest_s')::numeric) as rest_s
  from seg
  group by template_id, block_position
), target as (
  select b.*
  from blk b
  where b.all_circuit and b.nnull = 0
    and b.with_rounds = b.n and b.n_rounds = 1
    and (b.with_work = 0 or (b.with_work = b.n and b.n_work = 1))
    and (b.with_rest = 0 or (b.with_rest = b.n and b.n_rest = 1 and b.all_rounds_scheme))
    and b.all_dosed
    and b.rounds between 1 and 60 and b.rounds = trunc(b.rounds)
    and (b.work_s is null or (b.work_s > 0 and b.work_s = trunc(b.work_s)))
    and (b.rest_s is null or (b.rest_s >= 0 and b.rest_s = trunc(b.rest_s)))
    and b.template_id not in (select template_id from _0275_executed)
    and not exists (
      select 1 from template_blocks tb
      where tb.template_id = b.template_id and tb.block_position = b.block_position
    )
)
insert into template_blocks (
  template_id, block_position, rounds, pacing, work_seconds,
  rest_between_stations_seconds, rest_between_rounds_seconds
)
select template_id, block_position, rounds::int,
       case when work_s is null then 'por_tarea' else 'por_reloj' end,
       work_s::int, null, rest_s::int
from target;

-- Las estaciones dejan de repetir lo que ya dice su bloque (solo si coincide).
update template_segments s
set prescription_json = s.prescription_json - 'rounds' - 'rounds_max' - 'work_s' - 'rest_s',
    updated_at = now()
from template_blocks tb
where tb.template_id = s.template_id
  and tb.block_position = s.block_position
  and s.block_format = 'circuit'
  and jsonb_typeof(s.prescription_json) = 'object'
  and (s.prescription_json ? 'rounds' or s.prescription_json ? 'work_s' or s.prescription_json ? 'rest_s')
  and (s.prescription_json->>'rounds' is null or (s.prescription_json->>'rounds')::numeric = tb.rounds)
  and (s.prescription_json->>'work_s' is null or (s.prescription_json->>'work_s')::numeric = tb.work_seconds)
  and (s.prescription_json->>'rest_s' is null
       or (s.prescription_json->>'rest_s')::numeric = tb.rest_between_rounds_seconds)
  and s.template_id not in (select template_id from _0275_executed);

-- Una clave que el modelo no conoce (`rest_between_rounds_s`) dentro de la
-- prescripción de una estación hace que su prescripción entera no se pueda leer
-- (el editor la abre degradada). Si repite el descanso entre rondas que ya
-- guarda su bloque, es una copia y sobra.
update template_segments s
set prescription_json = s.prescription_json - 'rest_between_rounds_s', updated_at = now()
from template_blocks tb
where tb.template_id = s.template_id
  and tb.block_position = s.block_position
  and jsonb_typeof(s.prescription_json) = 'object'
  and s.prescription_json ? 'rest_between_rounds_s'
  and (s.prescription_json->>'rest_between_rounds_s')::numeric = tb.rest_between_rounds_seconds;

-- ── C · entrenos libres ────────────────────────────────────────────────────

-- C1 · posiciones desde 0, contiguas, en el orden de siempre.
create temporary table _0275_free_pos on commit drop as
  select s.id,
         (dense_rank() over (partition by s.template_id order by s.block_position) - 1)::int as bp,
         (row_number() over (partition by s.template_id order by s.block_position, s.position, s.id) - 1)::int as pos
  from template_segments s
  join templates t on t.id = s.template_id
  where jsonb_typeof(t.meta_json) = 'object' and t.meta_json->>'origin' = 'self';

delete from _0275_free_pos f
using template_segments s
where s.id = f.id and s.block_position = f.bp and s.position = f.pos;

-- Primero fuera del camino (la unicidad template_id+position se comprueba fila a
-- fila), luego a su sitio.
update template_segments s
set position = s.position + 1000000
from _0275_free_pos f
where s.id = f.id;

update template_segments s
set position = f.pos, block_position = f.bp, updated_at = now()
from _0275_free_pos f
where s.id = f.id;

-- C2 · el calentamiento es un bloque `warmup`, y sus líneas llevan su formato.
update template_segments s
set block_format = 'warmup',
    prescription_json = case
      when jsonb_typeof(s.prescription_json) = 'object'
        then jsonb_set(s.prescription_json, '{scheme}', '"warmup"')
      else s.prescription_json
    end,
    updated_at = now()
from templates t
where t.id = s.template_id
  and jsonb_typeof(t.meta_json) = 'object' and t.meta_json->>'origin' = 'self'
  and s.block_position = 0
  and s.block_title = 'Calentamiento'
  and exists (
    select 1 from template_segments o
    where o.template_id = s.template_id and o.block_position > 0
  )
  and (s.block_format is distinct from 'warmup' or s.prescription_json->>'scheme' is distinct from 'warmup');

-- C3 · el bloque principal con el vocabulario del editor del coach.
with blk as (
  select s.template_id, s.block_position, count(*) as n,
         bool_and(s.block_format = 'steady' and s.prescription_json->>'scheme' = 'steady') as all_steady,
         bool_and(s.block_format = 'sets' and s.prescription_json->>'scheme' = 'sets') as all_sets
  from template_segments s
  join templates t on t.id = s.template_id
  where jsonb_typeof(t.meta_json) = 'object' and t.meta_json->>'origin' = 'self'
  group by s.template_id, s.block_position
)
update template_segments s
set block_format = case when b.all_steady then 'tempo' else 'strength_block' end,
    updated_at = now()
from blk b
where s.template_id = b.template_id
  and s.block_position = b.block_position
  and (b.all_steady or (b.all_sets and b.n = 1));

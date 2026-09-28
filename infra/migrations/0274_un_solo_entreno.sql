-- 0274 — Un entreno libre y uno del coach son EL MISMO objeto y se guardan igual.
--
-- DECISIONS 2026-09-28 «Un solo entreno». Lo que se arregla en el código:
--   · ejecutar una asignación que ya existe (del coach o propia, `origin = 'self'`)
--     va SIEMPRE por la sincronización del coach, con los `template_segment_id`
--     reales; POST /free ya no duplica un plan guardado;
--   · POST /free (el libre hecho sin plan previo) enlaza cada tramo al segmento
--     recién creado, en la misma transacción;
--   · el guardado de la app sustituye su copia plana de Apple Salud en todos los
--     caminos (por `source_workout_ref` y por solape);
--   · la modalidad de un tramo sale de su ejercicio (0053); cinta = correr;
--   · la ingesta solo enlaza segmentos de la plantilla de la asignación de la
--     ejecución.
--
-- Esta migración trae la llave de idempotencia del libre y arregla lo ya guardado
-- con las MISMAS reglas que el código (`web/lib/sync/link-tramos.ts`,
-- `segment-derivations.ts` › `tramoModality`, `replace-health-import.ts`). Orden:
--   (1) llave: `workout_assignments.free_started_at` + índice único;
--   (e) planes propios ejecutados como copia, con evidencia → la ejecución vuelve a
--       su plan y la copia se borra;
--   (b) tramos enlazados a un segmento de OTRA plantilla → sin enlace;
--   (a) tramos de entrenos propios sin enlace → a su segmento, por orden;
--   (c) modalidad de cada tramo con la regla del código;
--   (d) copias planas de Apple Salud del mismo entreno → fuera;
--   (f) la llave rellenada para los libres ya guardados.
-- Idempotente: cada paso solo toca lo que aún no cumple su regla. Las posiciones
-- de plantilla se leen solo como ORDEN (0275 las renumera después; los enlaces
-- quedan por id).

-- ── (1) La llave de idempotencia del libre ───────────────────────────────────
-- El instante de inicio del entreno libre que vive en esta asignación propia. Un
-- reenvío de POST /free con ese inicio graba sobre ella en vez de crear otra.
alter table workout_assignments add column if not exists free_started_at timestamptz;

alter table workout_assignments drop constraint if exists workout_assignments_free_started_self_chk;
alter table workout_assignments
  add constraint workout_assignments_free_started_self_chk
  check (free_started_at is null or origin = 'self');

create unique index if not exists workout_assignments_free_started_uq
  on workout_assignments (athlete_id, free_started_at)
  where free_started_at is not null;

comment on column workout_assignments.free_started_at is
  'Inicio (sellado por el motor) del entreno libre grabado en esta asignación propia; llave de idempotencia de POST /api/athlete/workouts/free (0274).';

-- ── (e) Un plan propio ejecutado como copia vuelve a ser UNO ─────────────────
-- La app ejecutaba un plan libre guardado mandándolo a POST /free, que creaba
-- otra plantilla + asignación + ejecución y dejaba el plan «pendiente». Solo se
-- funde lo INEQUÍVOCO: un tramo de la ejecución de la copia quedó enlazado a un
-- segmento de la plantilla del plan (el cliente corría ESE plan), el plan es del
-- mismo atleta, propio, pendiente y sin ejecución, su plantilla no la usa otra
-- asignación, la ejecución apunta a un solo plan y el plan lo reclama una sola
-- ejecución. Parecerse en título o contenido NO basta.
create temp table fuse_0274 on commit drop as
with evidence as (
  select distinct
    we.id as execution_id,
    c.id as copy_id,
    c.template_id as copy_template_id,
    c.status as copy_status,
    p.id as plan_id,
    p.template_id as plan_template_id
  from workout_executions we
  join workout_assignments c on c.id = we.assignment_id and c.origin = 'self'
  join segment_executions se on se.execution_id = we.id
  join template_segments ts on ts.id = se.template_segment_id and ts.template_id <> c.template_id
  join workout_assignments p
    on p.template_id = ts.template_id
   and p.athlete_id = c.athlete_id
   and p.origin = 'self'
   and p.status = 'scheduled'
  where not exists (select 1 from workout_executions x where x.assignment_id = p.id)
)
select e.*
from evidence e
where (select count(*) from evidence e2 where e2.execution_id = e.execution_id) = 1
  and (select count(*) from evidence e3 where e3.plan_id = e.plan_id) = 1
  and (select count(*) from workout_assignments a where a.template_id = e.plan_template_id) = 1
  and not exists (
    select 1
    from segment_executions se2
    join template_segments ts2 on ts2.id = se2.template_segment_id
    where se2.execution_id = e.execution_id
      and ts2.template_id not in (e.copy_template_id, e.plan_template_id)
  );

-- Lo que colgaba de la copia pasa al plan (nada se pierde con el borrado).
update athlete_benchmarks t set assignment_id = f.plan_id from fuse_0274 f where t.assignment_id = f.copy_id;
update athlete_strength_maxes t set assignment_id = f.plan_id from fuse_0274 f where t.assignment_id = f.copy_id;
update jump_attempts t set assignment_id = f.plan_id from fuse_0274 f where t.assignment_id = f.copy_id;
update coach_mass_adjustment_targets t set assignment_id = f.plan_id from fuse_0274 f where t.assignment_id = f.copy_id;
update coach_communication_items t set test_assignment_id = f.plan_id from fuse_0274 f where t.test_assignment_id = f.copy_id;
update wearable_activity_confirmations t set assignment_id = f.plan_id from fuse_0274 f where t.assignment_id = f.copy_id;
update dobles_live_status t set assignment_id = f.plan_id from fuse_0274 f where t.assignment_id = f.copy_id;

update workout_executions we
set assignment_id = f.plan_id, updated_at = now()
from fuse_0274 f
where we.id = f.execution_id;

update workout_assignments p
set status = f.copy_status, updated_at = now()
from fuse_0274 f
where p.id = f.plan_id;

delete from workout_assignments a using fuse_0274 f where a.id = f.copy_id;

-- La plantilla de la copia ya no es de nadie: fuera (sus segmentos caen con ella; un
-- tramo que la apuntara se queda sin enlace y lo reenlaza el paso (a)).
delete from templates t
using fuse_0274 f
where t.id = f.copy_template_id
  and not exists (select 1 from workout_assignments a where a.template_id = t.id)
  and not exists (select 1 from coach_assign_batch_session_changes b where b.template_id = t.id);

-- ── (b) Un tramo solo cuelga de la plantilla de SU asignación ─────────────────
-- Lo que copió de un segmento ajeno (ejercicio, prescripción) no es de este entreno.
update segment_executions se
set template_segment_id = null,
    exercise_id = null,
    prescription_snapshot = null,
    context_source = 'session',
    updated_at = now()
from workout_executions we, workout_assignments wa, template_segments ts
where we.id = se.execution_id
  and wa.id = we.assignment_id
  and ts.id = se.template_segment_id
  and ts.template_id <> wa.template_id;

-- ── (a) Los tramos de los entrenos propios, a su segmento ─────────────────────
-- La regla de `link-tramos.ts` para un cliente que no dice de qué ítem es cada
-- tramo (la app de hoy):
--   1. plantilla de UN segmento → todos sus tramos;
--   2. un tramo que no es una serie (sin atribución de tramo) lleva en `position`
--      el orden 1-based de su ítem, si la modalidad no lo contradice (`other` es el
--      bloque plegado y casa con cualquiera; una cinta es correr);
--   3. una serie → el ÚNICO segmento de su modalidad;
--   si nada es inequívoco, sin enlazar.
create temp table items_0274 on commit drop as
select
  ts.template_id,
  ts.id as ts_id,
  (row_number() over (partition by ts.template_id order by ts.position, ts.id)) - 1 as idx,
  count(*) over (partition by ts.template_id) as n,
  case when e.modality in ('run', 'row', 'ski', 'bike', 'strength') then e.modality else 'other' end as seg_mod
from template_segments ts
join exercises e on e.id = ts.exercise_id
where ts.template_id in (select wa.template_id from workout_assignments wa where wa.origin = 'self');

create temp table link_0274 on commit drop as
select se.id as se_id,
  coalesce(
    (select i.ts_id from items_0274 i where i.template_id = wa.template_id and i.n = 1),
    case
      when se.leg_index is null then (
        select i.ts_id from items_0274 i
        where i.template_id = wa.template_id
          and i.idx = se.position - 1
          and (w.mod = 'other' or w.mod = i.seg_mod)
      )
      else (
        select min(i.ts_id) from items_0274 i
        where i.template_id = wa.template_id and i.seg_mod = w.mod
        having count(*) = 1
      )
    end
  ) as ts_id
from segment_executions se
join workout_executions we on we.id = se.execution_id
join workout_assignments wa on wa.id = we.assignment_id and wa.origin = 'self'
cross join lateral (
  select case
    when lower(trim(coalesce(se.source, ''))) = 'treadmill' then 'run'
    else coalesce(se.modality, 'other')
  end as mod
) w
where se.template_segment_id is null;

-- Lo que el tramo toma de su segmento, igual que la ingesta: ejercicio,
-- prescripción de ese momento y formato del bloque (normalizado con el catálogo
-- de `shared/domain/prescription/format.ts`, alias viejos incluidos).
update segment_executions se
set template_segment_id = l.ts_id,
    exercise_id = ts.exercise_id,
    prescription_snapshot = ts.prescription_json,
    context_source = 'block',
    context_format = coalesce(
      case
        when coalesce(ts.block_format, ts.prescription_json->>'scheme') in (
          'for_time', 'amrap', 'emom', 'tabata', 'death_by', 'intervals', 'steady', 'chipper',
          'ladder', 'rounds', 'hyrox_sim', 'sets', 'superset', 'warmup', 'cooldown'
        ) then coalesce(ts.block_format, ts.prescription_json->>'scheme')
        else case coalesce(ts.block_format, ts.prescription_json->>'scheme')
          when 'strength_block' then 'sets'
          when 'tempo' then 'steady'
          when 'circuit' then 'rounds'
          when 'test' then 'for_time'
          when 'interval' then 'intervals'
          when 'simulation' then 'hyrox_sim'
          when 'superserie' then 'superset'
        end
      end,
      se.context_format
    ),
    updated_at = now()
from link_0274 l
join template_segments ts on ts.id = l.ts_id
where se.id = l.se_id
  and l.ts_id is not null;

-- ── (c) La modalidad de cada tramo, con la regla del código ──────────────────
-- Cinta = correr; enlazado → la de su ejercicio si su bloque es de una sola
-- modalidad; en un bloque mixto, `other` (el bloque plegado) se queda y lo demás
-- toma la del ejercicio; sin enlace, lo que ya tenía.
update segment_executions se
set modality = r.mod, updated_at = now()
from (
  select s.id,
    case
      when lower(trim(coalesce(s.source, ''))) = 'treadmill' then 'run'
      when ts.id is null then s.modality
      when bm.n_mods = 1 then bm.ex_mod
      when coalesce(s.modality, 'other') = 'other' then 'other'
      else bm.ex_mod
    end as mod
  from segment_executions s
  left join template_segments ts on ts.id = s.template_segment_id
  left join lateral (
    select
      (select case when e.modality in ('run', 'row', 'ski', 'bike', 'strength') then e.modality else 'other' end
         from exercises e where e.id = ts.exercise_id) as ex_mod,
      (select count(distinct case when e2.modality in ('run', 'row', 'ski', 'bike', 'strength') then e2.modality else 'other' end)
         from template_segments ts2
         join exercises e2 on e2.id = ts2.exercise_id
         where ts2.template_id = ts.template_id
           and ts2.block_position is not distinct from ts.block_position) as n_mods
  ) bm on ts.id is not null
) r
where r.id = se.id
  and r.mod is distinct from se.modality;

-- ── (d) La copia plana de Apple Salud del mismo entreno, fuera ───────────────
-- La regla de `replace-health-import.ts`: una importación plana de Salud (sin
-- asignación, sin «fuera del plan», healthkit + imported) cede ante lo que guardó
-- la app del mismo atleta (lo que no es una importación) si lleva el mismo
-- `source_workout_ref` o se solapa en el tiempo con ello. En el código el solape
-- solo cuenta si el guardado trae su hora de inicio; aquí, que su ventana sea
-- real (fin > inicio): un «Marcar como hecha» guardaba inicio = fin = la hora de
-- marcar, y eso no es un entreno con el que solaparse.
delete from workout_executions imp
where imp.assignment_id is null
  and imp.off_plan_reason is null
  and imp.source = 'healthkit'
  and imp.recorded_via = 'imported'
  and exists (
    select 1
    from workout_executions w
    where w.athlete_id = imp.athlete_id
      and w.id <> imp.id
      and w.recorded_via is distinct from 'imported'
      and (
        (w.source_workout_ref is not null and w.source_workout_ref = imp.source_workout_ref)
        or (
          w.started_at is not null
          and w.ended_at > w.started_at
          and imp.started_at is not null
          and w.started_at <= coalesce(imp.ended_at, imp.started_at)
          and coalesce(w.ended_at, w.started_at) >= imp.started_at
        )
      )
  );

-- ── (f) La llave de los libres ya guardados ──────────────────────────────────
-- Una por (atleta, inicio): si un reenvío viejo creó varias copias con el mismo
-- inicio, la llave es de la primera (las demás se quedan como están).
update workout_assignments wa
set free_started_at = k.started_at
from (
  select distinct on (we.athlete_id, we.started_at) a.id, we.started_at
  from workout_executions we
  join workout_assignments a on a.id = we.assignment_id
  where a.origin = 'self' and we.started_at is not null
  order by we.athlete_id, we.started_at, a.id
) k
where wa.id = k.id
  and wa.free_started_at is null
  and not exists (
    select 1 from workout_assignments o
    where o.athlete_id = wa.athlete_id and o.free_started_at = k.started_at
  );

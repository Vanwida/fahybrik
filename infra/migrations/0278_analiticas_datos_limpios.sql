-- 0278 — Los datos que envenenaban las analíticas, arreglados en la raíz y en sitio.
--
-- docs/analiticas/modelo.md §6 «Fallos de datos» y DECISIONS 2026-09-29 «Cinco
-- fallos de datos de las analíticas». Cada bloque arregla lo ya guardado con la
-- MISMA regla que ahora aplica el código, en este orden:
--   (1) jsonb guardado como CADENA → objeto, y la base deja de admitirlo
--   (4) importaciones de Apple Salud re-derivadas de su marcador
--   (5) copias de un entreno libre reenviado → una
--   (2) zonas que no caben en su tramo
--   (3) saltos imposibles
-- (4) va detrás de (1) porque lee los marcadores ya desenvueltos, y (2) detrás de
-- (4) y (5) porque limpia las zonas de las ventanas que esos pasos tocan.
--
-- Idempotente: cada paso solo toca lo que aún no cumple su regla. Reejecutarla no
-- cambia nada.
--
-- DESPUÉS DE APLICARLA: las filas de zonas borradas en (2) son un cálculo, no un
-- dato, y las vuelve a hacer el motor con
--   pnpm --dir infra backfill:zonas
-- (sin --force: solo recalcula las ejecuciones con algún tramo sin fila).

-- ── (1) jsonb como CADENA → objeto ────────────────────────────────────────────
-- `${JSON.stringify(x)}::jsonb` con postgres.js guarda un jsonb de tipo STRING: todo
-- `columna->>'clave'` lee NULL. Tres columnas estaban tocadas en producción:
--   · athlete_daily_readiness_snapshots.breakdown_json — 1.367 filas: el sueño de
--     la ficha del coach salía vacío (escritor arreglado en este lote)
--   · biometric_streams.raw_payload_json — 1.657 marcadores training_load: el tipo
--     de actividad de Salud no se podía leer (escritor arreglado el 10-08)
--   · notifications.payload_json — 293 avisos viejos (escritores arreglados el 09-08)
-- Se desenvuelve una vez, solo si dentro hay un OBJETO JSON válido (el CASE fija el
-- orden: nunca se convierte algo que no es jsonb válido).

update athlete_daily_readiness_snapshots
set breakdown_json = (breakdown_json #>> '{}')::jsonb
where jsonb_typeof(breakdown_json) = 'string'
  and case
        when pg_input_is_valid(breakdown_json #>> '{}', 'jsonb')
          then jsonb_typeof((breakdown_json #>> '{}')::jsonb) = 'object'
        else false
      end;

update biometric_streams
set raw_payload_json = (raw_payload_json #>> '{}')::jsonb
where jsonb_typeof(raw_payload_json) = 'string'
  and case
        when pg_input_is_valid(raw_payload_json #>> '{}', 'jsonb')
          then jsonb_typeof((raw_payload_json #>> '{}')::jsonb) = 'object'
        else false
      end;

update notifications
set payload_json = (payload_json #>> '{}')::jsonb
where jsonb_typeof(payload_json) = 'string'
  and case
        when pg_input_is_valid(payload_json #>> '{}', 'jsonb')
          then jsonb_typeof((payload_json #>> '{}')::jsonb) = 'object'
        else false
      end;

-- La base deja de admitir la forma rota: el próximo escritor con el cepo falla en
-- voz alta en vez de guardar algo que nadie puede leer. El desglose y el aviso son
-- siempre un objeto. El payload crudo de un proveedor puede tener otra forma, así
-- que ahí solo se prohíbe exactamente el cepo (la cadena).
alter table athlete_daily_readiness_snapshots
  drop constraint if exists athlete_daily_readiness_breakdown_object_chk;
alter table athlete_daily_readiness_snapshots
  add constraint athlete_daily_readiness_breakdown_object_chk
  check (jsonb_typeof(breakdown_json) = 'object');

alter table notifications
  drop constraint if exists notifications_payload_object_chk;
alter table notifications
  add constraint notifications_payload_object_chk
  check (jsonb_typeof(payload_json) = 'object');

alter table biometric_streams
  drop constraint if exists biometric_streams_raw_payload_not_string_chk;
alter table biometric_streams
  add constraint biometric_streams_raw_payload_not_string_chk
  check (raw_payload_json is null or jsonb_typeof(raw_payload_json) <> 'string');

-- ── (4) Importaciones de Apple Salud re-derivadas de su marcador ───────────────
-- El 13-08 el histórico se materializó desde marcadores guardados como cadena: el
-- lector los vio vacíos y nacieron 1.277 sesiones «other» (también fuerza, carrera,
-- remo y bici), sin distancia, pulso ni calorías y con el fin inventado como inicio
-- + duración. El marcador (ya objeto tras (1)) es la fuente: se rellena lo que
-- falta, con la regla del materializador (`materialize-healthkit-workout.ts`,
-- `healthkit-activity.ts`). Nunca se pisa un dato que ya existe, y la modalidad
-- solo sube desde «other».
-- Solo importaciones planas (sin asignación): una enganchada a una sesión del plan
-- tiene su modalidad por su ejercicio (0274) y no se toca.

create temporary table _imp_0278 on commit drop as
with base as (
  select
    we.id as execution_id,
    se.id as segment_id,
    we.started_at,
    we.ended_at as cur_ended_at,
    we.total_duration_seconds as dur_s,
    se.modality as cur_modality,
    m.p
  from workout_executions we
  join segment_executions se
    on se.execution_id = we.id
   and se.position = 0
   and se.round_index = 0
   and se.source = 'healthkit'
   and se.template_segment_id is null
  join lateral (
    select bs.raw_payload_json as p
    from biometric_streams bs
    where bs.athlete_id = we.athlete_id
      and bs.source = 'healthkit'
      and bs.source_workout_id = we.source_workout_ref
      and bs.metric_type = 'training_load'
      and jsonb_typeof(bs.raw_payload_json) = 'object'
    order by bs.id desc
    limit 1
  ) m on true
  where we.recorded_via = 'imported'
    and we.source = 'healthkit'
    and we.assignment_id is null
    and we.source_workout_ref is not null
),
-- Cada número del marcador, solo si ES un número (el CASE anidado fija el orden: la
-- conversión nunca se evalúa sobre otra cosa), en el rango de su columna.
num as (
  select
    b.*,
    case when jsonb_typeof(b.p->'workout_activity_type') = 'number'
      then (b.p->>'workout_activity_type')::numeric end as hk_n,
    case when jsonb_typeof(b.p->'total_distance_meters') = 'number'
      then (b.p->>'total_distance_meters')::numeric end as dist_n,
    case when jsonb_typeof(b.p->'total_energy_burned_kcal') = 'number'
      then (b.p->>'total_energy_burned_kcal')::numeric end as kcal_n,
    case when jsonb_typeof(b.p->'avg_heart_rate_bpm') = 'number'
      then round((b.p->>'avg_heart_rate_bpm')::numeric) end as avg_hr_n,
    case when jsonb_typeof(b.p->'max_heart_rate_bpm') = 'number'
      then round((b.p->>'max_heart_rate_bpm')::numeric) end as max_hr_n,
    case when jsonb_typeof(b.p->'ended_at') = 'string'
      then case when pg_input_is_valid(b.p->>'ended_at', 'timestamptz')
        then (b.p->>'ended_at')::timestamptz end end as p_ended_at
  from base b
),
leido as (
  select
    n.*,
    case when n.hk_n between 0 and 100000 then n.hk_n::int end as hk,
    case when n.dist_n between 0 and 999999.99 then n.dist_n end as dist_m,
    case when n.kcal_n between 0 and 99999.99 then n.kcal_n end as kcal,
    case when n.avg_hr_n between 30 and 260 then n.avg_hr_n::int end as avg_hr,
    case when n.max_hr_n between 30 and 260 then n.max_hr_n::int end as max_hr
  from num n
)
select
  l.execution_id,
  l.segment_id,
  l.dist_m,
  l.kcal,
  l.avg_hr,
  l.max_hr,
  l.dur_s,
  -- La modalidad del tipo de Apple (espejo de `healthkitActivityToModality`).
  case
    when l.cur_modality <> 'other' then l.cur_modality
    when l.hk in (37, 71) then 'run'
    when l.hk = 35 then 'row'
    when l.hk = 60 then 'ski'
    when l.hk in (13, 74) then 'bike'
    when l.hk in (20, 50, 59, 63) then 'strength'
    else 'other'
  end as modality,
  -- El fin que dijo Salud, si es legible y no queda antes del inicio.
  case
    when l.p_ended_at is not null
     and l.p_ended_at >= l.started_at
     and l.p_ended_at is distinct from l.cur_ended_at
      then l.p_ended_at
  end as new_ended_at
from leido l;

update workout_executions we
set total_distance_m = coalesce(we.total_distance_m, x.dist_m),
    total_calories = coalesce(we.total_calories, x.kcal),
    avg_hr = coalesce(we.avg_hr, x.avg_hr),
    max_hr = coalesce(we.max_hr, x.max_hr),
    ended_at = coalesce(x.new_ended_at, we.ended_at),
    updated_at = now()
from _imp_0278 x
where we.id = x.execution_id
  and (
    (we.total_distance_m is null and x.dist_m is not null)
    or (we.total_calories is null and x.kcal is not null)
    or (we.avg_hr is null and x.avg_hr is not null)
    or (we.max_hr is null and x.max_hr is not null)
    or x.new_ended_at is not null
  );

update segment_executions se
set modality = x.modality,
    distance_meters = coalesce(se.distance_meters, x.dist_m),
    calories = coalesce(se.calories, x.kcal),
    avg_hr = coalesce(se.avg_hr, x.avg_hr),
    max_hr = coalesce(se.max_hr, x.max_hr),
    hr_source = coalesce(se.hr_source, case when coalesce(se.avg_hr, x.avg_hr) is not null then 'healthkit' end),
    avg_pace_s_per_km = coalesce(
      se.avg_pace_s_per_km,
      case
        when x.modality = 'run'
         and coalesce(se.distance_meters, x.dist_m) > 0
         and x.dur_s > 0
         and x.dur_s / (coalesce(se.distance_meters, x.dist_m) / 1000) <= 99999.99
          then round(x.dur_s / (coalesce(se.distance_meters, x.dist_m) / 1000), 2)
      end
    ),
    ended_at = coalesce(x.new_ended_at, se.ended_at),
    updated_at = now()
from _imp_0278 x
where se.id = x.segment_id
  and (
    se.modality is distinct from x.modality
    or (se.distance_meters is null and x.dist_m is not null)
    or (se.calories is null and x.kcal is not null)
    or (se.avg_hr is null and x.avg_hr is not null)
    or (se.max_hr is null and x.max_hr is not null)
    or x.new_ended_at is not null
  );

-- Su ventana cambió: las zonas que se calcularon sobre la vieja ya no son de este
-- tramo. Se borran y las rehace el motor (nota de la cabecera).
delete from segment_zone_seconds z
using _imp_0278 x
where z.segment_execution_id = x.segment_id
  and x.new_ended_at is not null;

-- ── (5) Un entreno libre reenviado es UN entreno ──────────────────────────────
-- El 04, 12 y 20-08 la cola del iPhone reenvió libres a POST /free, que no tenía
-- llave y creó plantilla + asignación + ejecución en cada reenvío: 9 copias de un
-- press de banca, 13 copias en total. 0274 cerró el camino (llave
-- `free_started_at` + título, índice único y cerrojo) pero dejó las copias viejas.
-- La regla es la del código: mismo atleta, mismo inicio sellado por el motor y
-- mismo título son el mismo entreno (y, si traen ref de Salud, la misma). Otro
-- título con el mismo inicio es OTRO entreno (el reloj congelado del 04-08) y no
-- se toca. Entre copias se queda la más antigua (`created_at`, luego id), como en
-- 0276, y lo que colgara de las demás pasa a ella si no lo tiene ya.

create temporary table _dup_libre_0278 on commit drop as
select d.id as dup_id, d.assignment_id as dup_assignment_id, d.template_id as dup_template_id,
       d.keeper_id, d.keeper_assignment_id
from (
  select
    we.id,
    we.assignment_id,
    wa.template_id,
    first_value(we.id) over w as keeper_id,
    first_value(we.assignment_id) over w as keeper_assignment_id
  from workout_executions we
  join workout_assignments wa on wa.id = we.assignment_id and wa.origin = 'self'
  join templates t on t.id = wa.template_id
  where we.started_at is not null
    and we.recorded_via is distinct from 'imported'
  window w as (
    partition by we.athlete_id, we.started_at, t.name, we.source_workout_ref
    order by we.created_at, we.id
  )
) d
where d.id <> d.keeper_id;

-- Tramos que la superviviente no tenga ya en esa posición y ronda.
update segment_executions s
set execution_id = x.keeper_id, updated_at = now()
from _dup_libre_0278 x
where s.execution_id = x.dup_id
  and not exists (
    select 1 from segment_executions k
    where k.execution_id = x.keeper_id
      and k.position = s.position
      and k.round_index = s.round_index
  );

-- Trazas: las señales que la superviviente no tenga ya de esa fuente.
update workout_traces t
set execution_id = x.keeper_id
from _dup_libre_0278 x
where t.execution_id = x.dup_id
  and not exists (
    select 1 from workout_traces k
    where k.execution_id = x.keeper_id and k.signal = t.signal and k.source = t.source
  );

-- Ruta, capturas de sensor y confirmación: una por ejecución, solo si falta.
update workout_routes r
set execution_id = x.keeper_id
from _dup_libre_0278 x
where r.execution_id = x.dup_id
  and not exists (select 1 from workout_routes k where k.execution_id = x.keeper_id);

update workout_sensor_captures c
set execution_id = x.keeper_id
from _dup_libre_0278 x
where c.execution_id = x.dup_id
  and not exists (select 1 from workout_sensor_captures k where k.execution_id = x.keeper_id);

update wearable_activity_confirmations c
set execution_id = x.keeper_id, assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x
where (c.execution_id = x.dup_id or c.assignment_id = x.dup_assignment_id)
  and not exists (
    select 1 from wearable_activity_confirmations k
    where k.execution_id = x.keeper_id or k.assignment_id = x.keeper_assignment_id
  );

-- Lo que colgaba de la asignación de la copia pasa a la de la superviviente.
update athlete_benchmarks t set assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x where t.assignment_id = x.dup_assignment_id;
update athlete_strength_maxes t set assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x where t.assignment_id = x.dup_assignment_id;
update jump_attempts t set assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x where t.assignment_id = x.dup_assignment_id;
update coach_mass_adjustment_targets t set assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x where t.assignment_id = x.dup_assignment_id;
update coach_communication_items t set test_assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x where t.test_assignment_id = x.dup_assignment_id;
update dobles_live_status t set assignment_id = x.keeper_assignment_id
from _dup_libre_0278 x
where t.assignment_id = x.dup_assignment_id
  and not exists (select 1 from dobles_live_status k where k.assignment_id = x.keeper_assignment_id);

-- Las copias, su asignación y su plantilla (que ya no es de nadie) se van. Lo
-- repetido cae con ellas (on delete cascade).
delete from workout_executions w
using _dup_libre_0278 x
where w.id = x.dup_id;

delete from workout_assignments a
using _dup_libre_0278 x
where a.id = x.dup_assignment_id
  and not exists (select 1 from workout_executions e where e.assignment_id = a.id);

delete from templates t
using _dup_libre_0278 x
where t.id = x.dup_template_id
  and not exists (select 1 from workout_assignments a where a.template_id = t.id)
  and not exists (select 1 from coach_assign_batch_session_changes b where b.template_id = t.id);

-- ── (2) Ningún tramo con más segundos en zona que segundos de vida ────────────
-- El reparto congelado del móvil se guardaba tal cual aunque no cupiera en su tramo
-- (1.029 s en 690 s, 184 s en 180 s, ventanas rotas con hasta 565 s dentro): el
-- motor reiniciaba el reloj del tramo sin vaciar sus zonas. La regla del código
-- (`fitZoneSecondsToWindow`): se pasa de la ventana más de 3 s (el redondeo al
-- segundo de cinco zonas y de los dos extremos) → no es la medida de ese tramo.

create temporary table _zonas_0278 on commit drop as
select se.id as segment_id
from segment_executions se
cross join lateral (
  select coalesce(sum(
           case when jsonb_typeof(e.value) = 'number'
             then greatest(0, round((e.value #>> '{}')::numeric)) else 0 end
         ), 0) as measured_s
  from jsonb_each(
    case when jsonb_typeof(se.raw_lap_data_json->'zone_seconds') = 'object'
      then se.raw_lap_data_json->'zone_seconds' else '{}'::jsonb end
  ) e
  where e.key in ('z1', 'z2', 'z3', 'z4', 'z5')
) z
where jsonb_typeof(se.raw_lap_data_json->'zone_seconds') = 'object'
  and se.started_at is not null
  and se.ended_at is not null
  and z.measured_s > greatest(0, round(extract(epoch from se.ended_at - se.started_at))) + 3;

-- El reparto que no es de ese tramo se quita (el resto del blob se queda).
update segment_executions se
set raw_lap_data_json = nullif(se.raw_lap_data_json - 'zone_seconds', '{}'::jsonb),
    updated_at = now()
from _zonas_0278 x
where se.id = x.segment_id;

-- Filas de zonas (un cálculo) que no cumplen la regla: las de esos tramos y toda
-- fila con más segundos que su tramo (el redondeo que el motor nuevo recorta).
-- Las rehace el motor (nota de la cabecera).
delete from segment_zone_seconds z
using segment_executions se
where se.id = z.segment_execution_id
  and (
    se.id in (select segment_id from _zonas_0278)
    or z.total_s > greatest(0, round(extract(epoch from se.ended_at - se.started_at)))
  );

-- ── (3) Saltos imposibles ──────────────────────────────────────────────────────
-- 13-08: un CMJ con 2,42 s de vuelo (720 cm) se guardó como intento bueno y como la
-- marca de CMJ del atleta. El techo es FÍSICO: 1 s de vuelo = 122,625 cm
-- (`JUMP_FLIGHT_MAX_S`, `JUMP_HEIGHT_MAX_CM`). El intento no se borra: se marca con
-- su columna de validez (`quality = 'discarded'`, `kept = false`) y conserva sus
-- fotogramas y su altura como rastro.
update jump_attempts
set quality = 'discarded', kept = false
where quality <> 'discarded'
  and flight_time_s > 1;

-- La marca en cm por encima del techo se rehace con la regla con la que se firmó
-- (la mejor de los intentos buenos y conservados de ESA batería y ese tipo de
-- salto). Sin ninguno que la sostenga, no hay marca que guardar.
update athlete_benchmarks b
set value = r.best_cm
from (
  select b2.id, max(j.height_cm) as best_cm
  from athlete_benchmarks b2
  join jump_attempts j
    on j.athlete_id = b2.athlete_id
   and j.assignment_id = b2.assignment_id
   and j.kind = case b2.exercise_slug when 'cmj_loaded' then 'loaded_cmj' else b2.exercise_slug end
   and j.kept
   and j.quality <> 'discarded'
   and j.flight_time_s <= 1
  where b2.unit = 'cm'
    and b2.value > 122.625
  group by b2.id
) r
where b.id = r.id;

delete from athlete_benchmarks
where unit = 'cm'
  and value > 122.625;

-- Y la base deja de admitirlos.
alter table jump_attempts drop constraint if exists jump_attempts_flight_plausible_chk;
alter table jump_attempts
  add constraint jump_attempts_flight_plausible_chk
  check (quality = 'discarded' or flight_time_s <= 1);

alter table athlete_benchmarks drop constraint if exists athlete_benchmarks_height_plausible_chk;
alter table athlete_benchmarks
  add constraint athlete_benchmarks_height_plausible_chk
  check (unit <> 'cm' or value <= 122.625);

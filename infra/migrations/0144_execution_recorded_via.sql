-- 0144 — separar QUIÉN REGISTRÓ el entreno de QUÉ APARATOS dieron los números.
--
-- EL PROBLEMA (real, cazado con datos de PROD el 28-jul)
-- ------------------------------------------------------
-- Alex entrenó cuatro sesiones EN VIVO con el motor de la app (ski 400 m, 1 km
-- corriendo, EMOM y remo 5×500) con un PM5 y una cinta conectados. Las cuatro
-- quedaron guardadas con `source = 'manual'`, y la app se lo enseña como
-- «Registro: A mano». Es mentira, y es mentira porque `source` está haciendo dos
-- trabajos incompatibles a la vez:
--
--   1. de QUÉ APARATO salen los números  (healthkit | garmin | concept2 | polar…)
--   2. CÓMO llegó a existir el registro   (lo corrió en la app | lo tecleó | se importó)
--
-- El tipo `biometric_source` es vocabulario del trabajo (1) — son cuentas y
-- aparatos — y no tiene NINGUNA forma de decir «lo hizo en vivo con la app».
-- Por eso el camino libre acabó mandando 'manual' a pelo: era el único valor que
-- quedaba, y significa lo contrario de lo que pasó.
--
-- LA DECISIÓN
-- -----------
-- `source` se queda con el significado (1), que es el que su TIPO ya dice y el
-- que su lógica ya usa: `ingest-healthkit.ts:207` y `reconcile.ts` deciden
-- precedencia entre aparatos con él ("si ya hay garmin, garmin gana"). Cambiarle
-- el sentido rompería esa fusión multi-fuente.
--
-- El significado (2) se va a una columna nueva, `recorded_via`, con su propio
-- enum cerrado de tres valores — que es todo lo que la realidad tiene:
--
--   live      el atleta lo corrió en la app; el motor cronometró y grabó tramos
--   manual    lo tecleó después ("Ya lo hice"); no hubo motor, no hay tramos
--   imported  lo creó un ingestor de un tercero sin sesión en la app
--
-- Y `contributing_sources` (que existe desde hace tiempo y NADIE escribía —
-- verificado: '{}' en las 77 filas) pasa a ser lo que su nombre promete: todos
-- los aparatos que aportaron datos. `totals_source` idem para los totales.
--
-- Prueba de que el modelo aguanta: se rompió contra las 77 ejecuciones reales de
-- PROD y las 4 de Alex; TODAS clasifican sin una sola cadena libre (ver abajo).
--
-- POR QUÉ NO SE REESCRIBE `source` EN EL HISTÓRICO
-- ------------------------------------------------
-- Hay 74 filas con source='manual' y NO todas mienten: 57 son datos de demo/seed
-- y 1 es un registro tecleado de verdad. Reescribirlas «arreglando» el aparato
-- sería inventar procedencia sobre datos que nadie puede ya verificar. Esta
-- migración es ADITIVA: rellena columnas que hoy están vacías (`recorded_via`,
-- `contributing_sources`, `totals_source`) y NO toca `source` en ninguna fila.
-- La mentira de la pantalla se corrige en la LECTURA (la UI pasa a preferir
-- recorded_via + contributing_sources), no falsificando el pasado.
--
-- `recorded_via` queda NULLABLE a propósito: NULL = «no se sabe» y es la
-- respuesta honesta para las 57 filas de seed, que no fueron ni vividas ni
-- tecleadas por nadie. Todo lo que escriba la app a partir de ahora lo lleva.

begin;

create type execution_recording_method as enum ('live', 'manual', 'imported');

alter table workout_executions
  add column recorded_via execution_recording_method;

comment on column workout_executions.recorded_via is
  'CÓMO llegó a existir el registro: live (corrido en la app) | manual (tecleado a posteriori) | imported (ingestado de un tercero). NULL = filas anteriores a 0144 / datos de seed. NO confundir con source, que es de QUÉ APARATO salen los números.';

comment on column workout_executions.source is
  'De qué APARATO/plataforma salen los números principales. NO dice si el atleta lo corrió en la app: para eso está recorded_via.';

comment on column workout_executions.contributing_sources is
  'TODOS los aparatos que aportaron datos a esta ejecución, deducidos de los tramos. Vacío = ningún aparato (sesión a pulso).';

-- ---------------------------------------------------------------------------
-- Backfill 1 — recorded_via, deducido de EVIDENCIA que ya está en la base.
--
-- La señal es limpia y no hace falta adivinar: el registro a mano ("Ya lo hice")
-- NO graba tramos — `PostWorkoutSummaryView.executionCore()` manda segments=nil
-- en modo manual porque el cronómetro nunca corrió. Así que:
--   tiene tramos del motor  → lo corrió en la app
--   tiene tramos de un ingestor → vino importado
--   no tiene tramos            → lo tecleó
-- ---------------------------------------------------------------------------

-- live: hay tramos escritos por el motor de la app. Ese vocabulario por tramo
-- ('pm5','treadmill','gps','manual','healthkit') lo emite SOLO el cliente iOS.
-- Reparte en PROD: pm5(3) treadmill(2) gps(1) healthkit(5) manual(6).
update workout_executions we
   set recorded_via = 'live'
 where exists (
         select 1 from segment_executions s
          where s.execution_id = we.id
            and s.source in ('pm5', 'treadmill', 'gps', 'manual', 'healthkit')
       );

-- imported: tramos que NO vienen del motor y una ejecución que no es 'manual'
-- (la escribió un ingestor de dispositivo). En PROD: las 2 de concept2.
update workout_executions we
   set recorded_via = 'imported'
 where we.recorded_via is null
   and we.source is not null
   and we.source <> 'manual'
   and exists (select 1 from segment_executions s where s.execution_id = we.id);

-- manual: ni un solo tramo → nadie cronometró nada, se tecleó. En PROD: 1 fila.
update workout_executions we
   set recorded_via = 'manual'
 where we.recorded_via is null
   and not exists (select 1 from segment_executions s where s.execution_id = we.id);

-- Las 57 filas de seed (tramos con source='demo') NO entran en ninguna regla y
-- se quedan en NULL, que es la verdad: no se sabe, porque nunca ocurrieron.

-- ---------------------------------------------------------------------------
-- Backfill 2 — contributing_sources: los aparatos que aportaron datos, subidos
-- desde los tramos. 'manual' y 'demo' NO son aparatos y quedan fuera: un array
-- vacío significa exactamente «ningún aparato», que es información real.
-- 'pm5' normaliza a 'concept2' (es su monitor), sin duplicar vocabulario.
-- ---------------------------------------------------------------------------
update workout_executions we
   set contributing_sources = sub.sources
  from (
        select s.execution_id,
               array_agg(distinct
                 (case s.source when 'pm5' then 'concept2' else s.source end)::biometric_source
                 order by (case s.source when 'pm5' then 'concept2' else s.source end)::biometric_source
               ) as sources
          from segment_executions s
         where s.source in ('pm5', 'treadmill', 'gps', 'healthkit',
                            'concept2', 'garmin', 'polar', 'coros', 'wahoo')
         group by s.execution_id
       ) sub
 where sub.execution_id = we.id
   and we.contributing_sources = '{}';

-- ---------------------------------------------------------------------------
-- Backfill 3 — totals_source: de qué aparato salen los totales. Es el aparato
-- del tramo MÁS LARGO (el que domina duración y distancia). Solo se rellena
-- cuando ese tramo tiene aparato de verdad; si no, se queda NULL.
-- ---------------------------------------------------------------------------
update workout_executions we
   set totals_source = sub.src
  from (
        select distinct on (s.execution_id)
               s.execution_id,
               (case s.source when 'pm5' then 'concept2' else s.source end)::biometric_source as src
          from segment_executions s
         where s.source in ('pm5', 'treadmill', 'gps', 'healthkit',
                            'concept2', 'garmin', 'polar', 'coros', 'wahoo')
         order by s.execution_id,
                  extract(epoch from (s.ended_at - s.started_at)) desc nulls last,
                  s.position
       ) sub
 where sub.execution_id = we.id
   and we.totals_source is null;

commit;

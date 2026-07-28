-- PROPUESTA — NO APLICADA. Vive fuera de infra/migrations/ a propósito: el runner
-- (infra/scripts/migrate.ts) coge TODO *.sql de esa carpeta, así que un fichero ahí
-- se aplicaría solo. Muévelo tú, numerado, cuando decidas ejecutarlo.
--
-- Contexto: hasta el 28-jul-2026 la app escribía la carga PRESCRITA en el hueco de
-- la carga REAL (WorkoutSession.closeCurrentSegmentLap y primeSetsIfNeeded). Una
-- sentadilla hecha a 80 sobre una prescripción de 100 se archivaba «5 × 100 kg», y
-- de ahí salen los % de fuerza del plan siguiente. Ya está arreglado en origen: la
-- carga sin declarar se queda nula y la prescripción vive en load_prescribed_kg.
-- Esto solo limpia lo YA archivado.
--
-- Qué hay en producción hoy (28-jul-2026, contado en Neon main, solo lectura):
--   · 12 filas reales de set_executions (source <> 'demo'), TODAS con
--     load_actual_kg = load_prescribed_kg.
--   · De esas 12, UNA (id 129) tiene confirmed = false: el atleta no tocó nada,
--     así que la carga es del coach y no suya. Es la única PROBABLE.
--   · Las otras 11 tienen confirmed = true — pero bajo el código viejo esa bandera
--     la encendían TANTO «HECHO» (que sí declara la carga tal cual escrita) COMO
--     una edición de repeticiones (que no dice nada del peso). Son ambiguas y NO se
--     tocan: borrar un dato que quizá es real es peor que dejar uno que quizá no.
--   · 3 segment_executions reales llevan weight_used_kg (ids 520, 521, 526); las
--     tres cuelgan de series confirmadas, así que caen en el mismo caso ambiguo.
--   · 12 filas más son semilla (source = 'demo'): no son afirmaciones sobre ningún
--     atleta real y se quedan como están.
--
-- Verificación previa (opcional, para ver qué se va a tocar):
--   select x.id, x.segment_execution_id, x.load_prescribed_kg, x.load_actual_kg
--     from set_executions x
--     join segment_executions se on se.id = x.segment_execution_id
--    where se.source <> 'demo' and x.confirmed = false
--      and x.load_actual_kg is not null
--      and x.load_actual_kg = x.load_prescribed_kg;

begin;

-- La carga que nadie confirmó vuelve a ser desconocida. La prescripción NO se toca:
-- sigue en load_prescribed_kg, que es donde se llama prescripción.
update set_executions x
   set load_actual_kg = null,
       updated_at     = now()
  from segment_executions se
 where se.id = x.segment_execution_id
   and se.source <> 'demo'
   and x.confirmed = false
   and x.load_actual_kg is not null
   and x.load_actual_kg = x.load_prescribed_kg;

-- El agregado del tramo es el máximo de las cargas DECLARADAS. Si al limpiar arriba
-- el tramo se queda sin ninguna, su weight_used_kg tampoco es un dato del atleta.
update segment_executions se
   set weight_used_kg = null,
       updated_at     = now()
 where se.source <> 'demo'
   and se.weight_used_kg is not null
   and not exists (
     select 1 from set_executions x
      where x.segment_execution_id = se.id
        and x.load_actual_kg is not null
   );

commit;

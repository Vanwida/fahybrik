-- 0192 — andar no es correr.
--
-- El mapeo de HealthKit metía walking (52) y hiking (24) en modality='run'.
-- Resultado real: 431 de las 667 «carreras» importadas de un atleta eran
-- caminatas a ~17 min/km, sumando 1.091 km falsos al volumen de running y
-- contaminando eficiencia, medias por tipo y comparativas.
--
-- El tipo de actividad original se conservó en biometric_streams.raw_payload_json
-- (clave workout_activity_type), joinable por source_workout_ref. Se re-estampa
-- modality='other' en los tramos de esas sesiones: su carga y sus zonas siguen
-- contando (segment_zone_seconds no depende de la modalidad; los lectores la
-- leen del tramo al hacer join), pero dejan de disfrazarse de kilómetros corridos.
--
-- El mapeo vivo se corrigió a la vez en web/lib/sync/healthkit-activity.ts.

with originales as (
  select distinct
    bs.athlete_id,
    bs.raw_payload_json::jsonb->>'source_workout_id' as ref
  from biometric_streams bs
  where bs.raw_payload_json is not null
    and bs.raw_payload_json::jsonb ? 'workout_activity_type'
    and (bs.raw_payload_json::jsonb->>'workout_activity_type')::int in (24, 52)
)
update segment_executions se
set modality = 'other'
from workout_executions we
join originales o
  on o.athlete_id = we.athlete_id
 and o.ref = we.source_workout_ref
where we.id = se.execution_id
  and we.source = 'healthkit'
  and se.modality = 'run';

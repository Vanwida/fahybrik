-- 0200 — Un kilo dice de qué test salió, o dice que de ninguno.
--
-- 0195 ancló una MARCA a la ocurrencia que la produjo (athlete_benchmarks.
-- assignment_id). `athlete_strength_maxes` se quedó fuera, y es la tabla que la
-- ficha del coach pinta como «Referencias». El resultado: un 1RM que salió de una
-- batería programada y uno que el coach escribió a mano se guardan idénticos
-- (source = 'coach_test' los dos), así que la pantalla no podía decir de dónde
-- venía el número — y decía «medidas».
--
-- El puente de baterías (lib/coach/test-battery-bridge) ya recibe el assignment y
-- ya se lo pasa a la marca; a la proyección de fuerza la tiraba. Esta columna la
-- recoge. Mismo contrato que 0195:
--
--   assignment_id no null → el kilo nació de ESA ocurrencia de test
--   assignment_id null    → el alta, el coach a mano, o el atleta apuntándoselo
--
-- Es un ancla, no una etiqueta: `source` sigue diciendo QUIÉN lo produjo y esta
-- columna dice SI hubo protocolo. Las dos juntas son el origen completo.
--
-- Puramente ADITIVO e idempotente; el runner envuelve el fichero en transacción.

alter table athlete_strength_maxes
  add column if not exists assignment_id bigint references workout_assignments(id) on delete set null;

create index if not exists athlete_strength_maxes_assignment_idx
  on athlete_strength_maxes (assignment_id, exercise_slug)
  where assignment_id is not null;

comment on column athlete_strength_maxes.assignment_id is
  '0200: ocurrencia de batería que produjo este 1RM. Null = alta / anotado a mano / apuntado por el atleta — nunca se lee como «medido en un test».';

-- Backfill conservador. El puente escribe, para la MISMA entrada, una marca en
-- athlete_benchmarks (con su assignment_id) y este 1RM, con el MISMO valor, el
-- mismo slug y el mismo instante. Ese trío es la huella: se ancla solo cuando hay
-- exactamente un candidato. Lo que no case se queda a null — un null se lee
-- «no sabemos que hubo test», que es la verdad, y jamás inventa una ocurrencia.
with candidatos as (
  select sm.id as max_id,
         min(b.assignment_id) as wa_id,
         count(distinct b.assignment_id) as n
  from athlete_strength_maxes sm
  join athlete_benchmarks b
    on b.athlete_id = sm.athlete_id
   and b.exercise_slug = sm.exercise_slug
   and b.assignment_id is not null
   and b.unit = 'kg'
   and b.value = sm.one_rm_kg
   and (timezone('UTC', b.recorded_at))::date = (timezone('UTC', sm.recorded_at))::date
  where sm.assignment_id is null
    and sm.source in ('coach_test', 'athlete_test')
    -- El puente nunca guarda el set: un 1RM con set salió de una estimación a mano.
    and sm.test_weight_kg is null
    and sm.test_reps is null
  group by sm.id
)
update athlete_strength_maxes sm
set assignment_id = c.wa_id
from candidatos c
where sm.id = c.max_id and c.n = 1;

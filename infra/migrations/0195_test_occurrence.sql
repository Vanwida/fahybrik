-- 0195 — Un resultado de batería pertenece a UNA ocurrencia
-- (docs/superpowers/specs/2026-08-13-tests-son-un-loop.md).
--
-- Hoy result_captured y el perfil de salto leen el último slug del atleta.
-- Dos CMJ hechos enseñan el mismo informe. El archivo y la comparativa mienten.
--
-- Puramente ADITIVO. Las filas viejas (onboarding, Marcas, Ritmos) se quedan
-- a null: no son ocurrencias de batería. El backfill solo toca coach_test
-- y athlete_test cuando el assignment es único o cae el mismo día.

alter table athlete_benchmarks
  add column if not exists assignment_id bigint references workout_assignments(id) on delete set null;

create index if not exists athlete_benchmarks_assignment_slug_idx
  on athlete_benchmarks (assignment_id, exercise_slug)
  where assignment_id is not null;

comment on column athlete_benchmarks.assignment_id is
  'Ocurrencia de batería que produjo esta fila. Null = onboarding / Marcas / Ritmos / histórico sin ancla.';

-- Un solo assignment del atleta produce este slug → es esa ocurrencia.
with uniq as (
  select b.id as bench_id, min(wa.id) as wa_id
  from athlete_benchmarks b
  join workout_assignments wa
    on wa.athlete_id = b.athlete_id
   and wa.calibration_test_id is not null
  join coach_test_results ctr
    on ctr.test_id = wa.calibration_test_id
   and ctr.slug = b.exercise_slug
  where b.assignment_id is null
    and b.source in ('coach_test', 'athlete_test')
  group by b.id
  having count(distinct wa.id) = 1
)
update athlete_benchmarks b
set assignment_id = u.wa_id
from uniq u
where b.id = u.bench_id;

-- Lo que queda: mismo día (fecha UTC de recorded_at = scheduled_for) y un solo match.
with same_day as (
  select b.id as bench_id,
         wa.id as wa_id,
         count(*) over (partition by b.id) as n
  from athlete_benchmarks b
  join workout_assignments wa
    on wa.athlete_id = b.athlete_id
   and wa.calibration_test_id is not null
   and wa.scheduled_for = (timezone('UTC', b.recorded_at))::date
  join coach_test_results ctr
    on ctr.test_id = wa.calibration_test_id
   and ctr.slug = b.exercise_slug
  where b.assignment_id is null
    and b.source in ('coach_test', 'athlete_test')
)
update athlete_benchmarks b
set assignment_id = s.wa_id
from same_day s
where b.id = s.bench_id
  and s.n = 1;

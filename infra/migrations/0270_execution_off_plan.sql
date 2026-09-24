-- 0270 — Un entreno hecho no se pierde: la ejecución «fuera del plan».
--
-- El hueco (auditoría de la app del atleta, E1 / D-04): el coach «Quita» o
-- «Sustituye» una sesión pendiente (borrado duro) mientras el atleta la está
-- entrenando, o el reloj ofrece la sesión de ayer. Al guardar,
-- POST /api/sync/workout-execution contestaba 404 y la app lo trata como veneno:
-- REINTENTAR para siempre en el móvil, «Sesión completada» en el reloj sin nada en
-- el servidor, y la cola offline la tiraba. Series, cargas y RPE, perdidos.
--
-- Ahora esa sesión se guarda como lo que es: una ejecución del atleta SIN
-- asignación (la misma forma que un entreno importado de Apple Salud, DECISIONS
-- 2026-08-13), marcada para que su coach la vea («hecho sobre un entreno que ya no
-- estaba en su plan»):
--   · `off_plan_reason` — por qué no casa con su plan:
--       'assignment_gone'     la sesión que nombra ya no existe (quitada/sustituida);
--       'not_own_assignment'  la sesión que nombra es de otro atleta (nunca se
--                             escribe en la suya: queda como del que la envía);
--       'no_assignment'       el envío no traía una sesión legible.
--   · `claimed_assignment_id` — la sesión que nombraba, SOLO cuando ya no existe
--     (sin FK: está borrada; un «Deshacer» del coach la repone con el mismo id).
--     Nunca el id de la sesión de otro atleta.
--
-- Idempotencia: un reenvío del mismo entreno (REINTENTAR, la cola, el reloj) es el
-- mismo entreno. La llave es la hora de inicio que sella el motor al arrancar —
-- la misma regla que el entreno libre (card 120): un atleta no empieza dos
-- entrenos en el mismo instante. Índice único PARCIAL sobre las filas fuera del
-- plan; el ON CONFLICT del escritor repite el predicado (DECISIONS 2026-08-20).

alter table workout_executions
  add column if not exists off_plan_reason text,
  add column if not exists claimed_assignment_id bigint;

alter table workout_executions drop constraint if exists workout_executions_off_plan_reason_chk;
alter table workout_executions
  add constraint workout_executions_off_plan_reason_chk
  check (off_plan_reason is null or off_plan_reason in ('assignment_gone', 'not_own_assignment', 'no_assignment'));

-- Fuera del plan = sin asignación. Una fila con asignación no puede decir que no la tiene.
alter table workout_executions drop constraint if exists workout_executions_off_plan_shape_chk;
alter table workout_executions
  add constraint workout_executions_off_plan_shape_chk
  check (off_plan_reason is null or assignment_id is null);

-- El id reclamado solo existe para la sesión que ya no está.
alter table workout_executions drop constraint if exists workout_executions_claimed_assignment_chk;
alter table workout_executions
  add constraint workout_executions_claimed_assignment_chk
  check (claimed_assignment_id is null or off_plan_reason = 'assignment_gone');

create unique index if not exists workout_executions_off_plan_start_uq
  on workout_executions (athlete_id, started_at)
  where off_plan_reason is not null;

-- Un entreno importado (Apple Salud, Garmin, Polar…) existió aunque nadie lo
-- hubiera prescrito. `assignment_id` NOT NULL + UNIQUE forzaba a o bien inventar
-- un hueco del plan o bien tirar el pasado a `biometric_streams` y que las
-- comparativas no lo vieran. El assignment sigue siendo 1:1 cuando existe;
-- sin assignment es una sesión importada, y el plan no la toca.

alter table workout_executions
  alter column assignment_id drop not null;

alter table workout_executions
  drop constraint workout_executions_assignment_unique;

create unique index workout_executions_assignment_unique
  on workout_executions (assignment_id)
  where assignment_id is not null;

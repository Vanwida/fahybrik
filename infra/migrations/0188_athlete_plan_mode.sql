-- 0188_athlete_plan_mode.sql
--
-- DE QUE NACE EL PLAN DEL ATLETA. El alta pregunta si sigue la periodizacion
-- del coach o es un plan solo suyo. Esa eleccion EXISTE antes de que haya
-- ningun microciclo (el esqueleto sale al planificar, no se inventa en el
-- alta) y por eso vive en columna, no solo en el snapshot JSON del intake.
--
-- shared   = periodizacion del coach (biblioteca / matriz nivel x dias)
-- personal = plan solo de este atleta. Hoy no le propone asignar secuencia.
--
-- Aditivo. Idempotente. El runner envuelve el fichero en UNA transaccion
-- (sin begin/commit aqui) y corta por punto y coma, asi que ningun
-- comentario lleva uno.

alter table athletes
  add column if not exists plan_mode text not null default 'shared';

alter table athletes drop constraint if exists athletes_plan_mode_chk;
alter table athletes add constraint athletes_plan_mode_chk
  check (plan_mode in ('shared', 'personal'));

comment on column athletes.plan_mode is
  '0188: shared = periodizacion del coach. personal = plan solo suyo. Columna viva, no snapshot: existe antes de que haya microciclos.';

update athletes a
   set plan_mode = 'personal'
 where coalesce(a.intake_notes_json ->> 'plan_mode', '') = 'personal'
    or exists (
         select 1
           from program_month_templates p
          where p.athlete_id = a.id
       );

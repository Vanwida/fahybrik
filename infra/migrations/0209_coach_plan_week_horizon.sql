-- 0209_coach_plan_week_horizon.sql
--
-- Horizonte de visibilidad del plan del atleta — METODO del club (FH-27).
-- Una columna en `coaches`: cuántas semanas adelante puede hojear el atleta
-- en la pestaña Plan. v1 club-wide; no por atleta ni por programa.
--
-- Defectos:
--   · Column default `this_week` → coaches NUEVOS (contrato 9-sep).
--   · Backfill `next_week` → coaches EXISTENTES (comportamiento pre-FH-27:
--     la API aceptaba week_offset=1).
--
-- Additive + idempotent.

alter table coaches
  add column if not exists plan_week_horizon text not null default 'this_week';

do $$
begin
  alter table coaches add constraint coaches_plan_week_horizon_chk
    check (plan_week_horizon in ('this_week', 'next_week', 'two_weeks', 'one_month'));
exception when duplicate_object then null;
end $$;

-- Clubs que ya existían: conservar la vista de «esta + la siguiente».
update coaches
set plan_week_horizon = 'next_week'
where plan_week_horizon = 'this_week';

comment on column coaches.plan_week_horizon is
  'Cuántas semanas adelante puede hojear el atleta en Plan (FH-27). this_week|next_week|two_weeks|one_month. Defecto nuevos=this_week; existentes backfill=next_week. Editado en /ajustes.';

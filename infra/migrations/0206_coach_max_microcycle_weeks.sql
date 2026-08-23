-- 0206 — CUÁNTO DURA UN BLOQUE LO DECIDE EL ENTRENADOR (card 135)
--
-- POR QUÉ
-- El tope de semanas de un microciclo estaba escrito a mano en el código, y
-- además escrito DOS VECES CON VALORES DISTINTOS: 8 para un microciclo de
-- biblioteca (`shared/domain/coach/program-months.ts`) y 20 para un plan
-- personal (`web/lib/dashboard/coach/personal-plans.ts`), con el mismo nombre de
-- constante en los dos sitios. O sea que ni siquiera estábamos de acuerdo con
-- nosotros mismos sobre cuánto puede durar un bloque.
--
-- Cuánto dura un bloque es METODOLOGÍA: otro entrenador perfectamente competente
-- trabaja en bloques de 10. La regla del proyecto es que si otro lo haría
-- distinto, nace como dato con un valor por defecto, nunca como número clavado.
--
-- QUÉ NO CAMBIA, Y ES A PROPÓSITO: que el límite EXISTA. Un ciclo de 12 semanas
-- se parte en cuatro tramos porque son cuatro fases, no porque el tope lo
-- obligue — no hay entidad «fase» y el ORDEN de los tramos ES la periodización.
-- Sin límite se podría crear un bloque de 12 semanas sin estructura, y eso borra
-- la única señal que tenemos de cómo está periodizado un plan.
--
-- El defecto es 8, así que un entrenador que no toque nada se comporta hoy
-- exactamente igual que ayer. Comprobado antes de aplicar: el microciclo más
-- largo que existe tiene 5 semanas (de 11), así que esto no invalida ninguno.

alter table coaches
  add column if not exists max_microcycle_weeks integer not null default 8;

-- Un tope de 1 no es un bloque y uno de medio año tampoco: el techo absoluto
-- (26) es una barrera de cordura del sistema, no metodología. Dentro de ella el
-- entrenador elige.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_max_microcycle_weeks_chk'
  ) then
    alter table coaches
      add constraint coaches_max_microcycle_weeks_chk
      check (max_microcycle_weeks between 2 and 26);
  end if;
end $$;

comment on column coaches.max_microcycle_weeks is
  'Tope de semanas de un microciclo de ESTE entrenador. Metodología suya, no del sistema. Defecto 8.';

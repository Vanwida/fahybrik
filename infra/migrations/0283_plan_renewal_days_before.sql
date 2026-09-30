-- 0283 — CUÁNTO ANTES SE RENUEVA UN PLAN DE GRUPO LO DECIDE EL ENTRENADOR
--
-- POR QUÉ
-- Un grupo con fin de cadena «repetir» o «subir de nivel» necesita que alguien
-- prepare la vuelta siguiente en el plan de cada atleta antes de que este llegue
-- al final. Un cron diario lo hace cuando al plan del atleta le quedan N días o
-- menos. N es método: uno prefiere tenerlo todo montado con un mes de margen y
-- otro lo quiere justo a tiempo. El mecanismo (el cron, la vuelta entera) es
-- nuestro; N es del coach, con defecto en shared/domain/coach/plan-renewal.ts.
--
-- NULL = el defecto del producto. Sin `default` de columna (mismo criterio que
-- 0259): un coach que no toca nada usa el valor de dominio, que puede cambiar.
-- Idempotente.

alter table coaches add column if not exists plan_renewal_days_before integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_plan_renewal_days_before_chk'
  ) then
    -- Techo de cordura del sistema (8 semanas), no método.
    alter table coaches
      add constraint coaches_plan_renewal_days_before_chk
      check (plan_renewal_days_before is null or plan_renewal_days_before between 0 and 56);
  end if;
end $$;

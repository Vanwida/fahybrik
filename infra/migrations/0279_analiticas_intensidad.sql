-- 0279 — Analíticas rehechas, bloque de INTENSIDAD (docs/analiticas/modelo.md §3
-- fila 4): el método del coach que el reparto fácil/medio/duro necesitaba para
-- poder decir su palabra.
--
-- HARD RULE Nº0. Tres cosas que un entrenador competente pondría distinto:
--   · QUÉ familias entran en el reparto. El objetivo (el 80/0/20 de
--     `coach_hr_method`) describe el trabajo de resistencia, y el pulso de una
--     serie de sentadillas no mide su intensidad y, contado, inflaría el «fácil»
--     con cada sesión de barra. Hay escuelas que solo miran la carrera y otras
--     que meten todo.
--   · CUÁNTOS puntos puede separarse cada banda de su objetivo antes de que la
--     palabra diga «zona media» o «demasiado duro».
--   · QUÉ cambio del reparto fácil entre dos periodos cuenta como cambio (la
--     misma familia de umbrales que `cambio_*` de 0277).
--
-- Mismo patrón que 0277: columnas nullable sin `default`, NULL = el defecto del
-- producto (shared/domain/analytics/metodo.ts): las familias de resistencia y
-- acondicionamiento (correr, remo, ski, bici, estaciones, wod), 10 puntos de
-- holgura y 5 de cambio. Un coach que no toca nada se comporta igual que el
-- sistema. Los CHECK repiten ANALYTICS_METHOD_BOUNDS, y que no se repita una
-- familia lo comprueba el PUT (`validarMetodoAnalitico`).
--
-- Aditiva. Idempotente. El runner envuelve el fichero en UNA transacción y corta
-- por punto y coma, así que ningún comentario lleva uno.

alter table coach_analytics_method
  add column if not exists polarizacion_familias        text[],
  add column if not exists polarizacion_tolerancia_pts  smallint,
  add column if not exists cambio_polarizacion_pts      smallint;

do $$
begin
  begin
    alter table coach_analytics_method
      add constraint coach_analytics_method_polarizacion_familias_chk
      check (
        polarizacion_familias is null
        or (
          cardinality(polarizacion_familias) between 1 and 8
          and polarizacion_familias <@ array['correr','remo','ski','bici','fuerza','estaciones','wod','otro']::text[]
        )
      );
  exception when duplicate_object then null;
  end;

  begin
    alter table coach_analytics_method
      add constraint coach_analytics_method_polarizacion_tolerancia_pts_chk
      check (polarizacion_tolerancia_pts is null or polarizacion_tolerancia_pts between 1 and 50);
  exception when duplicate_object then null;
  end;

  begin
    alter table coach_analytics_method
      add constraint coach_analytics_method_cambio_polarizacion_pts_chk
      check (cambio_polarizacion_pts is null or cambio_polarizacion_pts between 1 and 50);
  exception when duplicate_object then null;
  end;
end $$;

comment on column coach_analytics_method.polarizacion_familias is
  'Familias de entreno que entran en el reparto fácil/medio/duro frente al objetivo de coach_hr_method. NULL = correr, remo, ski, bici, estaciones y wod (fuera fuerza y otro).';
comment on column coach_analytics_method.polarizacion_tolerancia_pts is
  'Puntos que cada banda del reparto puede separarse de su objetivo antes de que el veredicto diga que se sale. NULL = 10.';
comment on column coach_analytics_method.cambio_polarizacion_pts is
  'Cambio del reparto fácil entre dos periodos de igual longitud que cuenta como cambio, en puntos porcentuales. NULL = 5.';

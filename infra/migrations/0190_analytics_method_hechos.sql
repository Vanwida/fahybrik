-- 0190 — Los umbrales de LOS HECHOS pasan a ser metodo del coach.
--
-- HARD RULE No0. En 0189 se hizo editable la carga, la capacidad y la
-- recuperacion, pero los tres numeros que deciden que se AFIRMA se quedaron
-- como `const` en shared/domain/analytics/hechos.ts. La pregunta que decide
-- («otro entrenador competente lo haria distinto?») da que si para los tres:
--
--   * sobre cuantos dias se lee una subida — catorce dias es «dos semanas»,
--     pero hay escuelas que la leen sobre el microciclo, que les dura tres.
--   * que subida es demasiado pequena para mencionarla.
--   * cuanto entrenamiento sin medir ni puntuar hay que tener antes de decirlo
--     en voz alta: un coach que exige RPE en todo lo pondra bajo, otro que solo
--     mira las sesiones clave lo pondra alto.
--
-- Los defectos siguen viviendo en shared/domain/analytics/metodo.ts y son
-- exactamente los valores que el codigo ya usaba (14 / 5 / 25), asi que un
-- coach que no toca nada lee las mismas frases que leia.
--
-- Aditivo: solo anade columnas a una tabla que 0189 creo vacia, asi que no hay
-- fila que rellenar. El runner envuelve el fichero en UNA transaccion (sin
-- begin/commit aqui) y corta por punto y coma, asi que ningun comentario lleva
-- uno.

alter table coach_analytics_method
  add column if not exists subida_dias                smallint,
  add column if not exists subida_minima_pct          smallint,
  add column if not exists cobertura_ciega_alerta_pct smallint;

alter table coach_analytics_method
  drop constraint if exists coach_analytics_method_subida_dias_chk;

alter table coach_analytics_method
  add constraint coach_analytics_method_subida_dias_chk
  check (subida_dias is null or subida_dias between 7 and 42);

alter table coach_analytics_method
  drop constraint if exists coach_analytics_method_subida_min_chk;

alter table coach_analytics_method
  add constraint coach_analytics_method_subida_min_chk
  check (subida_minima_pct is null or subida_minima_pct between 1 and 50);

alter table coach_analytics_method
  drop constraint if exists coach_analytics_method_ciega_chk;

alter table coach_analytics_method
  add constraint coach_analytics_method_ciega_chk
  check (cobertura_ciega_alerta_pct is null or cobertura_ciega_alerta_pct between 5 and 90);

comment on column coach_analytics_method.subida_dias is
  'Dias sobre los que se lee la subida del fondo para la frase «has subido un X % en ...». Defecto 14 en metodo.ts.';

comment on column coach_analytics_method.cobertura_ciega_alerta_pct is
  'Porcentaje de entrenamiento sin medir ni puntuar a partir del cual la pantalla lo dice en voz alta. Defecto 25.';

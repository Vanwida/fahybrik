-- 0131_test_result_optional.sql
--
-- #34 follow-up — un resultado de un test de calibracion puede ser OPCIONAL. Añade
-- coach_test_results.optional (default false = requerido). battery-status calcula el
-- "completado" del test SOLO sobre los resultados NO opcionales, de modo que un resultado
-- que la app puede auto-medir (p.ej. HRR/recuperacion de FC) o que el atleta puede saltar
-- no bloquea el completado. assignment-detail expone el flag para que iOS lo trate distinto.
--
-- Aditivo: default false ⇒ TODO test existente conserva su semantica (todos sus resultados
-- siguen siendo requeridos). Sin tocar datos. El runner envuelve el fichero en UNA
-- transaccion (sin begin/commit aqui). Ningun comentario lleva ';'.

alter table coach_test_results
  add column if not exists optional boolean not null default false;

comment on column coach_test_results.optional is
  'Resultado opcional (#34): la app puede auto-medirlo o el atleta saltarlo sin bloquear el completado del test. battery-status solo exige los NO opcionales. Default false = requerido.';

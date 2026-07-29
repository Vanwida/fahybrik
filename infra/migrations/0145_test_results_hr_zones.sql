-- 0145_test_results_hr_zones.sql
--
-- Cierra el primer peldano de la escalera de evidencia del pulso. El modelo de zonas
-- (shared/domain/methodology/hr-zones.ts) prefiere un umbral MEDIDO sobre 0,88 x FC maxima
-- y sobre 0,88 x Tanaka, y el servidor ya lee ese umbral de athlete_benchmarks
-- (exercise_slug 'lthr_bpm'). Pero NINGUNA pantalla podia escribirlo: el catalogo de tests
-- no admitia ni la medida ni la calibracion que hacen falta, asi que los 8 atletas de
-- produccion tenian umbral estimado y lo iban a tener para siempre.
--
-- Dos listas se amplian en coach_test_results:
--
--   measure += 'hr'        un pulso ABSOLUTO (el umbral que mide el test de 30 min).
--                          Distinto de 'hrr', que es una CAIDA entre dos pulsos: comparten
--                          la unidad 'bpm' y nada mas. Uno ancla las zonas, el otro es un
--                          marcador de recuperacion.
--
--   derives += 'hr_zones'  la calibracion de las zonas de pulso. A diferencia de run_zones
--                          y compania NO escribe una foto en athlete_zone_profiles: el
--                          modelo de FC se resuelve en vivo desde el ancla, asi que grabar
--                          el benchmark 'lthr_bpm' ES la calibracion completa. Existe como
--                          valor propio (y no 'none') porque el resultado SI calibra, y
--                          marcarlo como baseline le mentiria al coach en el editor de tests.
--
-- La unidad 'bpm' ya estaba permitida desde 0130 (hrr60), asi que unit_chk no se toca.
--
-- Puramente ADITIVO: las listas nuevas son superconjuntos de las viejas, asi que toda fila
-- existente sigue cumpliendo el CHECK. No se anade columna, no se toca ningun dato. El runner
-- envuelve el fichero en UNA transaccion (sin begin/commit aqui). Ningun comentario lleva ';'.

alter table coach_test_results drop constraint if exists coach_test_results_measure_chk;
alter table coach_test_results add constraint coach_test_results_measure_chk
  check (measure in ('time', 'distance', 'reps', 'calories', 'load', 'hrr', 'hr'));

alter table coach_test_results drop constraint if exists coach_test_results_derives_chk;
alter table coach_test_results add constraint coach_test_results_derives_chk
  check (derives in ('run_zones', 'row_zones', 'ski_zones', 'strength_max', 'hr_zones', 'none'));

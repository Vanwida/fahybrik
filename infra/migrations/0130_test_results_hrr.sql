-- 0130_test_results_hrr.sql
--
-- #34 follow-up — HRR (recuperacion de frecuencia cardiaca) como resultado almacenable
-- de un test. Extiende los CHECK de coach_test_results para admitir measure 'hrr' + unit
-- 'bpm', de modo que un test de calibracion pueda capturar los bpm que baja la FC en una
-- ventana fija tras parar (hrr60). Es un BASELINE (derives 'none'): no deriva zonas ni 1RM,
-- solo se guarda como evidencia de progreso (mas bpm de caida = mejor recuperacion).
--
-- Puramente ADITIVO: las listas nuevas son superconjuntos de las viejas, asi que toda fila
-- existente sigue cumpliendo el CHECK. No se añade columna, no se toca ningun dato. El runner
-- envuelve el fichero en UNA transaccion (sin begin/commit aqui). Ningun comentario lleva ';'.

alter table coach_test_results drop constraint if exists coach_test_results_measure_chk;
alter table coach_test_results add constraint coach_test_results_measure_chk
  check (measure in ('time', 'distance', 'reps', 'calories', 'load', 'hrr'));

alter table coach_test_results drop constraint if exists coach_test_results_unit_chk;
alter table coach_test_results add constraint coach_test_results_unit_chk
  check (unit in ('seconds', 'meters', 'reps', 'calories', 'kg', 'bpm'));

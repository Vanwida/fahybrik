-- 0143 — el vocabulario de PROCEDENCIA DEL DATO tiene que poder nombrar lo que
-- el motor en vivo realmente usa: la cinta y el GPS del teléfono.
--
-- `biometric_source` nació como lista de CUENTAS/PLATAFORMAS (healthkit, garmin,
-- polar…) porque su primer uso fue `biometric_streams.source`. Pero
-- `workout_executions.contributing_sources` es del mismo tipo y tiene que
-- responder a otra pregunta: QUÉ APARATOS aportaron números a esta sesión. Y ahí
-- hay dos fuentes reales que el enum no sabe decir:
--
--   * la CINTA por FTMS — no es una marca ni una cuenta, es la máquina
--   * el GPS del teléfono — tampoco es una cuenta de nadie
--
-- Verificado en PROD (28-jul, Neon HTTP solo lectura): `segment_executions.source`
-- (hoy TEXT libre) ya guarda exactamente ese vocabulario —
-- demo(173) · concept2(16) · manual(6) · healthkit(5) · pm5(3) · treadmill(2) · gps(1) —
-- así que la cinta y el GPS YA son datos reales que existen por tramo y que hasta
-- hoy no podían subir a la ejecución por no caber en el enum.
--
-- `pm5` NO se añade: un PM5 es el monitor de un Concept2, y `concept2` ya existe.
-- Se normaliza al escribir (pm5 → concept2), no se duplica el vocabulario.
-- Tampoco se inventa `chest_strap`: hoy el pulso llega por HealthKit y `healthkit`
-- ya lo cubre. Se añade lo que existe, ni un valor de más.
--
-- ADD VALUE va en su PROPIA migración: Postgres no deja usar un valor de enum
-- recién añadido dentro de la misma transacción que lo añade, y 0144 lo usa para
-- rellenar `contributing_sources`.

alter type biometric_source add value if not exists 'treadmill';
alter type biometric_source add value if not exists 'gps';

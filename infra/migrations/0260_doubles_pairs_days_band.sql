-- 0260 — Una pareja entrena de 1 a 7 días, como cualquier grupo.
--
-- DECISIONS 2026-09-23 «Grupos, asignar a varios y publicar por semana» sacó la
-- banda de 3–6 días (era la cadencia de una escuela, no del producto) y 0215 ya
-- dejó `program_sequences.days_per_week` en 1–7. El zod compartido
-- (`SEQUENCE_DAYS_MIN/MAX`, shared/schema/program-sequences.ts) se quedó en 3–6 y
-- ahora pasa a 1–7; `doubles_pairs` lo lee para la pareja, así que su CHECK
-- (0065) se alinea aquí. Sin él, una pareja de 2 días pasaría el zod y la base
-- la rechazaría con un 500. Idempotente.

alter table doubles_pairs drop constraint if exists doubles_pairs_days_chk;
alter table doubles_pairs
  add constraint doubles_pairs_days_chk
  check (training_days_per_week is null or training_days_per_week between 1 and 7);

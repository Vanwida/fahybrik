-- 0185_segment_avg_gradient.sql
--
-- LA PENDIENTE MEDIA DE UN TRAMO (#71) — hasta ahora solo se sabia por la
-- cinta (`incline_pct`), que en calle es siempre null. La regla firmada
-- ("desde el 3% de pendiente el eje pasa a tiempo y el veredicto de ritmo
-- se retira") nunca se disparaba para una carrera al aire libre. Ver
-- shared/domain/running/gradient.ts y docs/DECISIONS.md.
--
-- CAMBIO NETO de altitud sobre la distancia del tramo, NUNCA desnivel
-- acumulado (esa es `elevation_gain_m`/`elevation_loss_m`, mig 0154 — otra
-- pregunta). La cinta manda cuando la hay; la derivada de altitud es el
-- respaldo. Se escribe UNA VEZ, al llegar la traza (measured-header.ts),
-- igual que las columnas de la 0154 — nunca se recalcula al vuelo en cada
-- lectura.
--
-- numeric(5,2): rango realista de pendiente de carrera es de sobra con dos
-- decimales y hasta 999.99 (con margen de sobra sobre cualquier rampa real).
-- Nullable, sin default de columna: null es "no se sabe", nunca cero.
--
-- Aditivo. No toca ninguna fila existente. Idempotente (add column if not
-- exists). El runner envuelve el fichero en UNA transaccion (sin begin/
-- commit aqui) y corta por punto y coma, asi que ningun comentario lleva uno.

alter table segment_executions
  add column if not exists avg_gradient_pct numeric(5,2);

comment on column segment_executions.avg_gradient_pct is
  'Pendiente media del tramo (%), cambio NETO de altitud sobre la distancia -- nunca desnivel acumulado. La cinta (incline_pct) manda cuando la hay; si no, se deriva de la traza de altitud (shared/domain/running/gradient.ts). Null = no se sabe, nunca cero. Escrita una vez al llegar la traza (measured-header.ts), como las columnas de la 0154.';

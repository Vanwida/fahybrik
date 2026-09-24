-- 0223_coach_level_axis_label.sql
--
-- El eje con el que el coach clasifica atletas y programas se llama como él
-- quiera (DECISIONS 2026-08-23: «el nivel no es un nivel: es un eje del
-- entrenador»). El MECANISMO (un eje de valores ordenados) es nuestro; la
-- ETIQUETA es suya: «Nivel», «Grupo», «Objetivo»…
--
-- NULL = el defecto del producto, que vive en shared/domain/coach/level-axis.ts
-- (nunca como `default` de columna: DECISIONS 2026-08-09). Un coach que no toca
-- nada sigue viendo «Nivel».
--
-- Additive + idempotent.

alter table coaches
  add column if not exists level_axis_label text;

do $$
begin
  alter table coaches add constraint coaches_level_axis_label_len_chk
    check (level_axis_label is null or char_length(btrim(level_axis_label)) between 1 and 24);
exception when duplicate_object then null;
end $$;

comment on column coaches.level_axis_label is
  'Cómo llama el coach a su eje de clasificación (el «Nivel» de athlete_levels). NULL = defecto del producto (shared/domain/coach/level-axis.ts). Editado en Ajustes › Método.';

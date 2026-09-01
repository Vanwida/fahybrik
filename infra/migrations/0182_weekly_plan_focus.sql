-- 0182_weekly_plan_focus.sql
--
-- EL FOCO TAMBIÉN VIVE EN LA SEMANA DEL ATLETA, NO SOLO EN LA PLANTILLA
-- ----------------------------------------------------------------------
-- Hasta hoy «Foco de la semana» solo existía en `program_week_templates.focus`
-- (la plantilla que el coach diseña en la biblioteca). Una semana SIN cadena
-- —creada directa por el coach en la ficha del atleta, o por el conector MCP,
-- `weekly_plans.microcycle_id` NULL— no viene de ninguna plantilla, así que no
-- podía llevar foco: el atleta veía su semana sin la línea que dice qué toca.
--
-- LA DECISIÓN
-- -----------
-- `weekly_plans` gana su propia columna `focus`. Es la semana REAL del atleta,
-- así que manda sobre el defecto heredado de la plantilla: al servir, el
-- sistema lee `weekly_plans.focus ?? focoDePlantilla`. Una semana que sigue la
-- periodización y nunca se toca a mano sigue mostrando el foco de su plantilla
-- exactamente como hoy — esta columna es un override, no un reemplazo.
--
-- SEGURIDAD
-- ---------
-- Columna nueva, anulable, SIN default: ninguna fila existente cambia de
-- significado y ninguna semana pasa a ocultarse — `status` (el portón real de
-- visibilidad, ver docs/DECISIONS.md 2026-08-10 «SIN fila SE VE») no se toca.

alter table weekly_plans
  add column if not exists focus text;

comment on column weekly_plans.focus is
  'Foco de ESTA semana del atleta, dictado por el coach (panel o MCP). NULL = sin override; el atleta ve el foco de la plantilla del microciclo, si lo hay.';

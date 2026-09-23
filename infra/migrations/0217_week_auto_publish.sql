-- 0217: PUBLICAR POR SEMANA, SOLA, N DÍAS ANTES — y retener una semana.
--
-- POR QUÉ (docs/DECISIONS.md 2026-09-23, decisión 6)
-- --------------------------------------------------
-- Hasta hoy una semana en borrador `scheduled` la soltaba un cron de SÁBADO
-- (solo el lunes siguiente, y si fallaba un sábado esa semana no salía nunca) y
-- la primera semana de un programa se veía nada más asignarlo, empezara cuando
-- empezara. La decisión: cada semana se abre sola N días antes de empezar, y N
-- es del coach.
--
--   · `coaches.auto_publish_days_before`: N. ANULABLE sin default de columna —
--     el defecto es MÉTODO y vive como dato en
--     `shared/domain/coach/week-publishing.ts` (DECISIONS 2026-08-09). NULL =
--     «el defecto»; un coach que no toca nada se comporta como hoy (el sábado
--     antes del lunes = 2 días).
--   · RETENER una semana NO es una columna nueva: ya existe. `weekly_plans` en
--     `draft` + `delivery_mode = 'manual'` es exactamente «oculta hasta que el
--     coach la publique»: lo que escriben «Crear en borrador», el alta, el MCP
--     `unpublish_week` y ahora el botón «Retener». Una segunda columna `held`
--     sería otra forma de decir lo mismo, y dos formas de decirlo acaban
--     diciendo cosas distintas. Se reescribe el comentario de la columna.
--   · Índice parcial para el cron diario (solo borradores automáticos).
--
-- ADITIVA E IDEMPOTENTE.

begin;

alter table coaches add column if not exists auto_publish_days_before smallint;

alter table coaches drop constraint if exists coaches_auto_publish_days_before_chk;
alter table coaches add constraint coaches_auto_publish_days_before_chk
  check (auto_publish_days_before is null or auto_publish_days_before between 0 and 28);

create index if not exists weekly_plans_auto_publish_idx
  on weekly_plans (week_start)
  where status = 'draft' and delivery_mode = 'scheduled';

comment on column coaches.auto_publish_days_before is
  '0217: cuántos días antes de empezar se abre sola una semana en borrador automático. NULL = defecto del producto (shared/domain/coach/week-publishing.ts). 0–28.';
comment on column weekly_plans.delivery_mode is
  'Solo cuenta en draft. scheduled = se publica sola N días antes de empezar (coaches.auto_publish_days_before, cron diario) | manual = RETENIDA: oculta hasta que el coach la publique (retener, borrador privado, MCP unpublish_week). 0075 + 0217.';

commit;

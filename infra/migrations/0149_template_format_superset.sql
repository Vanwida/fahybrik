-- 0149: add 'superset' to the template_format enum.
--
-- WHY
-- ---
-- `superset` joins the canonical format catalog
-- (shared/domain/prescription/format.ts) as `sets`'s pair: a block that
-- ROTATES its exercises (A1→A2→A1→A2) instead of running them in straight
-- sets, while still registering load per set the same way `sets` does (see
-- docs/DECISIONS.md 2026-08-05, "La superserie es un FORMATO de bloque, no un
-- nivel nuevo de anidamiento"). The legacy `templates.format` column is this
-- Postgres enum — adding the value keeps every storage path consistent and
-- prevents a latent reject if a superset-format block ever lands in that
-- table, same as every format the catalog has added since 0087.
--
-- ADDITIVE + idempotent: ADD VALUE IF NOT EXISTS touches nothing existing. The
-- value is NOT used within this migration (PG requires a committed enum value
-- before use), so the single-txn wrap the runner applies is safe on PG 12+.

alter type template_format add value if not exists 'superset';

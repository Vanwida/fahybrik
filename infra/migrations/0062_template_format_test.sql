-- 0062: add 'test' to the template_format enum.
--
-- WHY
-- ---
-- The Test archetype (UX pase 2026-06-25) is a first-class block type: a resolver
-- block (a fixed distance/time effort at RPE 10 whose result calculates the
-- athlete's zone profile). The editor classifies it with format 'test'. The v2
-- day-editor + session-template paths store the format in free JSONB / a text
-- column, but the legacy `templates.format` column is the Postgres enum
-- `template_format`; adding the value keeps every storage path consistent and
-- prevents a latent reject if a 'test'-format block ever lands in that table.
--
-- ADDITIVE + idempotent: ADD VALUE IF NOT EXISTS touches nothing existing. The
-- value is NOT used within this migration (PG requires a committed enum value
-- before use), so the single-txn wrap the runner applies is safe on PG 12+.

alter type template_format add value if not exists 'test';

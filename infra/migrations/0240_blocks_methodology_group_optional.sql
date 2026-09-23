-- 0240 — El grupo de metodología de un bloque pasa a ser OPCIONAL.
--
-- `methodology_groups` es una tabla GLOBAL con diez tipos de trabajo de UNA
-- escuela; `blocks.methodology_group_id` era NOT NULL y todo bloque nuevo nacía
-- en el grupo 1 («Fuerza Base») por defecto, fuera lo que fuera. Eso es método
-- cableado (CLAUDE.md, HARD RULE Nº0): otro coach clasifica distinto. Un bloque
-- ahora puede no tener grupo (NULL = sin clasificar); la FK se queda para los
-- que sí lo tienen. Ver DECISIONS 2026-09-23 «El grupo de metodología de un
-- bloque deja de ser obligatorio».
--
-- Idempotente: quitar un NOT NULL que ya no está no falla.

alter table blocks alter column methodology_group_id drop not null;

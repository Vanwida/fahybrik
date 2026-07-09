-- 0119_authored_coach_rename.sql
--
-- FAHYBRIK agnostico: el valor de autoria 'pablo' pasa a 'coach' generico. En 0048
-- las reglas y la nutricion de metodologia fijaron authored a
-- ('pablo','ai_suggested','system_default), donde 'pablo' significaba "lo escribio
-- el coach". El producto se vende a CUALQUIER coach, asi que el discriminador no
-- puede llevar un nombre propio: 'pablo' -> 'coach'.
--
-- Aditiva y segura. Orden importante: primero migramos las filas vivas, luego
-- cambiamos el CHECK (si no, el CHECK nuevo rechazaria las filas 'pablo' que quedan)
-- y por ultimo el default de nutricion (rules no tiene default a nivel DB: lo pone
-- la app via Zod). Idempotente (drop constraint if exists + update con WHERE).
--
-- El runner envuelve el fichero en UNA transaccion (sin begin/commit) y corta por
-- punto y coma: ningun literal de comentario lleva punto y coma.

-- Migrar filas existentes al nuevo valor
update methodology_rules set authored = 'coach' where authored = 'pablo';
update methodology_nutrition set authored = 'coach' where authored = 'pablo';

-- methodology_rules: swap del CHECK (no tiene default a nivel DB)
alter table methodology_rules drop constraint if exists methodology_rules_authored_chk;
alter table methodology_rules
  add constraint methodology_rules_authored_chk
  check (authored in ('coach', 'ai_suggested', 'system_default'));

-- methodology_nutrition: swap del CHECK + default -> 'coach'
alter table methodology_nutrition drop constraint if exists methodology_nutrition_authored_chk;
alter table methodology_nutrition
  add constraint methodology_nutrition_authored_chk
  check (authored in ('coach', 'ai_suggested', 'system_default'));
alter table methodology_nutrition alter column authored set default 'coach';

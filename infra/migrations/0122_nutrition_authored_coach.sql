-- 0122_nutrition_authored_coach.sql
--
-- Completa 0119 (agnóstico: 'pablo' -> 'coach'). La 0119 que corrió en demo y
-- prod solo cubrió methodology_rules; methodology_nutrition_rules quedó con el
-- CHECK y el DEFAULT antiguos con nombre propio. (Una variante paralela de 0119
-- apuntaba a una tabla inexistente 'methodology_nutrition' y nunca corrió.)
-- Verificado en vivo 12-jul: ambas BDs con CHECK ('pablo',...) y default
-- 'pablo'::text; 0 filas con authored='pablo', así que el UPDATE es red de
-- seguridad, no migración de datos.
--
-- Idempotente (drop constraint if exists + update con WHERE). El runner envuelve
-- el fichero en UNA transacción y corta por punto y coma: ningún literal de
-- comentario lleva punto y coma.

-- Red de seguridad: migrar cualquier fila que quedara con el valor antiguo
update methodology_nutrition_rules set authored = 'coach' where authored = 'pablo';

-- Swap del CHECK al vocabulario agnóstico
alter table methodology_nutrition_rules drop constraint if exists methodology_nutrition_authored_chk;
alter table methodology_nutrition_rules
  add constraint methodology_nutrition_authored_chk
  check (authored in ('coach', 'ai_suggested', 'system_default'));

-- Default agnóstico
alter table methodology_nutrition_rules alter column authored set default 'coach';

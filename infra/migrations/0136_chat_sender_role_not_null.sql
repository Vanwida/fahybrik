-- 0136: `chat_messages.sender_role` pasa a ser obligatorio.
--
-- (Numeración: 0135 es la más alta de esta rama → esta es la 0136. El runner
-- journaliza por nombre de fichero, así que una colisión de prefijo con otra rama
-- en vuelo es inocua.)
--
-- POR QUÉ
-- -------
-- Quién escribió un mensaje es EL dato del que cuelga todo lo demás: de qué lado
-- se pinta la burbuja, a quién se le suma el contador de no leídos, a quién se le
-- manda el push y qué mensajes se marcan como leídos al abrir el hilo. La 0082
-- añadió la columna y rellenó el histórico, pero la dejó anulable — así que cada
-- consulta que necesita el rol lo re-deriva con un `coalesce(...) case when
-- sender_user_id = coaches.user_id then 'coach' else 'athlete' end` y su join.
--
-- Esa derivación es exactamente lo que la 0082 vino a matar: MIENTE cuando el
-- coach es también su propio atleta (la cuenta de dogfood), porque ahí el
-- `user_id` es el mismo por los dos lados y no distingue nada. Mantenerla viva
-- "por si acaso" significa arrastrar la mentira en cuatro sitios distintos y que
-- cualquier consulta nueva pueda olvidarse del join y romper la atribución.
--
-- QUÉ
-- ---
-- Rellenar lo que quedara suelto y declarar la invariante en la base de datos, que
-- es el único sitio donde no se puede olvidar. A partir de aquí toda consulta lee
-- `sender_role` a pelo, sin join y sin fallback.
--
-- Los dos únicos caminos de escritura (`sendMessage` en web/lib/chat/service.ts y
-- el import histórico) ya lo escriben siempre, así que el backfill de abajo debería
-- afectar a CERO filas. Se deja igualmente: es idempotente y es lo que hace segura
-- la restricción.

begin;

-- Red de seguridad: cualquier fila anterior a la 0082 que se escapara del backfill.
-- El caso ambiguo (coach que es su propio atleta) cae en 'athlete', que es como lo
-- resolvió la 0082 — ahí el histórico es data de prueba escrita por el atleta.
update chat_messages m
   set sender_role = case
         when c.user_id is distinct from a.user_id and m.sender_user_id = c.user_id
           then 'coach'
         else 'athlete'
       end
  from chat_threads t
  join coaches c on c.id = t.coach_id
  join athletes a on a.id = t.athlete_id
 where t.id = m.thread_id
   and m.sender_role is null;

alter table chat_messages
  alter column sender_role set not null;

commit;

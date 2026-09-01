-- 0158_microcycle_source_lineage.sql
--
-- DE QUÉ PLANTILLA VIENE UN MICROCICLO YA ASIGNADO.
--
-- El problema. `instantiateWeekIntoMicrocycle` materializa un `program_week_templates`
-- para un atleta concreto -- copia sus bloques a `templates`+`template_segments` y
-- crea las `workout_assignments` de la semana. Es una copia de un solo instante: en
-- ningún sitio queda escrito DE QUÉ plantilla salió. Si el coach edita esa plantilla
-- después -- una nota, una dosis, un ejercicio -- no hay forma de encontrar qué
-- microciclos ya asignados hay que refrescar. La edición se guarda bien en la
-- plantilla y nunca llega al atleta, sin ningún aviso de que se ha quedado a medias
-- (Alex, 7-ago: escribió una nota para un ejercicio ya asignado y no llegó nunca).
--
-- Lo que añade esta migración. Una columna de LINAJE, no de configuración: de qué
-- `program_week_templates` se materializó por última vez este microciclo. Nullable
-- a propósito -- un microciclo creado por otra vía (entreno libre suelto, import
-- legacy) no viene de ninguna plantilla y eso es una verdad válida, no un hueco que
-- rellenar. `on delete set null`: borrar la plantilla no debe poder borrar ni
-- bloquear el microciclo del atleta, que ya vive de su propia copia.
--
-- Qué NO hace esta migración: no resincroniza nada por sí sola. Solo dej a
-- constancia del origen para que el código de resincronización (que sí toca en el
-- mismo lote) sepa a qué microciclos avisar.
--
-- Idempotente. Aditiva: ninguna fila existente cambia de significado -- todo
-- microciclo ya creado queda con el origen en null hasta la próxima vez que se
-- resincronice o se cree uno nuevo.

begin;

alter table microcycles
  add column if not exists source_week_template_id bigint
  references program_week_templates(id) on delete set null;

create index if not exists microcycles_source_week_template_idx
  on microcycles (source_week_template_id)
  where source_week_template_id is not null;

commit;

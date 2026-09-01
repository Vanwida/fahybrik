-- 0165: audit_log.channel — POR DÓNDE entró la escritura.
--
-- El registro de autoría (0114) contesta QUIÉN hizo qué: un actor = (kind,
-- user_id). Con el conector MCP del coach (docs/mcp-conector-coach.html) aparece
-- una pregunta nueva que ninguna columna sabe contestar: **desde qué superficie**.
-- El mismo coach, con el mismo user_id y el mismo kind 'coach', ahora puede tocar
-- el plan de un atleta desde el panel o dictándoselo a su asistente. Cuando
-- mañana pregunte «¿esto lo cambié yo desde el chat o desde el dashboard?», la
-- respuesta tiene que estar en la fila, no en la memoria de nadie.
--
-- POR QUÉ UNA COLUMNA Y NO UN CAMPO EN `diff_json`: el canal se CONSULTA (filtrar
-- el historial por origen, contar cuánto se usa el conector antes de cobrarlo como
-- add-on), y un jsonb no es donde vive algo que se filtra. Y porque el canal es
-- una propiedad de la ESCRITURA, igual que el actor: nada que ver con el diff.
--
-- SIN CHECK A PROPÓSITO. Los canales son nuestras superficies y van a crecer
-- (iOS del atleta, cron, importador). Un enum o un check obligaría a una
-- migración por superficie nueva y, peor, convertiría el estreno de una
-- superficie en un error en runtime. El portón es el tipo `AuditChannel` de
-- `web/lib/audit/record-edit.ts`, que es por donde pasa TODA escritura del log.
--
-- DEFAULT 'dashboard': las 100% de filas de hoy salieron del panel del coach, y
-- todo lo que escriba sin declarar canal sigue siendo el panel. Así el conector
-- es lo único que tiene que declararse, que es exactamente lo que se quiere
-- distinguir. Aditiva e idempotente; el runner envuelve en una transacción.

begin;

alter table audit_log
  add column if not exists channel text not null default 'dashboard';

comment on column audit_log.channel is
  '0165: la superficie por la que entró la escritura — "dashboard" (panel del coach, el defecto), "mcp" (conector del coach en su asistente). Sin check: los valores los fija AuditChannel en web/lib/audit/record-edit.ts.';

-- «Qué se ha tocado desde el asistente, lo último primero» — la consulta del
-- historial por origen. Va con created_at porque el canal solo se pregunta
-- ordenado en el tiempo, nunca suelto.
create index if not exists audit_log_channel_idx
  on audit_log (channel, created_at desc);

commit;

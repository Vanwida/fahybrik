-- 0140 — attachment_meta llegó doble-codificado: un string JSON dentro del jsonb.
--
-- El insert de chat hacía JSON.stringify antes de pasar el parámetro y postgres.js
-- serializa el VALOR JS que le das: un string se convierte en un string JSON
-- ("{\"size_bytes\":...}"), no en un objeto. El dashboard lo toleraba (solo lo usa
-- para el aspect-ratio); el iOS no: su decode espera un objeto, falla el mensaje
-- ENTERO y el descarte silencioso (@LossyArray / SSE nil) hacía desaparecer todo
-- mensaje con adjunto de la app. Misma enfermedad ya anotada como deuda en
-- notifications.payload_json.
--
-- Reparación en sitio: des-envolver el string una vez. Idempotente (la condición
-- jsonb_typeof = 'string' deja de cumplirse tras la primera pasada). El insert
-- queda arreglado en web/lib/chat/service.ts (client.json en vez de stringify).

update chat_messages
set attachment_meta = (attachment_meta #>> '{}')::jsonb
where attachment_meta is not null
  and jsonb_typeof(attachment_meta) = 'string';

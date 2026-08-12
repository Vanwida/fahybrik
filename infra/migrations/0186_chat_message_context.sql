-- 0186_chat_message_context.sql
--
-- CONTEXTO TIPADO de un mensaje de chat. Ver docs/DECISIONS.md, 2026-08-12
-- "El chat aprende SOBRE QUE va el mensaje".
--
-- Columnas planas y nullables en chat_messages -- NO un objeto JSON, NO una
-- tabla nueva: sigue habiendo UN chat (2026-07-26 "El chat es UNO"). Esto es
-- una ANOTACION del mensaje, no una entidad propia.
--
--   context_kind  -- 'session' | 'exercise' | 'race'.
--   context_ref   -- el ancla NAVEGABLE, como texto:
--                    session  -> workout_assignments.id
--                    exercise -> exercises.id (el catalogo, en abstracto)
--                    race     -> races.id
--   context_sub   -- SOLO con kind='session': template_segments.id del
--                    ejercicio DENTRO de esa sesion ("el back squat DE ese
--                    entreno"). Null = el entreno entero.
--   context_label -- el sello legible, CONGELADO en el momento de enviar.
--                    Lo deriva el SERVIDOR (web/lib/chat/context.ts), que ya
--                    carga la entidad para validar la propiedad -- el cliente
--                    NUNCA lo manda. Se congela porque "hoy"/"ayer" en un
--                    mensaje de la semana pasada seria mentira al releerlo.
--
-- Los tres (kind/ref/label) van juntos o ninguno; sub SOLO acompana a
-- kind='session'. Aditivo, nullable, sin default de columna: null es "sin
-- contexto", el comportamiento de siempre -- un coach que no usa esto no
-- nota el cambio. Idempotente (add column/constraint if not exists). El
-- runner envuelve el fichero en UNA transaccion (sin begin/commit aqui).

alter table chat_messages
  add column if not exists context_kind text,
  add column if not exists context_ref text,
  add column if not exists context_sub text,
  add column if not exists context_label text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_context_kind_chk'
  ) then
    alter table chat_messages add constraint chat_messages_context_kind_chk
      check (context_kind is null or context_kind in ('session', 'exercise', 'race'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_context_all_or_none_chk'
  ) then
    alter table chat_messages add constraint chat_messages_context_all_or_none_chk
      check (
        (context_kind is null and context_ref is null and context_label is null)
        or (context_kind is not null and context_ref is not null and context_label is not null)
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_context_sub_session_chk'
  ) then
    alter table chat_messages add constraint chat_messages_context_sub_session_chk
      check (context_sub is null or context_kind = 'session');
  end if;
end $$;

comment on column chat_messages.context_kind is
  'Sobre que va el mensaje: session (un entreno) | exercise (un ejercicio del catalogo) | race (una carrera). Null = sin contexto -- comportamiento de siempre.';
comment on column chat_messages.context_ref is
  'El ancla navegable, como texto: session->workout_assignments.id, exercise->exercises.id, race->races.id. Propiedad SIEMPRE validada contra el atleta dueno del hilo (o su coach, para exercise) por web/lib/chat/context.ts antes de escribir -- inexistente y ajeno reciben la MISMA respuesta.';
comment on column chat_messages.context_sub is
  'SOLO con context_kind=session: template_segments.id del ejercicio DENTRO de esa sesion ("el back squat DE ese entreno"). Null = el entreno entero, sin acotar a un ejercicio.';
comment on column chat_messages.context_label is
  'Sello legible CONGELADO en el momento de enviar, derivado por el servidor (web/lib/chat/context.ts) -- el cliente nunca lo escribe. "hoy"/"ayer" no se congelan: la fecha real, siempre.';

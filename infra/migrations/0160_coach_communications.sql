-- 0160_coach_communications.sql
--
-- EL COMUNICADO DEL COACH (docs/DECISIONS.md, 2026-08-09 "El comunicado del
-- coach: la comunicacion estructurada es una entidad, no chat").
--
-- La frontera con el chat es la razon entera de que estas tablas existan: el
-- chat CONVERSA (dos voces, un hilo, sin estado) y un comunicado se PUBLICA y
-- se RASTREA. Hoy todo lo que el coach entrega fuera de una sesion viaja por
-- `chat_messages.body` — texto plano, sin tipo, sin fecha limite y sin forma de
-- saber si se hizo. El coach no necesita saber que lo leiste; necesita saber si
-- lo hiciste.
--
-- MECANISMO vs METODO (CLAUDE.md, HARD RULE Nº0): los cinco tipos, las siete
-- anclas y el ciclo de vida son MECANISMO y viven aqui, en el esquema. Lo que el
-- coach escribe dentro (los pasos de SU calentamiento, las opciones de SU
-- pregunta, el porque de SU plan) es su METODO y es dato — filas, nunca CHECKs.
--
-- LAS CUATRO TABLAS
-- -----------------
--   coach_communications        el comunicado: tipo x ancla x ciclo de vida
--   coach_communication_items   los pasos de un protocolo | las opciones de una
--                               pregunta | las secciones de una nota (una sola
--                               tabla hija: las tres son una lista ORDENADA de
--                               contenido del coach, y separarlas en tres seria
--                               el mismo modelo escrito tres veces)
--   ..._recipients              el estado POR ATLETA (visto / hecho / respondido)
--   ..._item_marks              los pasos marcados uno a uno por ese atleta
--
-- Los CHECKs de forma dicen lo que un tipo ES, no como se entrena: solo una
-- tarea tiene fecha limite, solo un protocolo tiene nota final, solo una
-- pregunta bloquea, y un foco no caduca nunca (es su definicion — "lo que no se
-- te puede olvidar"). Lo que exige cada tipo para poder publicarse (un protocolo
-- con >=1 paso, una pregunta con 2..4 opciones) se valida en el servidor, donde
-- se puede mirar la tabla hija y devolver un error que el coach entiende.
--
-- Aditivo. No toca ninguna tabla existente. El runner envuelve el fichero en UNA
-- transaccion (sin begin/commit aqui). Ningun comentario lleva punto y coma.

create table if not exists coach_communications (
  id            bigint      generated always as identity primary key,
  coach_id      bigint      not null references coaches(id) on delete cascade,
  kind          text        not null,
  title         text        not null,
  -- El cuerpo cambia de papel segun el tipo, y por eso es UNA columna y no
  -- cuatro: contexto de la pregunta, porque de la tarea o del foco, intro de la
  -- nota. En un protocolo puede ir vacio (el contenido son los pasos).
  body          text,
  -- Solo el protocolo: lo que el coach quiere que leas DESPUES del ultimo paso.
  final_note    text,
  anchor_kind   text        not null default 'general',
  -- A que entidad concreta cuelga (id de asignacion, de test, de carrera…).
  -- Texto libre a proposito: el ancla apunta a siete tablas distintas y una FK
  -- por ancla seria siete columnas nulas de las que solo una vive.
  anchor_ref    text,
  due_date      date,
  expires_at    timestamptz,
  -- Una pregunta que BLOQUEA: hay algo del plan que no se cierra sin respuesta.
  blocks        boolean     not null default false,
  is_template   boolean     not null default false,
  status        text        not null default 'draft',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint coach_communications_kind_chk
    check (kind in ('protocol', 'question', 'task', 'note', 'focus')),
  constraint coach_communications_anchor_kind_chk
    check (anchor_kind in ('plan', 'week', 'session', 'test', 'race', 'checkin', 'general')),
  constraint coach_communications_status_chk
    check (status in ('draft', 'published', 'archived')),
  constraint coach_communications_title_chk check (length(btrim(title)) > 0),
  -- Un comunicado que no cuelga de nada no tiene a que apuntar.
  constraint coach_communications_anchor_ref_chk
    check (anchor_kind <> 'general' or anchor_ref is null),
  constraint coach_communications_due_date_chk check (due_date is null or kind = 'task'),
  constraint coach_communications_final_note_chk check (final_note is null or kind = 'protocol'),
  constraint coach_communications_blocks_chk check (blocks = false or kind = 'question'),
  -- El foco es persistente por definicion: si caducara seria una nota.
  constraint coach_communications_focus_never_expires_chk
    check (expires_at is null or kind <> 'focus'),
  -- `published_at` es la fecha en que SALIO, no un espejo del estado: un
  -- comunicado archivado la conserva. Lo que no puede pasar es que un borrador
  -- la tenga, ni que algo publicado no la tenga.
  constraint coach_communications_published_at_chk
    check ((status = 'draft') = (published_at is null)),
  -- Una plantilla es un molde guardado, no algo que se manda: se publica una
  -- COPIA suya. Sin esto una plantilla acabaria con destinatarios propios.
  constraint coach_communications_template_chk
    check (is_template = false or status <> 'published')
);

comment on table coach_communications is
  'El comunicado del coach al atleta fuera del chat — docs/DECISIONS.md 2026-08-09. tipo (protocol|question|task|note|focus) x ancla (donde aflora en la app) x ciclo de vida (draft -> published -> archived). is_template = molde guardado en la biblioteca del coach, nunca se publica el mismo (se publica una copia).';

create index if not exists coach_communications_coach_idx
  on coach_communications (coach_id, is_template, status, published_at desc);

create table if not exists coach_communication_items (
  id                bigint      generated always as identity primary key,
  communication_id  bigint      not null references coach_communications(id) on delete cascade,
  position          int         not null,
  -- La marca temporal del paso ("-40'") o la cabecera de la seccion. Las
  -- opciones de una pregunta no llevan (su texto ES la opcion).
  label             text,
  content           text        not null,
  -- Solo en las opciones de una pregunta: que pasa si eliges esta. Sin esto la
  -- pregunta es una encuesta a ciegas.
  consequence       text,
  created_at        timestamptz not null default now(),
  constraint coach_communication_items_uq unique (communication_id, position),
  constraint coach_communication_items_position_chk check (position >= 1),
  constraint coach_communication_items_content_chk check (length(btrim(content)) > 0)
);

comment on table coach_communication_items is
  'Lista ORDENADA de contenido dentro de un comunicado: pasos de un protocolo, opciones de una pregunta o secciones de una nota. Una tabla y no tres porque las tres son lo mismo — contenido del coach con un orden que significa algo. position empieza en 1.';

create table if not exists coach_communication_recipients (
  id                bigint      generated always as identity primary key,
  communication_id  bigint      not null references coach_communications(id) on delete cascade,
  athlete_id        bigint      not null references athletes(id) on delete cascade,
  -- El ciclo de vida POR ATLETA. `seen_at` no es el final de nada: es el paso
  -- intermedio que hoy la app confunde con el final (un push abierto no es una
  -- tarea cerrada).
  seen_at           timestamptz,
  done_at           timestamptz,
  answered_item_id  bigint      references coach_communication_items(id) on delete set null,
  answered_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint coach_communication_recipients_uq unique (communication_id, athlete_id),
  -- Se responde con una opcion o no se responde: media respuesta no existe.
  constraint coach_communication_recipients_answer_chk
    check ((answered_item_id is null) = (answered_at is null))
);

comment on table coach_communication_recipients is
  'Estado de UN comunicado para UN atleta: visto, hecho, respondido. Es la fila que convierte un push perdido en una bandeja — sin esto el coach no sabe si el protocolo se hizo, solo si el aviso se abrio.';

create index if not exists coach_communication_recipients_athlete_idx
  on coach_communication_recipients (athlete_id);

create table if not exists coach_communication_item_marks (
  id            bigint      generated always as identity primary key,
  recipient_id  bigint      not null references coach_communication_recipients(id) on delete cascade,
  item_id       bigint      not null references coach_communication_items(id) on delete cascade,
  done_at       timestamptz not null default now(),
  constraint coach_communication_item_marks_uq unique (recipient_id, item_id)
);

comment on table coach_communication_item_marks is
  'Los pasos de un protocolo marcados uno a uno por el atleta. La fila EXISTE = ese paso esta hecho (desmarcar borra la fila). El done_at del destinatario se deriva de aqui: un protocolo esta hecho cuando lo estan todos sus pasos.';

-- El aviso que sale al publicar. `add value` no reescribe filas ni invalida
-- indices, solo amplia lo aceptado, y `if not exists` lo hace idempotente. Neon
-- corre Postgres 15+, donde se permite dentro de una transaccion siempre que el
-- valor nuevo no se USE en esa misma transaccion — aqui no se usa.
alter type notification_type add value if not exists 'coach_communication';

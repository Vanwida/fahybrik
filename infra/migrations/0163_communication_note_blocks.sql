-- 0163_communication_note_blocks.sql
--
-- LA SECCION DE UNA NOTA TIENE FORMA, Y EL CAMINO NO SE TECLEA
-- (docs/DECISIONS.md, 2026-08-09 "El comunicado del coach" — tanda de fidelidad
-- al diseno aceptado del doble, `screens/coach-nota/bloques.tsx`).
--
-- EL HUECO
-- --------
-- La 0160 dio por hecho que una seccion de nota es SIEMPRE un parrafo: cabecera
-- + texto. El briefing real que el coach escribe no lo es. Dentro de la misma
-- nota conviven tres cosas que se leen en tres momentos distintos:
--
--   · una CIFRA — "1:15 a 1:18", el numero que el atleta viene a buscar y que va
--     a comparar con otro dentro de tres meses
--   · un REPARTO — "3 duras, 2 moderadas y 1 de absorcion", que es una PROPORCION
--     y por eso se lee de un vistazo en una barra, no contando palabras
--   · el CAMINO — por donde va a pasar en las proximas semanas
--
-- Metidas las tres en el mismo parrafo gris, la del medio no se encuentra en
-- octubre sin releer las otras dos. Con forma propia, cada una se encuentra sola.
--
-- LO QUE ANADE, Y POR QUE ASI
-- ---------------------------
-- 1) `display` en el ITEM (no en el comunicado): la forma es de la SECCION, no
--    de la nota — una nota mezcla las cuatro. Es la misma leccion que la 0162 con
--    `checkable`: no volver a atar "lo que una pieza pide" al tipo del padre.
--
-- 2) `coach_communication_item_segments`: los pares valor+etiqueta de un reparto.
--    Tabla hija y no un jsonb porque son filas ORDENADAS con dos campos escritos
--    por el coach, exactamente como los items — y porque una analitica futura
--    ("cuanto reparte este coach en duras") las quiere como filas.
--    NO llevan color: el color de un segmento se deriva de su posicion (ver
--    web/components/plan-espina). Un catalogo de intensidades cableado seria el
--    vocabulario de UN entrenador dentro del producto (HARD RULE Nº0).
--
-- 3) `linked_communication_id`: el enlace cruzado. Un briefing que deja una
--    decision abierta lo DICE y enlaza a ella, en vez de dejar que se pierda en
--    otra pantalla. Columna y no tabla: un comunicado enlaza a UNO — si enlazara
--    a varios dejaria de ser "lo que le falta a esto para cerrarse" y seria un
--    indice.
--
-- EL CAMINO NO SE GUARDA: SE RESUELVE
-- -----------------------------------
-- Una seccion `camino` no tiene contenido tecleado. Es un EMBED: al servirla, el
-- servidor resuelve la espina del plan REAL de ESE atleta (sus microciclos en
-- orden, con las semanas que ocupa cada uno y donde esta hoy) y la adjunta. Si
-- se guardara el texto, el dia que el coach le cambie el plan la nota seguiria
-- contando el plan viejo — que es exactamente el fallo que la entidad venia a
-- resolver.
--
-- Por eso `content` deja de ser obligatorio en las formas que no se teclean
-- (`reparto` es sus segmentos, `camino` es el embed). La restriccion se RELAJA:
-- ninguna fila existente puede violar la nueva, y obligar a un texto de relleno
-- seria guardar un dato que nadie escribio.
--
-- Aditivo. No cambia el comportamiento de ninguna fila existente: `display`
-- nace en 'texto', que es lo unico que habia. Idempotente. El runner envuelve el
-- fichero en UNA transaccion (sin begin/commit aqui).

-- =============================================================================
-- 1 · La forma de una seccion
-- =============================================================================

alter table coach_communication_items
  add column if not exists display text not null default 'texto';

alter table coach_communication_items
  drop constraint if exists coach_communication_items_display_chk;

alter table coach_communication_items
  add constraint coach_communication_items_display_chk
  check (display in ('texto', 'cifra', 'reparto', 'camino'));

comment on column coach_communication_items.display is
  'Como se pinta esta seccion de NOTA: texto (parrafo) | cifra (el numero grande en mono, con su pie en label) | reparto (la barra de proporcion, sus pares en coach_communication_item_segments) | camino (embed: el servidor resuelve la espina del plan del atleta al servirla). Solo significa algo en una nota — en los pasos de un protocolo y en las opciones de una pregunta es inerte y vale texto.';

-- Las dos formas que NO se teclean: un reparto ES sus segmentos y un camino ES
-- el plan del atleta. Obligarlas a llevar texto guardaria un relleno que nadie
-- escribio. Solo relaja: ninguna fila existente puede violarla.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_content_chk;

alter table coach_communication_items
  add constraint coach_communication_items_content_chk
  check (length(btrim(content)) > 0 or display in ('reparto', 'camino'));

-- =============================================================================
-- 2 · Los segmentos de un reparto
-- =============================================================================

create table if not exists coach_communication_item_segments (
  id          bigint      generated always as identity primary key,
  item_id     bigint      not null references coach_communication_items(id) on delete cascade,
  position    int         not null,
  -- Cuanto pesa este segmento en la barra, en la unidad que el coach eligio
  -- (sesiones, semanas, series). La unidad no se guarda porque la dice su
  -- etiqueta: "3 duras" ya dice que son tres sesiones duras.
  value_num   numeric     not null,
  label       text        not null,
  created_at  timestamptz not null default now(),
  constraint coach_communication_item_segments_uq unique (item_id, position),
  constraint coach_communication_item_segments_position_chk check (position >= 1),
  -- Un segmento de peso cero no es un segmento: es una parte que no existe, y en
  -- una barra de proporcion ocuparia un hueco mintiendo.
  constraint coach_communication_item_segments_value_chk check (value_num > 0),
  constraint coach_communication_item_segments_label_chk check (length(btrim(label)) > 0)
);

comment on table coach_communication_item_segments is
  'Los pares valor+etiqueta de una seccion con display = reparto ("3 duras", "2 moderadas", "1 de absorcion"). Filas ordenadas y no un jsonb: son contenido escrito por el coach con un orden que significa algo, igual que los items. Sin color: el color de cada segmento se deriva de su posicion, porque un catalogo de intensidades seria el vocabulario de UN entrenador.';

create index if not exists coach_communication_item_segments_item_idx
  on coach_communication_item_segments (item_id, position);

-- =============================================================================
-- 3 · El enlace cruzado
-- =============================================================================

alter table coach_communications
  add column if not exists linked_communication_id bigint
    references coach_communications(id) on delete set null;

-- Enlazarse a si mismo es un bucle que la pantalla dibujaria como una llamada a
-- la accion hacia ninguna parte.
alter table coach_communications
  drop constraint if exists coach_communications_linked_self_chk;

alter table coach_communications
  add constraint coach_communications_linked_self_chk
  check (linked_communication_id is distinct from id);

comment on column coach_communications.linked_communication_id is
  'El comunicado al que este apunta: la pregunta que le falta a un briefing para cerrarse, o la nota de la que sale una tarea. Que sea del MISMO coach y no este archivado lo valida el servidor, donde el error se puede decir. Al atleta el enlace solo viaja si el tambien es destinatario del enlazado — si no, veria que existe algo que no es suyo. `on delete set null`: borrar un borrador enlazado deja la nota sin enlace, nunca huerfana.';

create index if not exists coach_communications_linked_idx
  on coach_communications (linked_communication_id)
  where linked_communication_id is not null;

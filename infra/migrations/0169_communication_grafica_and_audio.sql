-- 0169_communication_grafica_and_audio.sql
--
-- LA GRAFICA FIRMADA, Y LA VOZ QUE LA EXPLICA
-- (docs/design/zonas-feedback-model.html §5B y §5D — la tanda 2 de «zonas +
-- feedback», sobre el motor de la 0168.)
--
-- EL HUECO
-- --------
-- El coach mira la grafica de tiempo en zonas de un atleta, ve una sierra de
-- diez semanas y quiere DECIRSELO. Hoy eso acaba en un pantallazo con un circulo
-- rojo a mano por WhatsApp: no se puede volver a pintar, ni buscar, ni saber si
-- el atleta lo ha leido, y a los tres meses no existe. La grafica no es el
-- entregable — el entregable es la grafica FIRMADA.
--
-- LO QUE ANADE, Y POR QUE ASI
-- ---------------------------
-- 1) Una quinta FORMA de seccion, `grafica`, y no un sexto tipo de comunicado.
--    Los tipos son cinco y cerrados (protocol, question, task, note, focus); un
--    «feedback» partiria el modelo en «nota» y «nota con datos» y duplicaria
--    bandeja, senales y seguimiento para contar lo mismo. Lo que cambia no es el
--    tipo, es la forma de UNA seccion — la misma leccion de la 0163.
--
-- 2) Igual que `camino`, la grafica NO SE GUARDA: SE RESUELVE. Lo que se guarda
--    es la CONFIG (que ventana, que filtro, que rangos marco el coach) y el
--    servidor la dibuja con los segundos por zona de ESE atleta al servirla. Si
--    se guardaran las barras, la nota seguiria contando los datos del dia que se
--    escribio aunque despues llegara el entreno que faltaba o se recomputara el
--    historico con un umbral medido.
--
-- 3) LA VENTANA ES ABSOLUTA, Y POR ESO SE GUARDA SU PRIMERA SEMANA.
--    `grafica_week_start` + `grafica_weeks` fijan un periodo del calendario, no
--    «los ultimos seis meses». Dos razones, y las dos son de correctitud:
--      · Los RANGOS que marca el coach son fechas absolutas. Una ventana que se
--        derivara de la fecha de publicacion se desplazaria si el comunicado se
--        guarda como borrador y se publica la semana siguiente, y el rango mas
--        viejo se quedaria FUERA de su propia grafica.
--      · Solo con la primera semana dentro del dato se puede validar «el rango
--        cae dentro de la ventana» en el mismo zod que corre en el navegador y
--        en el servidor. Derivada, esa comprobacion dependeria del reloj y daria
--        resultados distintos en cada punta.
--    Efecto buscado: el feedback habla de un periodo concreto y el atleta que lo
--    abre en octubre ve exactamente la misma historia que el coach firmo.
--
-- 4) UN RANGO ES UN SEGMENTO. Reusa `coach_communication_item_segments` (0163)
--    en vez de una tabla nueva: las dos cosas son la misma lista ORDENADA de
--    marcas que el coach escribe colgando de una seccion, y partirlas obligaria
--    a leer dos tablas hijas para pintar una nota. Lo que cambia es que un rango
--    no pesa —tiene desde, hasta y tono—, asi que `value_num` pasa a opcional y
--    un CHECK impide la fila hibrida que no significa nada.
--    El TONO es vocabulario cerrado de tres (atencion, bien, neutro) y es
--    MECANISMO: es la forma de marcar, no una escala de calidad. Que reparto de
--    zonas esta bien lo dice el coach con su etiqueta, no el sistema con un
--    color (HARD RULE Nº0).
--
-- 5) EL AUDIO va en el COMUNICADO y no en la seccion: es el «ahora te hago un
--    podcast» del entrenador, uno por comunicado y de cualquiera de los cinco
--    tipos. En la seccion serian cinco audios sueltos dentro de una nota, que no
--    es lo que nadie graba.
--
-- Aditivo e idempotente. Ninguna fila existente puede violar nada de esto: las
-- columnas nuevas nacen nulas, el CHECK de `display` solo AMPLIA, el de
-- `content` solo RELAJA y el de los segmentos lo cumplen todos los repartos que
-- ya hay (llevan `value_num` y no llevan fechas). El runner envuelve el fichero
-- en UNA transaccion (sin begin/commit aqui).

-- =============================================================================
-- 1 · La quinta forma de una seccion
-- =============================================================================

alter table coach_communication_items
  drop constraint if exists coach_communication_items_display_chk;

alter table coach_communication_items
  add constraint coach_communication_items_display_chk
  check (display in ('texto', 'cifra', 'reparto', 'camino', 'grafica'));

comment on column coach_communication_items.display is
  'Como se pinta esta seccion de NOTA: texto (parrafo) | cifra (el numero grande en mono, con su pie en label) | reparto (la barra de proporcion, sus pares en coach_communication_item_segments) | camino (embed: el servidor resuelve la espina del plan del atleta al servirla) | grafica (embed: el servidor resuelve el tiempo en zonas de la ventana guardada, con los rangos marcados por el coach). Solo significa algo en una nota — en los pasos de un protocolo y en las opciones de una pregunta es inerte y vale texto.';

-- La grafica tampoco se teclea: es su config mas los datos del atleta. Solo
-- relaja el CHECK anterior, asi que ninguna fila existente puede violarlo.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_content_chk;

alter table coach_communication_items
  add constraint coach_communication_items_content_chk
  check (length(btrim(content)) > 0 or display in ('reparto', 'camino', 'grafica'));

-- =============================================================================
-- 2 · La config de la grafica
--
-- Las tres columnas solo significan algo cuando `display = 'grafica'`. En
-- cualquier otra forma llegan nulas y nadie las mira — igual que `checkable`
-- fuera de un protocolo (0162) y `display` fuera de una nota (0163). Van en
-- columnas y no en un jsonb porque son tres escalares que se consultan
-- ("cuantas notas mira 6 meses de correr") y porque un jsonb no admite CHECK.
-- =============================================================================

alter table coach_communication_items
  add column if not exists grafica_week_start date;

alter table coach_communication_items
  add column if not exists grafica_weeks int;

alter table coach_communication_items
  add column if not exists grafica_modality text;

comment on column coach_communication_items.grafica_week_start is
  'Solo con display = grafica: el LUNES de la primera semana de la ventana. Se guarda —en vez de derivarse de la fecha de publicacion— porque los rangos son fechas absolutas y una ventana movil los dejaria fuera si el comunicado se publica dias despues de escribirse. Null en el resto de formas.';

comment on column coach_communication_items.grafica_weeks is
  'Solo con display = grafica: cuantas semanas ocupa la ventana desde grafica_week_start, ambas inclusive. Null en el resto de formas.';

comment on column coach_communication_items.grafica_modality is
  'Solo con display = grafica: por que tipo de entreno se filtra el tiempo en zonas (run, row, ski, bike, strength, other), o null si es TODO. Texto y no enum: el vocabulario es el del tramo ejecutado (lib/sync/ingest-execution-segments) y lo valida el servidor, donde el error se puede decir.';

-- Una semana empieza en lunes en todo el producto, y la ventana no puede caer
-- en mitad de una: la agregacion de zonas trunca por semana, asi que un martes
-- guardado aqui dibujaria una primera barra a medias.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_grafica_monday_chk;

alter table coach_communication_items
  add constraint coach_communication_items_grafica_monday_chk
  check (grafica_week_start is null or extract(isodow from grafica_week_start) = 1);

-- Menos de un mes no es una tendencia (cuatro barras no dibujan nada que se
-- pueda firmar) y mas de un ano no cabe en una pantalla ni en el movil.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_grafica_weeks_chk;

alter table coach_communication_items
  add constraint coach_communication_items_grafica_weeks_chk
  check (grafica_weeks is null or (grafica_weeks >= 4 and grafica_weeks <= 56));

-- La config va ENTERA o no va: media config (semanas sin primera semana) no se
-- puede dibujar, y guardarla dejaria una seccion que el servidor no sabe servir.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_grafica_chk;

alter table coach_communication_items
  add constraint coach_communication_items_grafica_chk
  check (
    (grafica_week_start is null and grafica_weeks is null)
    or (grafica_week_start is not null and grafica_weeks is not null)
  );

-- =============================================================================
-- 3 · Un rango de semanas es un segmento
--
-- La misma tabla hija que los trozos de un reparto (0163): las dos son la lista
-- ORDENADA de marcas que el coach escribe colgando de una seccion, y la nota se
-- pinta leyendo una sola tabla. Lo que cambia es que un rango no PESA.
-- =============================================================================

-- Un trozo de reparto sigue exigiendo su peso; lo que deja de exigirse es que
-- TODA fila lo lleve. Quitar el `not null` no puede romper ninguna fila que ya
-- exista: todas lo tienen.
alter table coach_communication_item_segments
  alter column value_num drop not null;

alter table coach_communication_item_segments
  add column if not exists week_start date;

alter table coach_communication_item_segments
  add column if not exists week_end date;

alter table coach_communication_item_segments
  add column if not exists tone text;

comment on column coach_communication_item_segments.week_start is
  'Solo en un rango (segmento de una seccion grafica): el LUNES de la primera semana marcada. Null en un trozo de reparto.';

comment on column coach_communication_item_segments.week_end is
  'Solo en un rango: el LUNES de la ULTIMA semana marcada, ambas inclusive. Se guarda el lunes y no el domingo para que las tres fechas del modelo (la ventana y las dos puntas del rango) sean la misma cosa —el inicio de una semana— y compararlas no dependa de acordarse de sumar seis dias.';

comment on column coach_communication_item_segments.tone is
  'Solo en un rango: como lo marca el coach. atencion (algo que corregir) | bien (algo que sostener) | neutro (solo senalar). Vocabulario cerrado de TRES porque es la forma de marcar, no una escala de calidad: que reparto de zonas esta bien lo dice su etiqueta, no un color del sistema (HARD RULE Nº0).';

alter table coach_communication_item_segments
  drop constraint if exists coach_communication_item_segments_tone_chk;

alter table coach_communication_item_segments
  add constraint coach_communication_item_segments_tone_chk
  check (tone is null or tone in ('atencion', 'bien', 'neutro'));

-- Una semana no puede terminar antes de empezar. El caso de una sola semana
-- marcada es week_start = week_end, y es legitimo: una semana suelta se senala.
alter table coach_communication_item_segments
  drop constraint if exists coach_communication_item_segments_week_order_chk;

alter table coach_communication_item_segments
  add constraint coach_communication_item_segments_week_order_chk
  check (week_start is null or week_end is null or week_end >= week_start);

alter table coach_communication_item_segments
  drop constraint if exists coach_communication_item_segments_weeks_monday_chk;

alter table coach_communication_item_segments
  add constraint coach_communication_item_segments_weeks_monday_chk
  check (
    (week_start is null or extract(isodow from week_start) = 1)
    and (week_end is null or extract(isodow from week_end) = 1)
  );

-- O PESA O MARCA UN PERIODO, nunca las dos ni ninguna. Sin esto cabria la fila
-- hibrida —un trozo de reparto con fechas, un rango con peso— que ninguna
-- pantalla sabria dibujar y que nadie escribio a proposito. El CHECK antiguo de
-- `value_num > 0` se rehace aqui porque ahora solo aplica cuando hay valor: un
-- peso cero sigue sin ser un trozo, es una parte que no existe ocupando sitio.
alter table coach_communication_item_segments
  drop constraint if exists coach_communication_item_segments_value_chk;

alter table coach_communication_item_segments
  drop constraint if exists coach_communication_item_segments_shape_chk;

alter table coach_communication_item_segments
  add constraint coach_communication_item_segments_shape_chk
  check (
    (
      -- Trozo de un reparto
      value_num is not null and value_num > 0
      and week_start is null and week_end is null and tone is null
    )
    or (
      -- Rango de semanas sobre una grafica
      value_num is null
      and week_start is not null and week_end is not null and tone is not null
    )
  );

comment on table coach_communication_item_segments is
  'Las marcas ORDENADAS que cuelgan de una seccion, en sus dos formas: los pares valor+etiqueta de un reparto ("3 duras", "2 moderadas") y los rangos de semanas etiquetados de una grafica ("Sierra: todo a tope", semanas del 5 de mayo al 7 de julio). Filas y no un jsonb: son contenido escrito por el coach con un orden que significa algo, igual que los items. Un reparto no lleva color —se deriva de la posicion—; un rango lleva TONO, que es la forma de marcar y no una escala de calidad.';

-- =============================================================================
-- 4 · La voz que lo explica
--
-- Uno por comunicado y opcional, en cualquiera de los cinco tipos: la
-- explicacion hablada sobre la grafica es la mitad del valor del feedback, y hoy
-- vive en un audio de WhatsApp que nadie vuelve a encontrar.
-- =============================================================================

alter table coach_communications
  add column if not exists audio_url text;

alter table coach_communications
  add column if not exists audio_seconds int;

comment on column coach_communications.audio_url is
  'La nota de voz del coach, opcional y una sola. Es la URL de NUESTRO proxy autenticado (/api/communications/audio/<pathname>), nunca la del almacen: los bytes viven en un blob privado bajo la carpeta del COACH (comunicados/<coach_id>/…) y el proxy comprueba, antes de servir uno, que quien mira es el coach dueño o un atleta destinatario de un comunicado publicado que apunta a este audio. Bajo la carpeta del coach y no la de un atleta porque un comunicado se publica a VARIOS: en la carpeta de uno, los demas recibirian un 404.';

comment on column coach_communications.audio_seconds is
  'Cuanto dura el audio, en segundos enteros. Se guarda porque el reproductor tiene que poder decir «2:14» antes de descargar un solo byte, y porque la duracion es la unica pista de si es una frase o una explicacion.';

-- Los dos o ninguno: una duracion sin audio no es nada y un audio sin duracion
-- deja al reproductor sin poder rotularse.
alter table coach_communications
  drop constraint if exists coach_communications_audio_chk;

alter table coach_communications
  add constraint coach_communications_audio_chk
  check (
    (audio_url is null and audio_seconds is null)
    or (
      length(btrim(audio_url)) > 0
      and audio_seconds is not null and audio_seconds > 0
    )
  );

-- El proxy autoriza al atleta buscando el comunicado publicado que apunta a ESE
-- audio, asi que la busqueda por url es una lectura caliente por cada
-- reproduccion. Parcial: la inmensa mayoria de los comunicados no llevan audio.
create index if not exists coach_communications_audio_idx
  on coach_communications (audio_url)
  where audio_url is not null;

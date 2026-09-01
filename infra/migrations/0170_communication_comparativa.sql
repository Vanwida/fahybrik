-- 0170_communication_comparativa.sql
--
-- ANTES CONTRA AHORA — la comparativa por periodos
-- (docs/design/zonas-feedback-model.html §5C — la tanda 3 de «zonas +
-- feedback», sobre la forma `grafica` de la 0169 y el motor de la 0168.)
--
-- EL HUECO
-- --------
-- La peticion mas fina del coach, textual: «un feedback comparativo de los tres
-- meses previos contra los tres conmigo». Hoy eso no existe en ningun sitio: la
-- grafica de la 0169 dibuja UNA serie, y de una serie de veinticuatro barras
-- nadie deduce a ojo cuanto ha subido la base y cuanto ha bajado el techo. Lo que
-- el coach quiere decir no es «mira tu sierra», es «esto es lo que ha cambiado».
--
-- LO QUE ANADE, Y POR QUE ASI
-- ---------------------------
-- 1) Una SEXTA forma de seccion, `comparativa`, y no un campo mas de la grafica.
--    Son dos piezas distintas contando cosas distintas con la misma materia
--    prima: la grafica ensena la FORMA de una serie semana a semana y esto
--    ensena el SALDO de dos periodos enfrentados. Metidas en la misma forma, la
--    seccion tendria que llevar cinco columnas de las que solo tres significan
--    algo cada vez, y ninguna pantalla sabria cual esta mirando.
--
-- 2) Tampoco SE GUARDA: SE RESUELVE. Igual que el camino (0163) y la grafica
--    (0169), lo que se guarda es la CONFIG —que dos periodos y de que largo— y
--    el servidor la suma con los segundos por zona de ESE atleta al servirla. Si
--    se guardaran los totales, la nota seguiria contando lo que se sabia el dia
--    que se escribio aunque despues llegara el entreno que faltaba o se
--    recomputara el historico con un umbral medido.
--
-- 3) UN SOLO `compare_weeks` PARA LOS DOS LADOS, y esto es de correctitud, no de
--    ahorro de columnas. Catorce semanas le ganan a diez SIEMPRE: comparar dos
--    ventanas de distinta longitud haria que el titular («+18 horas») dijera que
--    el calendario es mas largo, no que el atleta entreno mas. Con la misma
--    longitud, las horas totales vuelven a ser comparables y el reparto en
--    porcentaje lo era ya. La alternativa —dos longitudes y comparar solo por
--    horas/semana— deja al coach firmando un numero que el atleta no puede
--    reconstruir de lo que ve.
--
-- 4) LAS FECHAS SON ABSOLUTAS Y NO SE SOLAPAN. Absolutas por la misma razon que
--    la ventana de la grafica: un comunicado escrito como borrador y publicado la
--    semana siguiente hablaria de otro periodo. Y sin solape porque las semanas
--    compartidas se contarian en los DOS lados a la vez, y el delta se comeria a
--    si mismo — el CHECK lo impide en la base y no en un `if` de una pantalla.
--
-- 5) LO QUE NO LLEVA: filtro por modalidad. La grafica lo tiene porque ahi se
--    mira «como corre»; aqui se mira «cuanto y de que color entrena», que es el
--    volumen entero. Se anadira el dia que alguien lo pida con un caso delante,
--    no antes.
--
-- Aditivo e idempotente. Ninguna fila existente puede violar nada de esto: las
-- tres columnas nacen nulas, el CHECK de `display` solo AMPLIA y el de `content`
-- solo RELAJA. El runner envuelve el fichero en UNA transaccion (sin
-- begin/commit aqui).

-- =============================================================================
-- 1 · La sexta forma de una seccion
-- =============================================================================

alter table coach_communication_items
  drop constraint if exists coach_communication_items_display_chk;

alter table coach_communication_items
  add constraint coach_communication_items_display_chk
  check (display in ('texto', 'cifra', 'reparto', 'camino', 'grafica', 'comparativa'));

comment on column coach_communication_items.display is
  'Como se pinta esta seccion de NOTA: texto (parrafo) | cifra (el numero grande en mono, con su pie en label) | reparto (la barra de proporcion, sus pares en coach_communication_item_segments) | camino (embed: el servidor resuelve la espina del plan del atleta al servirla) | grafica (embed: el servidor resuelve el tiempo en zonas de la ventana guardada, con los rangos marcados por el coach) | comparativa (embed: el servidor suma DOS periodos de la misma longitud y los sirve enfrentados). Solo significa algo en una nota — en los pasos de un protocolo y en las opciones de una pregunta es inerte y vale texto.';

-- Una comparativa tampoco se teclea: es su config mas los datos del atleta. Solo
-- relaja el CHECK anterior, asi que ninguna fila existente puede violarlo.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_content_chk;

alter table coach_communication_items
  add constraint coach_communication_items_content_chk
  check (
    length(btrim(content)) > 0
    or display in ('reparto', 'camino', 'grafica', 'comparativa')
  );

-- =============================================================================
-- 2 · La config de la comparativa
--
-- Tres escalares en columnas y no un jsonb, por lo mismo que la grafica: se
-- consultan ("cuantas notas comparan trimestres") y un jsonb no admite CHECK, que
-- es donde vive aqui la mitad del modelo.
-- =============================================================================

alter table coach_communication_items
  add column if not exists compare_a_start date;

alter table coach_communication_items
  add column if not exists compare_b_start date;

alter table coach_communication_items
  add column if not exists compare_weeks int;

comment on column coach_communication_items.compare_a_start is
  'Solo con display = comparativa: el LUNES de la primera semana del periodo ANTERIOR. Absoluta y no derivada de la publicacion, porque un borrador publicado dias despues hablaria de otro trozo de calendario. Null en el resto de formas.';

comment on column coach_communication_items.compare_b_start is
  'Solo con display = comparativa: el LUNES de la primera semana del periodo POSTERIOR. Empieza como muy pronto la semana siguiente al final de compare_a_start + compare_weeks, para que ni una semana se cuente en los dos lados. Null en el resto de formas.';

comment on column coach_communication_items.compare_weeks is
  'Solo con display = comparativa: cuantas semanas ocupa CADA lado. Una sola columna para los dos a proposito: catorce semanas le ganan a diez siempre, asi que dos ventanas de distinta longitud harian que el total dijera que el calendario es mas largo, no que el atleta entreno mas. Null en el resto de formas.';

-- Una semana empieza en lunes en todo el producto, y la agregacion de zonas
-- trunca por semana: una fecha a media semana sumaria una primera semana a
-- medias en un lado y entera en el otro.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_compare_monday_chk;

alter table coach_communication_items
  add constraint coach_communication_items_compare_monday_chk
  check (
    (compare_a_start is null or extract(isodow from compare_a_start) = 1)
    and (compare_b_start is null or extract(isodow from compare_b_start) = 1)
  );

-- Menos de un mes por lado no es un periodo, es una racha. Mas de seis meses por
-- lado es un ano de calendario en una sola comparacion.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_compare_weeks_chk;

alter table coach_communication_items
  add constraint coach_communication_items_compare_weeks_chk
  check (compare_weeks is null or (compare_weeks >= 4 and compare_weeks <= 26));

-- La config va ENTERA o no va, y SOLO en una comparativa. Media config no se
-- puede sumar; en cualquier otra forma es un dato que nadie escribio y que la
-- primera lectura distraida convertiria en una seccion que no es.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_compare_chk;

alter table coach_communication_items
  add constraint coach_communication_items_compare_chk
  check (
    (compare_a_start is null and compare_b_start is null and compare_weeks is null)
    or (
      display = 'comparativa'
      and compare_a_start is not null
      and compare_b_start is not null
      and compare_weeks is not null
    )
  );

-- EL ORDEN Y EL NO SOLAPE, que es lo unico que puede hacer que la comparacion
-- mienta sin que nada falle: `a` es el antes, `b` el despues, y la primera semana
-- de `b` no puede caer dentro de `a`. Con solape, las mismas horas se sumarian en
-- los dos lados y el delta se comeria a si mismo.
alter table coach_communication_items
  drop constraint if exists coach_communication_items_compare_order_chk;

alter table coach_communication_items
  add constraint coach_communication_items_compare_order_chk
  check (
    compare_a_start is null
    or compare_b_start >= compare_a_start + (compare_weeks * 7)
  );

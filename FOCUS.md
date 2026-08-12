# FOCUS — FAHYBRID

Estado vivo del proyecto. Se actualiza en el mismo commit que el trabajo.
Última actualización: **2026-08-12**

---

## Ahora · La pestaña Plan estrena cabecera con dato y el ciclo es un camino (12-ago)

Directiva de Alex (11-ago): la cabecera del Plan salía vacía, el ciclo debía
entrar por el cromo con icono propio, y la vista del ciclo tenía que ser el
camino a su objetivo, motivadora por diseño. Tres raíces, tres piezas:

- **El foco de la semana vive en la semana del atleta** (migración **0182**,
  aplicada a prod). Antes solo existía en `program_week_templates.focus`: una
  semana sin cadena (creada directa o por MCP, el caso real de Alex) no podía
  llevar foco. Ahora `weekly_plans.focus` manda y el de plantilla es el defecto
  heredado. Lo escriben el panel (cabecera de la semana en la ficha del atleta)
  y la tool MCP **`set_week_focus`** («el foco de esta semana es…» dictado por
  voz), por UN solo escritor (`web/lib/coach/week-focus.ts`) con el guardia que
  importa: fijar un foco JAMÁS publica ni esconde la semana. Un borrador no
  adelanta su foco al atleta. 26 tests web nuevos contra rama Neon real.
- **«Semana N» también sin cadena** (12-ago, segunda pasada): un plan directo
  no tiene microciclo pero sí posición — el servidor la deriva del calendario
  real (semanas SEGUIDAS con trabajo hasta la mirada; un agujero corta) y la
  sirve como `«semana N»` a secas, SIN «de M»: el total de un plan directo no
  es un hecho, crece al publicar. iOS parsea las dos formas; una etiqueta
  contradictoria («semana 7 de 4») no se rescata. La cadena sigue mandando.
- **`GET /api/athlete/plan/ciclo`**: camino real (+`level` y `events` aditivos
  por tramo), `al_acabar` verbatim de `program_sequences.end_policy` y la
  carrera objetivo con su `goal_time_s`. La cabecera de iOS (bloque + «Semana
  N de M» + foco) ya pintaba todo esto: era el DATO lo que faltaba.
- **iOS**: la puerta al ciclo sube al cromo (`square.stack.3d.up`, antes de
  calendario y chat), `EntradaAlCiclo` borrada (el héroe absorbe su alto), y
  `PlanCicloView` reescrita espina-first portando la propuesta del doble:
  tramos con «estás aquí, semana N», hitos del calendario colgando del tramo
  actual, hueco «aquí acaba lo publicado» y la carrera cerrando con cuenta
  atrás y objetivo. Suite fusionada: **1357 tests, 0 fallos**. Detalle y
  descartes (cumplimiento semanal, «próxima semana»): `docs/DECISIONS.md`
  12-ago «La vista del ciclo es un CAMINO».

Pendiente de Alex: verlo en su iPhone (instala él). Ojo con su atleta (64):
sin cadena de mes, el ciclo enseña su vacío honesto — para ver el camino
entero hace falta una cadena asignada. El foco sí puede probarlo YA dictando
al conector: «el foco de esta semana es…».

---

## Ahora · El doble alcanza al ciclo espina-first (12-ago)

Espejo del Swift del ciclo (fusionado en `5f1d1c8f`; `twin:desfase` re-corrido
tras el merge: `plan-ciclo` EN FASE, solo siguen los tres podridos de antes).
Tres commits:

- **`plan-ciclo` pasa a `espejo`**: las cuatro divergencias declaradas de la
  propuesta ya resueltas — reparto IGUAL entre las paradas que crecen (no
  3:2:1:1), botón de cerrar (×) en el cromo, acción secundaria «VER LA
  SEMANA» en mayúsculas. La tinta del texto pasado (muted, no 45% del tono)
  se arregló en `plan-espina/Espina.tsx`, compartido con la nota del coach
  y periodización — les toca igual.
- **`plan-bloque` cromo + pie**: el encargo original pedía `plan-semana`,
  pero `EntradaAlCiclo` y la composición héroe+carril viven en `plan-bloque`
  (confirmado con main antes de tocar); `plan-semana` es otra propuesta del
  29-jul, arquetipo Lista, sin héroe ni pie. Botón del ciclo sube al cromo
  (nuevos iconos `IconStack`/`IconCalendar`/`IconMessage`), el pie desaparece
  (código muerto borrado), el héroe absorbe el alto solo.
- Typecheck + lint limpios; 966 tests del doble en verde.

**`twin:desfase` re-corrido tras el merge del ciclo:** `plan-ciclo` en fase.
`benchmark-erg`/`devices`/`watch-live` siguen podridos de antes, ninguno de
este lote.

---

## Ahora · Correr T0 CERRADA: la carrera ya no se olvida (12-ago madrugada)

Análisis de dominio: **`docs/correr-analitica.html`**. Contrato: `DECISIONS.md`,
«La carrera guarda su NEGATIVO». Alcance firmado por Alex: **el circuito entero
(T0→T4)**, y sus atletas corren **con nuestra app**, así que el emisor de iOS era
la pieza crítica y no la ingesta de terceros.

**T0 cerrada en 12 commits.** iOS graba pulso, velocidad, distancia y altitud
sobre un eje de segundos enteros y lo sube; el servidor deriva los kilómetros,
calcula lo que exige recorrer la traza entera, y sirve las dos superficies por el
cargador que ya compartían. Verificado por mí, no por los agentes: `xcodebuild`
verde y **1318 tests iOS** (1357 tras fusionar los lotes de las otras sesiones);
web **3867 tests, 0 fallos**; migraciones 0180 y 0181 aplicadas al Neon correcto
(dry-run con 0 pendientes, que es la señal que distingue la base buena de la otra).

**Lo que más cuenta del resultado:** no se añadió ni una medición nueva salvo la
altitud. El GPS ya daba velocidad y distancia en cada fix y el pulso ya llegaba de
tres orígenes con su precedencia — todo eso se pintaba y se tiraba.

**Decisiones que no hay que volver a discutir** (detalle en DECISIONS.md):

- Se guarda lo medido y se deriva lo demás. **No se emite `pace`**: el ritmo que
  se pinta es una media móvil de 10 s, guardarlo sería guardar una interpretación.
- **Los kilómetros no se guardan en ninguna tabla.** Si aparece una, alguien no
  leyó el contrato.
- La curva de dibujar se reduce por **mín/máx por cubos**, no por decimación ni
  LTTB: en una serie el pico ES la repetición, y hay que garantizar que el extremo
  literal sobrevive. Probado con una oscilación de periodo 2, el caso adversario.
- Lo derivado se calcula SIEMPRE sobre la traza entera y solo después se reduce.
  Al revés daría splits equivocados en silencio.

**Dos bugs latentes destapados por el camino:**

1. **`hr_recovery_60_bpm` tenía el CHECK equivocado desde la 0154.** La propia
   migración lo documenta como «la caída de pulso tras el esfuerzo» y lo encierra
   en `between 30 and 260`, que es el rango de un pulso absoluto: una recuperación
   normal de 18 lpm reventaba la inserción. Invisible porque la columna llevaba
   vacía desde julio. Arreglado en **0181** (0-150). Patrón a recordar: una columna
   sin escritor no es código inerte, es un fallo esperando al primero que llegue.
2. La correa BLE genérica no tenía valor de fuente. Añadido **`strap`** (0180),
   alineado con el vocabulario que `segment_executions.hr_source` ya usaba.

**HUECOS DECLARADOS de T0 (no están hechos):**

- **Un entreno llevado desde el reloj NO manda traza.** El reloj corre el mismo
  motor y llena su buffer, pero relega por `WatchWireModels`, que no lleva series.
  «La carrera ya no se olvida» es cierto en el iPhone y todavía no en la muñeca.
- **Un crash a mitad de carrera pierde el buffer** (vive en memoria hasta
  terminar). Fuera a propósito: persistir 220 KB cada minuto contradice el no
  gastar batería. `startedAt` sí sobrevive, así que el eje no se rompería.
- **El altímetro no se ha probado en hardware**: `CMAltimeter` no existe en el
  simulador. La matemática del ancla sí está cubierta (12 tests sobre un tipo puro).
- Nadie pinta nada todavía: T1 y T2 son las siguientes.
- `web/lib/athlete/assignment-detail.ts` tiene 1203 líneas, muy por encima del
  límite de 500, y ya las tenía. Partirlo es un refactor cruzado con su mini-mapa.

## Ahora · Correr: los metros se perdían de verdad, y Alex tenía razón (12-ago mañana)

**LO QUE ESPERA A ALEX: una vuelta de distancia conocida.** Es lo único que no
puede hacer nadie más y lo único que cierra el trabajo de los metros. La receta
está dada: rodaje sencillo (el caso continuo es el que está entero), móvil
bloqueado en el bolsillo 2-3 min a mitad, una parada de 30 s, y a poder ser un
tramo de mala señal. Al terminar, se guardan **las dos cifras** —la nuestra y la
de Apple Salud— así que el desvío se calcula después.

### El fallo que él reportó y se le dijo que no existía

Alex hizo un entreno, dijo que el GPS no contaba bien los metros, y se le
contestó que estaba todo bien **sin verificarlo**. Tenía razón. Eran TRES fugas
y las tres restan:

1. **El tope de 60 m tiraba el bache entero.** El criterio estaba mal elegido: 60
   metros no son implausibles, lo son solo si ocurren rápido. A 5:00/km se
   recorren en 18 s, a 3:30 en 12 — así que **cualquier hueco de señal más largo
   perdía el 100 % de su distancia**.

   **DESENLACE: ese contador ya no existe.** Alex, harto y con razón, señaló que
   llevábamos horas AFINANDO un contador de distancia escrito a mano cuando Apple
   ya tiene uno. La prueba estaba en el propio repo: **el reloj nunca tuvo el bug
   porque el reloj usa el de Apple.** Ahora la distancia la da **`CMPedometer`**
   (mismo motor que alimenta Salud, disponible desde iOS 8, permiso ya pedido), y
   `RunDistanceGate` con sus tres puertas está **borrado**. CoreLocation se queda
   solo para coordenadas y ritmo en pantalla.

   **La lección, ya en memoria:** encontrar un bug en código propio de bajo nivel
   no es permiso para arreglarlo, es la señal de preguntarse si debería existir.
   Arreglar la rueda sale más caro que haberla inventado.
2. **El permiso de GPS en segundo plano solo se pedía desde UNA pantalla.** Un
   tramo de correr dentro de otro formato corría sin él: móvil al bolsillo y se
   perdían TODOS los metros de esa ventana. Ahora va con la carrera.
3. **La autopausa tiraba los metros** en vez de congelar el crono. La distancia es
   un hecho físico y el tiempo parado es una política: Garmin y Strava paran el
   reloj y siguen sumando. Solo la pausa a mano deja hueco.

**Y por qué nunca saltó:** la insignia decía «GPS débil», o sea usable, hasta 40 m
de error mientras la distancia cortaba en 25. Entre esos dos números el atleta
leía «va flojo pero va» con el contador en **cero absoluto**. Ahora es el mismo
número.

**Lo que cierra el círculo:** al terminar se le pregunta a Apple Salud cuánto
registró ella en la misma ventana y su serie se guarda AL LADO de la nuestra. La
divergencia queda escrita en el archivo. La próxima vez lo dice la app.

### El barrido encontró el MISMO patrón en dos sitios más

La forma del fallo era «rechazo esta lectura pero avanzo el estado igual».

- **`HealthKitSyncService` perdía biometría PARA SIEMPRE**: los tres vaciados
  descartaban el resultado del envío y avanzaban el ancla igual. Un 401 o un 4xx
  no se encolan, y la consulta anclada de Apple no redelivera lo que quedó detrás.
- **El cuentakilómetros de la cinta cobraba dos veces** el tramo congelado.

### Lo demás que cerró en esta tanda

- **Panel del coach**: página nueva `/atletas/{id}/sesion/{assignment}` con la
  lectura entera. **El caso continuo está completo** (curva, banda dibujada,
  kilómetros, tabla); el de series espera datos reales.
- **Las cuatro lecturas del entrenador**: calibración con su sesgo, huella,
  volumen semanal en km y carga con veredicto delante. Migración **0183**.
- **La carrera comprometida** (mig. **0184**), reutilizando `classifyEffort` que
  ya estaba en producción. Se descartó una primera vez midiendo el seed en vez de
  la métrica; la entrada de DECISIONS se sustituyó entera con el porqué.
- **El atleta ya lee su veredicto** (`run_compliance` en su detalle): se calcula
  UNA vez y el coach lee ese mismo resultado. Test de paridad bit a bit.
- **Dominio de la lectura en Swift**, con el veredicto como campo de ENTRADA y
  cero líneas que juzguen. 26 tests que defienden las reglas reintroducibles.
- **Orden aleatorio permanente** en los tests de iOS.

### EN VUELO / PENDIENTE

- **`slope_pct` por tramo**: hoy solo existe la inclinación de la CINTA, así que
  en calle el corrector de pendiente **no dispara nunca** y una sesión de cuestas
  al aire libre recibe veredicto de ritmo — lo que el contrato prohíbe.
- **El decodificador `AssignmentDetail → Carrera` y la capa de VISTA en Swift**:
  para sesión fresca. El mapa queda escrito en el fichero del dominio.
- El mapa del panel: falta decodificador de polilínea y el perfil de zonas del
  atleta, sin el cual el color sería adorno donde el atleta tiene dato.
- Nada de la curva se ha visto contra datos reales: `workout_traces` está vacía.

---

## Antes · Las dos lecturas diseñadas y firmadas (12-ago madrugada)

**T1 y T2 diseñadas a la vez, que era la condición.** Si nacen separadas acaban
con dos idiomas del mismo entreno — exactamente lo que arrastrábamos: el coach
tenía veredicto por repetición y el atleta no; el atleta tenía lectura honesta y
el coach no.

- **Atleta:** `lectura-carrera`, pantalla `propuesta` del doble, diez escenarios.
- **Coach:** `docs/carrera-en-el-panel.html`, verificado a 390/768/1440.

**FIRMADO POR ALEX:** al terminar manda **el veredicto**, no el ritmo medio. La
alternativa se conserva montada como escenario ① B, marcada DESCARTADA. Razón:
el ritmo medio lo da cualquier reloj de 200 €; el veredicto contra la banda del
coach no lo puede dar nadie más. Detalle y jerarquía completa del sujeto en
`DECISIONS.md`.

### La corrección de dominio de Alex, y lo que destapó

«En carrera el parado rara vez se hace; lo habitual es un cambio de ritmo o de
zona.» Tenía razón, y no era un problema de vista sino de tres capas:

1. **El motor de cumplimiento saltaba las recuperaciones enteras** (`filter(kind
   === 'work')`) mientras la gramática SÍ permite ponerles objetivo — el fartlek
   ya lo hacía. Se podía prescribir «trote a RPE 3» y no se comprobaba nunca.
   Arreglado con veredicto de 3 vías propio: irse RÁPIDO es el único fallo real;
   dentro y lento colapsan en «controlada». En arrays separados, nunca mezclados
   en un porcentaje único.
2. **Bug lateral que solo salió al mover la piedra:** `segmentBand()` usaba
   siempre el `resolved` del BLOQUE, ignorando el del tramo. Invisible mientras
   las recuperaciones no se juzgaban; en cuanto una recuperación en Z1 convive
   con trabajo en Z4, cualquier recuperación honesta salía fallada.
3. **Los arquetipos ofrecían la excepción como norma:** `series` y `pirámide`
   nacían con «90 s parado». Pasan a trote en Z1 con objetivo. `cuestas` se queda
   en caminar, que ahí es lo honesto.

**Y destapó el producto.** Con trote, la tabla del 6×800 cuenta sola por qué se
cae la quinta serie: dos trotes que se fueron rápido, seguidos de la que falla.
Con parado eso era literalmente invisible. Hay un test que defiende esa historia:
si el trote deja de irse rápido, salta.

### Reglas nuevas que salieron de construirlo (todas en DECISIONS.md)

- **El eje de la curva lo fija LO QUE SE CORRIÓ.** Afinada TRES veces; las dos
  primeras quedan anotadas como erróneas porque suenan razonables. Medido: con la
  segunda, el escenario estrella se salvaba por DOS SEGUNDOS y el de cinta ya
  salía roto.
- **La escala es propiedad del DATO; el suavizado, solo del DIBUJO.** El eje se
  calcula sobre la señal cruda: la media móvil cruza la frontera del tramo y cuela
  el ritmo del paseo dentro de la última muestra de la subida.
- **La otra mitad de la regla del hueco:** se declara lo que falta cuando el
  atleta podría hacer algo; cuando en esa superficie no existe, la app se calla.
  Una cinta no anuncia que le falta el mapa.
- **El porcentaje solo no sirve:** el mismo 74 % de acierto significa lo contrario
  según hacia dónde se falle. Lo que informa es el sesgo.
- **Sin muestras suficientes no se pone porcentaje.** La sexta repetición con dos
  observaciones cuenta en el total pero no lleva número: un 0 % con n=2 sería una
  conclusión inventada. A partir de cuántas se afirma algo lo decide el coach.

### EN VUELO ahora mismo

- **La duración del descanso no se juzga.** Los ejes son ritmo, pulso y RPE. Un
  atleta que trota a la intensidad pedida pero se toma tres minutos donde había
  sesenta segundos lee «recuperación controlada». En series a umbral la
  recuperación incompleta ES el estímulo.
- **El reloj sigue sin mandar archivo** (hueco de T0). 218 KB por sesión mandan el
  diseño del cable.

### PENDIENTE DE ALEX
Visto bueno al mockup del panel. Sin eso no se toca el panel en código.

---

## Antes · El análisis de carrera (11-ago noche)

**El diagnóstico:** una carrera son señal + troceado + intención. Tenemos la
intención al nivel más alto del mercado (veredicto por repetición contra la
banda del coach, que ningún reloj puede calcular porque ningún reloj sabe qué te
pidieron) y **la señal no se guarda**. Se mide en vivo, se pinta y se descarta.

Cinco consecuencias verificadas a mano, no supuestas:

1. `workout_traces`, su Zod y `POST /api/sync/workout-traces` existen y
   funcionan; **iOS no emite ni una serie** — el propio escritor lo dejó
   dicho («el motor en vivo emitirá las trazas en su propia tanda»).
2. `FormaDeCarreraDeteccion` recibe un array vacío → la lectura honesta cae
   siempre en «no se sabe» y un fartlek se resume por kilómetros.
3. `SegmentActualDTO` tiene `ergSplits` y nada equivalente para correr: un
   6×800 se abre en seis filas al terminar y vuelve a ser una en el historial.
   El remo conserva su tabla; la carrera no.
4. `decoupling_pct`, `hr_recovery_60_bpm` y `elevation_gain_m` (mig. 0154)
   existen en esquema y Zod **sin un solo motor que los calcule** — y el coach
   ya puede editar un `decoupling_target_pct` que no alimenta nada.
5. El reparto de zonas del servidor prefiere la traza a las muestras sueltas y
   se queda siempre con la evidencia degradada, con el buen camino abierto.

Roto contra **doce carreras salidas del cruce de ejes de la propia gramática**
(medida × objetivo × estructura × recuperación × superficie × pendiente): cuatro
se rompen del todo, cinco se sirven degradadas, dos parciales, una bien. Las
cuatro rotas comparten causa única.

También sale de ahí un hallazgo de **regla Nº0: nueve constantes que son método
del coach** y hoy están cableadas (τ 42/7 de la carga, ±5 s/km de cumplimiento,
±8 s/km del aviso en vivo — que además contradice al anterior —, tabla RPE→IF,
ventanas 7/28, distancias de récord, cobertura mínima 90%, zonas de potencia de
bici).

**Lo nuestro, para cuando esté la base:** carrera comprometida (cuánto ritmo
pierde por trabajo previo — Garmin no puede, no sabe que antes hubo un trineo),
la banda como analítica longitudinal (¿calibro bien los ritmos?, con el sesgo
del fallo) y persistir la huella que ya calculamos y borramos a los 30 s.

---

## Antes · El alta ya no obliga a pasar por la periodización (11-ago noche)

Dar de alta a un atleta imponía la matriz nivel×días: el paso «Estructura del
bloque» enseñaba una secuencia propuesta que no se podía renombrar, ni ampliar,
ni recortar, y al asignar siempre se arrancaba desde la biblioteca del coach.
Para llevar a alguien en plan propio había que darlo de alta primero y entrar
después a su ficha a «Personalizar». **El servidor ya era agnóstico** (lo decía
su propio comentario: el alta no planifica un macrociclo); quien imponía la
matriz era la pantalla.

Ahora el paso 3 ofrece dos caminos con el mismo peso: **«Seguir la
periodización»** (el defecto, idéntico a antes) y **«Plan solo para él»**, donde
la misma lista se escribe entera — nombre por tramo, semanas, añadir y quitar.
Los nombres los pone el coach: cero escuelas de periodización cableadas.

En modo personal se crean contenedores del atleta encadenados sin hueco, en
borrador privado, y **no se asigna nada de la biblioteca**. Reutiliza la cadena
personal de esta mañana (`addPersonalTramoToChain`, que ya audita dentro de la
transacción); lo único que hizo falta fue dejarle empezar sin cadena previa. La
clasificación nivel×días se sigue guardando en los dos modos: es dato del
atleta, no insumo de la matriz. Test contra rama Neon real: 3/3.

---

## Ahora · Las fotos de perfil se mudan a Cloudflare Images (11-ago noche)

La foto deja Vercel Blob, y el motivo no es el disco: son las **variantes**. Con
Blob se servía el original (hasta 4 MB) dentro de un círculo de 32 px; con cien
atletas en un listado, cien originales por carga.

**Qué se hizo** (detalle y qué NO volver a hacer: `docs/DECISIONS.md`, 11-ago noche):

- **`athletes.avatar_url`** (migración **0179**, aplicada): el atleta no tenía
  NINGUNA columna de foto, por eso salía siempre con iniciales.
- **Tres rutas finas, dos principales:** `POST /api/perfil/foto/subida` →
  `{ upload_url, image_id, expires_at }`, `POST …/confirmar` con `{ image_id }`, y
  `DELETE /api/perfil/foto`. El entrenador entra con su sesión y el atleta con su
  bearer; **un entrenador nunca sube la foto de un atleta**. Confirmar PREGUNTA a
  Cloudflare si la imagen existe y si la subió quien la reclama: la URL no se
  guarda antes de que el fichero exista.
- **Se guarda la BASE, sin tamaño.** La variante la pide quien pinta:
  `avatar160` (listados) y `avatar480` (retratos), declaradas en
  `web/lib/profile/photo-source.ts` y creadas por
  `infra/scripts/cloudflare-image-variants.ts` leyendo esas mismas constantes.
- **Lo común a Cloudflare sube a `web/lib/cloudflare/api.ts`** y **Stream lo usa
  también**: cuenta, credencial, sobre de la respuesta y forma de fallar. Fuera
  `ExerciseVideoError` → `CloudflareMediaError`.
- **Fuera el camino de Blob:** `POST /api/coach/profile/avatar`, `avatar_url` del
  `coachProfileSchema` (la columna pasa a tener UN escritor) y el `remotePatterns`
  de blob en `next.config.ts`. Medido antes: **0 de 6 entrenadores tenían foto**.
- **Se pinta** en el roster del panel, y en iOS por `/api/auth/me`, que ahora
  devuelve `avatar_url` con la variante ya pegada.

**Verificado:** vuelta entera contra Cloudflare ejecutando el código de la app
sobre un atleta REAL (reservar → subir → confirmar → columna escrita → las dos
variantes responden 200 `image/jpeg` → borrar → columna a null y Cloudflare 404);
`.pdf` y dueño ajeno rechazados; `tsc --noEmit` limpio, eslint limpio, 3790 tests
en verde, `pnpm build` correcto. La cuenta queda con 0 imágenes.

**Sin hacer, y hay que decirlo:** la **cabecera de la ficha del atleta**
(`DetalleHeader.tsx`) sigue con iniciales — el fichero lo tiene otra sesión. Las
demás superficies del panel (mensajes, tarjetas de hoy, parejas de dobles) también
siguen con iniciales: sus cargadores no traen la columna todavía.

---

## Ahora · El contador de repeticiones, rehecho: excursión + serie abierta (11-ago noche)

Alex probando back squat en entreno libre: «nada más empezar suma reps sin más» y
«no me cuenta las reps». Medido con señal sintética de tres ejes, el mecanismo
anterior (autocorrelación + picos) daba **8 repeticiones con confianza 0,90
andando 20 s** y **3 de 6 en un back squat a 4,5 s** (su tope de periodo era
3,5 s). Además producía **13 velocidades para 6 repeticiones** — eso era el
«streaming» que molestaba en pantalla.

**Qué se hizo** (detalle y qué NO volver a hacer: `docs/DECISIONS.md`, 11-ago noche):

- **`RepTracker`** sustituye a `RepCounter` + `BarVelocityEstimator` (borrados).
  Una repetición = **excursión de ida y vuelta**, con dos observables: traslación
  vertical (squat, banca, peso muerto, press, jalón, curl, swing, wall ball) y
  orientación del antebrazo (dominadas, fondos, flexiones). Horizontal puro (remo
  sentado) NO entrega número; carries e isométricos dan cero.
- **La gravedad viaja en cada muestra** → archivo **v2** (9 canales, 2,4 MB/45 min,
  dentro de presupuesto; los v1 siguen leyéndose). Sin gravedad no hay eje vertical
  y el «eje dominante» de una muñeca andando es el balanceo del brazo.
- **Contar exige serie abierta.** `openWindow` no tenía NI UN llamante: el contador
  corría todo el entreno. Ahora la ventana la define `WorkoutSession.sensorWindow`
  y viaja en el frame (`MirrorSensorWindow`); al cambiar de serie vuelve a cero. De
  paso, el archivo de la fase 0 por fin se sella con sus ventanas etiquetadas.
- **Una velocidad por repetición**: se sella al cerrarse la repetición y no se toca
  hasta la siguiente. El teléfono deja de defenderse del contador (fuera el «+1 por
  paquete» y el techo del plan, que **congelaba la serie entera**).

**Verificado:** 21/21 en `FAHYBRIKTests/Sensor` (squat lento, squat con 2 s de
pausa, banca tumbado, wall balls, curl, dominadas, flexiones, andar=0, carry=0,
silla=0, remo sentado=0, velocidad 1×rep, conteo monotónico, ida y vuelta del
archivo v2); `xcodebuild -scheme FAHYBRIKWatch` SUCCEEDED.

**Para VER qué pasa en el gimnasio, no en el laboratorio (11-ago noche):**

- **Traza en vivo**: el reloj manda con cada paquete unas líneas de diagnóstico
  (qué serie abrió, qué repetición cerró con cuántos cm / m/s / confianza, y por
  qué descartó una excursión) y el teléfono las escribe en la consola del
  dispositivo con etiqueta `[REPS]` — mismo canal por el que se depura la cinta.
  La primera línea declara **qué build del reloj está contando**, que explica sola
  la mitad de los «no va bien».
- **Reproductor de capturas**: `ios/tools/replay-sensor/main.swift` lee un archivo
  FHSC del reloj y pasa cada serie por el MISMO contador, imprimiendo repetición a
  repetición. Con la captura del gimnasio se itera el algoritmo sin pedirle al
  atleta que repita nada. Se saca del iPhone con `xcrun devicectl device copy from`
  (instrucciones en la cabecera del fichero).
- **Lo primero que encontró**: el detector de trabajo/descanso decía **«trabajo
  0,0 s» en una serie de seis sentadillas reales** — su umbral (0,96 m/s²) está por
  encima del pico de un squat lento (0,4). Arreglado por la raíz: en una serie
  contable el trabajo lo dicen las repeticiones cerradas, no un umbral de energía,
  así que las dos cifras ya no pueden contradecirse.
- **Comprobado en el teléfono de Alex (conectado)**: en espejo el archivo solo se
  transfiere al **GUARDAR** el entreno (descartarlo lo tira a propósito), y la
  entrega por WatchConnectivity se queda **encolada** hasta que el móvil está
  disponible. No hace falta esperarla: el archivo se saca del PROPIO RELOJ con
  `xcrun devicectl device copy from … --domain-identifier com.fahybrid.app.watchkitapp
  --source tmp/sensor-<id>.fhsc`. Circuito verificado de punta a punta.
- **Y lo que dijo la primera captura real (11,7 s, prueba corta confirmada por
  Alex): formato v1, seis canales, CERO gravedad.** O sea que su reloj estaba
  corriendo el binario de antes del contador nuevo: todo lo que probó esta noche era
  el contador viejo. De ahí la build 20 y el pie de versión en el reposo del reloj —
  sin ese dato se depura código que no se está ejecutando.

**Hueco heredado que NO he tocado (fuera del alcance de lo reportado):**
`sensor_work_s` / `sensor_rest_s` se calculan sobre una ventana rodante de 35 s, no
sobre la serie. La fase 1 del plan los quiere **por tramo**, y ahora que la ventana
existe es un cambio de tres líneas — pero cambia el significado de dos columnas que
ya se escriben, así que va aparte. Sí arreglé su coste: filtraba el array entero de
muestras cada 20 ms (135.000 al final de la sesión) y ahora avanza un índice y
recalcula dos veces por segundo, que en el reloj es batería.

**Sin hacer, y hay que decirlo:** todo está validado contra señal sintética con
física, **no contra vídeo ni PM5**. La aceptación del plan (±1 rep en el 90 % de
las series, correlación >0,90 en m/s hasta el 80 % del 1RM) sigue pidiendo medir en
el gimnasio. Y dentro de una serie abierta, una muñeca dando vueltas puede seguir
sumando: la defensa es que el atleta corrige. El doble no cambia (las pantallas
`contador-reps` y `velocidad-serie` ya describían estas semánticas y la UI no se
tocó).

---

## Ahora · El atleta se pone su cara — foto de perfil en iOS (11-ago)

Donde había iniciales ahora puede ir su foto. **El servidor ya existe** (ver el
bloque de abajo): `POST /api/perfil/foto/subida` → subida directa multipart campo
`file` → `POST …/confirmar` → `DELETE /api/perfil/foto`. iOS se verificó contra
SU CÓDIGO, no contra el encargo, y ahí salieron **dos cosas que no encajaban**,
ya arregladas (`b5492b8c`): la reserva pide `{ filename }` estricto y mandábamos
`{}` (400 seguro), y el límite de reducción se quedaba corto para el recorte del
servidor. Falta probarlo desde el simulador de punta a punta.

- **Dónde:** el avatar de Perfil es ahora un botón con chapita de cámara y abre
  `FotoPerfilSheet` (en `ProfileView.swift`): galería con `PhotosPicker`, cámara
  reutilizando el `CameraPicker` que ya existía, previsualización antes de
  confirmar y quitar con confirmación.
- **Se reduce en el móvil:** lado mayor a **1024 px** y JPEG **0,85**
  (`AthletePhotoImage`, en `MeService.swift`). Una foto de iPhone son 3-5 MB y
  ~4000 px para acabar en un círculo. El 1024 lo fija el servidor, no el gusto:
  su variante mayor es un recorte cuadrado de 480, así que el lado CORTO tiene
  que llegar a 480 o el retrato sale blando (4:3 deja 768, 16:9 deja 576). Lo
  que se previsualiza es exactamente la imagen reducida que se sube, y
  recomprimir borra el EXIF: el GPS de la foto no sale del teléfono.
- **Estados honestos:** preparando · subiendo con % real (delegado de
  `URLSession`, no una barra decorativa) · guardando · hecho · error con motivo y
  reintento. Subir bytes y que el servidor los dé por buenos se cuentan por
  separado; nada se canta como guardado hasta que vuelve el perfil con la foto.
- **Dónde se pinta:** `CoachAvatar` acepta `photoURL` y la nueva pieza
  `AvatarPhoto` la recorta al círculo ENCIMA de las iniciales — sin foto, o
  mientras carga, se ve el avatar de siempre. Enchufado en Perfil, Inicio e
  Inicio libre.
- **Verificado:** BUILD SUCCEEDED y **1250/1250 tests iOS**, con 11 nuevos en
  `FAHYBRIKTests/Profile/AthletePhotoTests.swift`.

**Asunción CONFIRMADA:** `/api/auth/me` devuelve `avatar_url` dentro de
`athlete`, y llega **ya con su variante pegada** (`…/avatar480`), lista para meter
en el círculo sin tocarla.

**Sin hacer:** el doble no tiene espejo de la tarjeta de identidad de Perfil
(sólo `perfil-rendimiento`).

---

## Ahora · Reconocer el movimiento en el reloj — fases 0–3 en código (11-ago)

Plan del 6-ago (`docs/plan-reconocer-movimiento.html` + `docs/reconocer-el-movimiento.html`).
Alex retoma la cadena **0–3** (sin clasificador 4–6 aún).

**Hecho en este lote (mecanismo, no UI fina):**
- Migraciones **0173–0177**: archivo de captura, timing sensor, procedencia de
  reps, velocidad por serie, `coach_movement_policy` + consentimiento atleta.
  (Los números del plan HTML 0157–0162 ya estaban ocupados.)
- Algoritmos puros: `ios/FAHYBRIK/Sensor/*` (decimador, trabajo/descanso,
  contador de reps, velocidad de barra, codec FHSC, pipeline) + tests.
- Captura CoreMotion en el reloj (`SensorCapture`) en standalone + espejo;
  archivo → teléfono por `transferFile`; conclusiones en vivo por MirrorWire
  `sensor` → `WorkoutSession.applySensorConclusions` (prefill reps + m/s).
- Ingest: columnas nuevas en `ingest-execution-segments`; API
  `/api/sync/sensor-capture` + `upload-url` (blob prefirmado, exige consentimiento).
- Semáforo m/s: `shared/domain/strength/velocity-bands.ts` (verde→rojo por
  velocidad de subida; **no** %1RM — el RM lo interpreta el atleta).
- Doble: pantallas `propuesta` `contador-reps` y `velocidad-serie` (HUD fino =
  Claude sobre `FuerzaVivoView`).

**Pendiente / bloquea uso real en gym:**
1. Consentimiento del atleta (perfil) + subida al blob con `execution_id`.
2. HUD en vivo de m/s + chip de procedencia de reps → **Claude**.
3. Validación on-device (PM5 fases 1–2; vídeo wall balls / barra).
4. Medir batería captura ON vs OFF (criterio fase 0: ≤15 % extra o bajar Hz).

**Verificado:** `xcodebuild build` FAHYBRIK SUCCEEDED; vitest `velocity-bands`
5/5. SensorPipelineTests: compile OK; run en sim flaky (kill al bootstrap).

---

## Ahora · El vídeo del ejercicio deja de depender de YouTube (11-ago)

La app solo sabía reproducir técnica si el enlace era de YouTube: el portero
literal era `YouTubeLinkParser.videoId(from:) != nil`, repetido a mano en CINCO
vistas. En cuanto el entrenador suba su propio fichero en vez de pegar un
enlace, ese vídeo se quedaba invisible: ni botón, ni reproductor.

**Hecho (iOS, construido y con tests):** el localizador tiene dos formas válidas
y ninguna más — enlace de YouTube, o el vídeo propio del entrenador. Las
clasifica UNA pieza, `VideoDeTecnica`
(`ios/FAHYBRIK/Media/YouTubeEmbedView.swift`), que además decide qué reproductor
se monta: el embed de siempre o `AVPlayer` nativo. Las cinco vistas (ficha del
ejercicio, índice de técnica de la sesión, previa del entreno, estación de
carrera, entreno en vivo) ya no miran la URL a mano; sin localizador no se pinta
nada, y si no carga se dice y se puede reintentar.

**CERRADO el mismo día — el vídeo propio vive en Cloudflare Stream.** El fichero
alojado por nosotros (blob privado + proxy autenticado) duró unas horas y se
retiró entero: Stream **transcodifica** lo que se le eche (el `.mov` HEVC de un
iPhone deja de ser una lotería), sirve **calidad adaptativa por HLS** y los bytes
**no pasan por nuestro cómputo**, que es el cuello para escalar a muchos
entrenadores. La segunda forma pasa a ser el manifiesto
`https://customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8`: una
columna, sin migración, sin tabla nueva. En iOS lo reproduce `AVPlayer` de forma
nativa y **sin bearer**. Detalle y qué no volver a hacer, en `docs/DECISIONS.md`.

**Falta:** nada bloquea al entrenador — puede grabar y subir. Enlaza con la
biblioteca de ejercicios de abajo, que midió **0 vídeos** en el catálogo.

---

## Ahora · La biblioteca de ejercicios: cimiento puesto, cableado pendiente (11-ago)

Idea de Alex: el catálogo es corto, está desordenado y no habla castellano
(«back squat == sentadilla»), y con muchos ejercicios la lista se hace
inmanejable. Medido antes de tocar: **126 ejercicios**, 121 con nombre solo en
inglés, 0 alias en base de datos, 0 vídeos, 56 sin usar nunca.

**Hecho y aplicado en producción** (mig **0172** cimiento + **0178** contenido,
las dos aplicadas a mano por el runner y registradas en el journal — ojo, hay
0173-0177 pendientes de OTRA sesión y no se han tocado):
- `name_es`/`name_en` y el idioma resuelto **por persona** (decisión de Alex):
  el coach con `users.idioma`, el atleta con `athletes.preferred_language`.
  `name` intacto como último recurso, así que nada de hoy se rompe.
- `exercise_aliases`: **197 alias** en dos idiomas. El vocabulario estaba
  cableado en TS (101 entradas, solo inglés, solo para el importador); ahora es
  dato y sirve también al buscador. `coach_exercise_synonyms` (por coach) manda
  sobre el alias base.
- `movement_pattern` en 120 (con `anti_extension`/`flexion` para el core),
  **37 unilaterales**, **15 que declaran venir en par** — los dos últimos
  cambian la dosis, no son adorno.
- Basura fuera: 7 filas que no son movimientos, **archivadas** (no borradas).
  Errores de dato arreglados: bici con `modality='run'`, y un ejercicio en
  `hyrox_station` sin posición. Las 8 estaciones sí estaban completas.
- Verificado contra la DB real: «sentadilla»→6, «sentadila» (typo)→4,
  «gluteo» sin tilde→puente, «row»/«remo»→el ergo y los dos remos con barra
  **con su modalidad** para desambiguar (el caso que estaba roto).

**Cableado y EN PRODUCCIÓN** (deploy 11-ago 20:02, verificado de punta a punta
por el conector MCP contra prod: «sentadilla» → 10 ejercicios): un solo
predicado compartido `exerciseSearchFilter` para el catálogo del coach y el
del atleta —antes cada lector repetía su propio LIKE— que busca en el nombre
mergeado, los dos idiomas, el slug, los alias base y los sinónimos de ESE
coach, normalizado con la misma función que indexa y **por palabra contenida**,
no por prefijo. El filtro en cliente del panel usa la misma regla con
`search_terms` ya normalizado del servidor, así que pantalla y API no pueden
divergir. Medido en prod: sentadilla→10, gluteo→4, row→3 (el ergo y los dos
remos con barra), trineo→3, bulgara→1.

**El «filtro de Personalizados» que Alex reportó NO estaba roto:** sus 3
personalizaciones (sled push, puente de glúteo, press banca — les puso vídeo)
salen correctamente como `customized`; lo que las escondía era el chip «Sin
nada» activo encima, que por definición excluye lo que tiene vídeo. El vacío
decía sólo «ningún ejercicio con estos filtros», que se lee como filtro roto:
ahora dice cuántos hay con ese origen y qué los deja fuera, con botón para
quitar el filtro de contenido.

**Pendiente:** el importador sigue leyendo su mapa cableado en TS en vez de
`exercise_aliases` (el dato ya está, falta cambiar el lector); iOS no resuelve
todavía con `preferred_language`; ampliar el catálogo (126 → ~500 curados); y
el rediseño de la lista (facetas con conteos, agrupación por patrón,
virtualización, teclado en el selector) pide mockup y firma antes de construir.

**Gotcha de deploy (11-ago):** el CLI `vercel@58.9.2` sube el bundle y casca al
finalizar con «fetch failed» (Node 25); `npx vercel@58.9.1` funciona. Dos
intentos perdidos ahí.

---

## Ahora · Ficha del atleta — Biometría Whoop/Oura (coach)

**Decisión (DECISIONS 11-ago):** Biometría se mide como Whoop Recovery / Oura
Readiness en vista coach — veredicto primero, vs baseline del atleta, agudo →
crónico → fitness lento, check-in junto a la bio, CTA al Plan si hay que bajar.

**Hecho:** `BiometriaTab` rediseñada + `biometria-recovery.ts` (veredicto green/
yellow/red/unknown) + tests; VO₂ y peso; sueño con arquitectura si hay; circular
con Plan. Doc auditoría actualizado.

**Siguiente:** re-verify Biometría en prod/local → 100% → retomar cola
(Perfil re-verify si falta, Plan PL1…).

**Antes (Perfil, en prod `c9vgnzsyt`):** header intake + mensaje al hilo; CTAs
muertos fuera.

---

## Ahora · La ficha del atleta dice la verdad — cuatro arreglos, en producción (11-ago)

Alex abrió «Ver detalle» de su sesión de hoy y salieron cuatro cosas, todas
nuestras. **Las cuatro desplegadas y verificadas** (producción `5ho4o7m0q`).

1. **La etiqueta se comía una cifra.** «Prescrito» vivía en una columna de 58 px
   y en mayúsculas con el espaciado de `v2-micro` ocupa ~79: se desbordaba y
   caía ENCIMA del dato, tapando el «1» de «13×». El panel decía 3×. Fuera el
   ancho mágico: rejilla de dos columnas, el ancho lo fija la etiqueta más larga.
2. **La nota que el coach escribe por línea** (`template_segments.notes`) llegaba
   al móvil del atleta y se caía justo en el panel donde el coach revisa lo que
   mandó. Ahora se ve. (Y el título del bloque ya no se repite cuando es el mismo
   de la ficha.)
3. **«Circuito» a un fartlek de carrera.** La modalidad se adivinaba de
   `templates.format`; ahora se lee de los ejercicios. Ver DECISIONS 11-ago.
4. **Un toque borraba un entreno escrito**, y no quedaba rastro de quién. Las dos
   raíces y lo decidido, en DECISIONS 11-ago. El rastro se pone en
   `updateAthleteInstanceDay`, por donde pasan el panel Y el conector, con actor
   obligatorio.

**Qué NO se ha hecho:** la guardia «la dosis del título no puede contradecir la
prescripción tipada» quedó propuesta y **descartada por ahora** — nació de creer
que el conector tipaba mal, y resultó que no: tipó bien y otra cosa lo pisó. Si
se retoma, que sea por sus méritos.

**Rojo preexistente, no mío:** `tests/mcp/tools-plan.db.test.ts` espera la dosis
plana (`4×1000m @ … · r2'`) y desde `86f479d0` la narración es la fina
(`4×(1000m @ … / r2')`). El test se quedó sin actualizar en ese commit.

---

## Ahora · El contenido del ejercicio deja de perderse por el camino (11-ago)

Cuatro vías por las que el vídeo, los consejos y la nota del coach existían en
el dato y no llegaban al atleta. Cerradas las cuatro (iOS, `58ea2347`→`6cf51a1a`,
BUILD SUCCEEDED + 1183 tests):

1. **Carreras tiraba el vídeo que sí recibía.** `StationDetailView` usaba
   `technique_video_url` como booleano y pintaba un dibujo rayado con un play
   que no era un botón. Ahora se reproduce ahí mismo (`YouTubePlayer`). Muere
   `TechniqueVideoPlaceholder`, cuyo comentario mentía («BACKEND GAP»).
2. **«Ver técnica» ignoraba `notes`** — la nota del coach PARA HOY. Un ejercicio
   con solo nota se quedaba sin botón aunque la ficha sí la pinta.
3. **Un entreno hecho no podía abrir la técnica de nada.** Ya cargaba el detalle
   entero; ahora enchufa el índice que ya existe (`SessionExercisesSheet`).
4. **Calentamiento y vuelta a la calma** no ofrecían técnica nunca; ahora la fila
   entera abre la ficha cuando el ejercicio la trae.

De propina, fuera `WorkoutPlan.demoVideoUrl`: nacía `nil` en las 8
construcciones, nadie lo leía y la API del atleta no lo sirve.

**Sin tocar:** el doble. `sesion-previa` es `construida`, no `espejo`, y su
`FilaItem` ya propone justo el punto 4. `twin:desfase` sigue con sus 3 espejos
podridos de siempre (`benchmark-erg`, `devices`, `watch-live`), ninguno mío.

---

## Ahora · Conector MCP del coach (10-ago) — F1 construida, desplegando

El coach mira y edita su club desde su asistente (Claude en el móvil hoy,
Grok después) vía conector MCP remoto; se venderá como add-on por coach.
Plan y fases: `docs/mcp-conector-coach.html` · decisión y gotchas: DECISIONS
2026-08-10. **F1 hecha** (OK de Alex al plan): `/api/mcp` con mcp-handler 1.x,
OAuth Clerk completo (`.well-known` + CIMD/DCR), resolver token→coach, tools
`get_briefing` / `list_athletes` / `get_athlete`, rate limit `mcp`, 29/29
tests en rama Neon. Cazado y esquivado un bug del helper de Clerk que
publicaba mal el `resource` (el síntoma del issue Claude↔Clerk de abril).
**Desplegado en producción y conectado (10-ago):** DCR activado por API
(`instance/oauth_application_settings`), `.well-known` + 401 verificados en
vivo, conector «FAHYBRID» añadido en el claude.ai de Alex
(`https://app.fahybrid.com/api/mcp`) y handshake OAuth completo hasta la
pantalla de consentimiento (Claude auto-registrado vía DCR, `resource`
correcto). **GATE F1 CUMPLIDO (10-ago):** Alex autorizó y probó en su Claude —
briefing, señales, carga y roster respondiendo con datos reales de producción.
**F2 construida** (10-ago): 6 tools de lectura más — `get_plan` (macro/mes/
semana encadenable), `get_session` por fecha o id (prescrito vs ejecutado por
tramo, orquestación extraída a `lib/coach/session-detail.ts` y compartida con
la ruta), `get_races` (predicho vs real), `search_library`, `search_methodology`
(RAG, distingue «sin corpus» de «sin resultados»), `list_communications`.
53/53 tests en rama Neon. **F2 en producción y F3 construida** (10-ago):
`create_session` / `edit_day` / `move_session` con prescripción tipada
(schema del dominio en el inputSchema + gramática en la descripción),
completitud como portón, sesión AUTORADA (no fork), visibilidad real dicha
en cada read-back, audit canal `mcp` (mig 0165 aplicada). 58/58 tests MCP.
Ver DECISIONS 2026-08-10 (visibilidad de semana + derivadas F3).
**F4 construida** (10-ago): `publish_week` (ancla al lunes, dice si ya estaba
publicada), `publish_communication` (unión por `kind` en el inputSchema,
todo-o-nada con vuelta atrás, push por el mismo camino que el panel),
`send_message` (mismo cubo de rate limit que el panel), `add_note`. 16 tools,
72/72 tests MCP + 124 de comunicados/chat sin regresión. Auditoría solo donde
el panel audita (las 4 de F4 no auditan porque el panel tampoco — el dominio
ya registra `approved_by`/`published_at`/el propio mensaje).
**F5 construida** (10-ago): guía del coach en `/guia` (sección 41 «El conector
con tu asistente», Herramientas, copy contrastado contra el código) +
entitlement por club (`coach_entitlements`, mig 0167 aplicada, lista blanca,
club 60 = founder; ver DECISIONS). 77/77 tests MCP.
**Queda de F5:** registro en Grok (necesita cuenta de Alex) y precio del
add-on (decisión de Alex). Stripe se cablea cuando haya precio.
**Primer bug real cazado por el test de Alex (fartlek dictado):** el cliente
convirtió perfecto a estructura tipada; el hueco era nuestro — prescripción
solo-estructura queda MUDA en todos los resúmenes. Raíz arreglada
(`withFlatFromStructure` en los serializadores; ver DECISIONS), fila real
backfilleada, título limpio. Mejora pendiente anotada: `to-text` podría
narrar la estructura fina (16×(500m Z3 / 1' trote Z2)) en vez del flatten.
De la auditoría salió además el arreglo de tenancy del embudo (ver DECISIONS).
**Segundo bug real del mismo fartlek, en iOS (10-ago, ARREGLADO):** en el móvil,
la ficha se veía bien y al tocar EMPEZAR la pantalla salía EN BLANCO, sin botón
de empezar. La raíz no era la puerta del bloque: `isConditioningTimer` —la
propiedad que leen las PANTALLAS— no excluía la carrera con estructura, así que
al tramo se le montaba debajo un `ForTimeLiveHUD` de 16 filas (~3 pantallas de
alto) y la puerta quedaba centrada en ese alto, con el EMPEZAR fuera. Arreglado
en la raíz (la precedencia del motor se escribe una vez), y de paso la dosis se
cuenta desde la estructura: «16 × 500 m · Z4 · recuperación 1:00 suave en Z2» —
un minuto al trote ya no se llama «descanso». 1109/1109 tests iOS. Ver DECISIONS
2026-08-10 (las dos entradas de arriba).
**Cerrado el resto del hilo (10-ago tarde):**
- Espejos del doble al día tras el cambio de Swift (`gate-bloque`,
  `sesion-previa` con la dosis estructurada y el OFF activo; `run-live`
  re-verificada y degradada a `construida` porque ya mentía desde el 29-jul —
  lista de lo que falta en el propio fichero). 927 tests del doble.
- El desborde de rondas del vivo: PORTADO A SWIFT (11-ago, `583ab005`, con el
  OK de Alex a la propuesta). `RoundsLiveHUD`: lista de una línea con banda de
  trabajo FIJA mientras cabe (umbral del hueco real), contador con cursor
  abierto cuando no; botón del host cierra ronda a ronda (antes se saltaba el
  WOD); parciales por deltas; muñeca con el mismo número. El doble pasó a
  `espejo` con `fuentes`. **Tres rondas de verificación adversarial cruzada**
  (esta sesión midió, la otra arregló): R1 FALLA (el contador se derramaba,
  538 pt en ~393) → `e945d095` cascada por prioridad; R2 FALLA (la clase
  seguía viva: ergo sin emparejar y dobles desbordaban; el test medía un
  estado que no era el pintado) → `4b2a21ba` SUELO en la cascada (cuenta al
  cromo, ~124 pt), «Tu media» a una línea (la raíz del presupuesto), test del
  estado pintado; R3 **INSTALAR** (cinco cromos limpios medidos por píxel,
  1169/1169 — el «1280» del commit no era reproducible). **Instalado en el
  iPhone de Alex (11-ago).** De los flecos R4, dos cayeron ya en `1bab1f7b`
  (el suelo lleva el chip del deshacer — una función no se recorta — y la
  cuenta pasa AA con `muted`); quedan, sin prisa: **iPhone SE 3** (con
  ergo+dobles el hueco baja a 32 pt — ahí debe colapsar el CROMO, no el
  contador: diseño propio) y un **nivel intermedio** entre compacto (368) y
  suelo (~145) para huecos de 200-270.
- **DIRECTIVA de Alex (11-ago): UNIFICAR EL VIVO.** «Tener diseños perdidos
  por la app es horrible; traslada este vivo-rondas a otros.» El lenguaje de
  `vivo-rondas` pasa a ser EL lenguaje del vivo entero. CORREGIDO tras
  verificar: `MarcoVivo` SÍ existe en Swift con 4 llamadas (el «cero» era un
  artefacto de grep con trailing closures); el hueco real es que su Layout no
  PUBLICA el presupuesto de apoyos — eso es lo que se generaliza. Ver
  DECISIONS 2026-08-11 «El vivo tiene UN lenguaje» (con la corrección).
  **FUERZA PORTADA (11-ago noche, `3b61e5bc..85aabbf2`, suite 1255 TEST
  SUCCEEDED en worktree limpio):** el host ganó `PresupuestoApoyos` +
  `CascadaApoyos` + `TiraFormatoVivo` (Theme/LenguajeVivoCascada.swift);
  sujeto = dosis con las 4 escrituras de carga; riel ventana-de-3 desde la
  5ª; velocidad 1ª de la fila con semáforo (sin sensor NO existe; poca
  confianza sin cifra); frase de pérdida con serie cerrada; descanso en
  tinta normal + acción de contorno; `dosisDeSeries` BORRADO (código muerto
  que mentía «5×6» en pirámides; regresión en el renderer, secuencias con
  BARRA «6/6/4/4/3» porque el guion significa banda). El doble queda
  `construida` con 5 divergencias declaradas en su `enApp` (barra de discos
  = átomo nuevo pendiente; «Pulso»→«FC»; m/s en vuelo; etc.).
  **Pendiente de instalar en el iPhone de Alex** — bloqueado por
  `Sensor/RepTracker.swift` sin commitear de la sesión de sensores (el
  checkout no compila; avisada, instala ella al aterrizar).
  **Backlog nuevo:** (a) GUIONES — dos cosas distintas y las dos su lote:
  ~80-113 literales de USUARIO con em dash real (U+2014) por 59 ficheros
  (prosa: ImportRaceSheet, RaceDetailView, CarrerasView, FijarObjetivoView,
  Treadmill×25… — regla dura violada a escala; arreglo = reescribir copy,
  no cambiar un carácter), y la grafía de RANGOS (el renderer usa en dash
  U+2013 «75–85», que es tipografía estándar de rango y consistente con
  fechas/ritmos; Formato usa «75-85»; unificar = decisión de copy de toda
  la app, de Alex); (b) capturas de render tests (la env var no llega al
  sim: va en el esquema, compartido). **Siguientes lotes:**
  RONDAS adopta el host, luego EMOM, AMRAP, estaciones, ergo, descanso.
  También arreglado hoy: el editor del panel vendía ceguera con bloques test
  autorados (batería del conector: solo config y notas, dosis invisibles) —
  `c9e674db`, desplegado; TestForm solo para tests del catálogo, el resto
  degrada al editor de items.
- **Incidente de datos (11-ago, resuelto — y era Alex xD):** la sesión real
  del fartlek dictado (asignación 411) apareció con 4 ejes cambiados (el
  prefill del arquetipo fartlek, `archetype-prefills.ts:58`). Se culpó primero
  al cliente MCP (falso: escribió perfecto, verificado fila a fila), luego a
  un dev server contra prod (falso también): **era Alex trasteando en el
  editor del panel**, y el editor aplicó el prefill SIN avisar sobre un
  entreno escrito — ese bug sí era real y está arreglado (`931c853b`). Fila
  restaurada. Moraleja doble: el actor obligatorio en las escrituras del panel
  (en vuelo) habría resuelto esto en un minuto, y el footgun del symlink
  `.env.local` sigue armado aunque esta vez no disparó (memoria + DECISIONS).
- Pendiente de Alex: PROBAR en su iPhone (ya instalado) el EMPEZAR arreglado
  y el contador — receta: dictar «WOD de 8 rondas: 10 cal Assault Bike,
  7 burpee box jump, 10 chest to bar, tope 17'» y darle a EMPEZAR. Los dos
  retoques de `1bab1f7b` llegarán en la siguiente instalación.

## PENDIENTES — importar un plan y planificar (lo abierto, en orden)

Lista explícita porque el hilo se ramificó mucho y se perdía el rastro de qué
quedaba vivo. Lo tachado está hecho y verificado; lo demás no está empezado.

**Importación de un documento**
- [x] Gramática de dosis: descanso en cualquier dialecto, carga sobre distancia
      y tiempo, carga por implemento, medida al fallo
- [x] Vocabulario completo del modelo: ritmo `/km` `/500m`, pulso, vatios,
      calorías, tiempo como medida, peso corporal, tope, y las BANDAS sin aplanar
- [x] Estructura del metcon: rondas con componentes, EMOM, work/rest, finisher
- [x] `r90` / `r1'` pegados — el propio placeholder del editor los perdía
- [x] **Lector de DOCUMENTO**: cabeceras→días/semanas y la TABLA con una columna
      por semana. `| Back Squat | 4×6 @72% | 5×5 @76% | 5×4 @80% |` ya sale como
      tres celdas etiquetadas con su semana; antes se quedaba la primera y tiraba
      dos en verde. 378 celdas del documento real, 112 líneas tipadas
- [ ] **Trocear por semanas antes de la IA**: no mandarle 690 líneas de golpe.
      Una semana por llamada — más barato, más fiel, y esquiva el tope de
      caracteres y el 504 del incidente del 6-ago
- [ ] Subir un fichero entero: hoy pegar admite 20.000 caracteres y UN día
- [ ] `Calentamiento C` → resolver la referencia contra los protocolos con
      nombre del propio documento. Hoy se evapora sin dejar rastro
- [ ] Notación aprendida por coach, hermana de `coach_exercise_synonyms` (0109):
      el coach corrige su dialecto una vez y no vuelve a fallar

**Planificar**
- [x] **Plan personal de UN atleta** (mig 0164). Se personaliza PARTIENDO del
      plan que ya tiene: copia profunda desde la semana en curso, la plantilla de
      origen queda intacta (test en rama Neon real), el pasado no se reescribe y
      el desenganche de la periodización se explica antes de confirmar. Falta:
      etiqueta en iOS, botón de volver a la periodización, y archivar
- [ ] **Completar los 22 bloques incompletos en origen** en minutos, no en una
      tarde — y que un bloque nuevo no pueda nacer sin dosis
- [ ] Conectar el resolutor de objetivos derivados (`methodology/zones.ts`, ya
      existe y ya es estándar) a la lectura del plan del atleta, para que un
      re-test mueva las semanas siguientes solo
- [ ] Las 20 secuencias de Periodización (5 niveles × 4 variantes de días) —
      contenido, no código: están a 0/4 en el nivel donde hay atletas

**Del plan personal, sin cerrar**
- [ ] En iOS no hay etiqueta que le diga al atleta que su plan es personal — ya
      lo entrena, solo falta decírselo
- [ ] Volver a la periodización: los datos lo permiten (plantilla intacta,
      cursor preservado en `detached`), el botón no está
- [ ] Archivar un plan personal sin borrarlo

**Deuda conocida**
- [ ] Banda de kg sobre medida de DISTANCIA (`5x25 m @150-170 kg`) va a revisión
- [ ] Pesos de estación por división: retirados por no tener fuente. Hace falta
      el rulebook oficial y ENTERO (mujeres, elite, doubles, tramos de edad)

---

## Ahora · ZONAS + FEEDBACK — las gráficas que firman el método (10-ago)

Nace del caso real: el coach de Pablo (olímpicos de esquí nórdico) le mandó la
gráfica de tiempo-en-zonas de TrainingPeaks pintada a mano + audios. Plan
completo en **`docs/design/zonas-feedback-model.html`** (9 secciones): la
gráfica canónica del sector en la ficha del atleta con la espina en el eje,
«Dar feedback» = nota con forma `grafica` (embed derivado, rangos marcados
como dato), comparativa por periodos, audio en el comunicado, histórico del
reloj. Ground truth duro: solo 18/221 tramos con zonas medidas, HealthKit 30
días de muestras, la polarización actual cuenta muestras del sofá (bug, se
arregla en T1) → **T1 = el MOTOR** (integrar por intervalo, cruce por ventana,
reconstructor retroactivo de ~103k muestras ya guardadas, escritor de
workout_traces, bandas y objetivo de polarización a dato del coach).
- ✅ **T1a motor** (`74da16fa`, mig 0168 APLICADA + reconstructor EJECUTADO en
  prod: 206 tramos, 39 con zona, resto declarado sin dato): segundos-por-zona
  por TRAMO (sesión mixta reparte por modalidad), cómputo por intervalo con
  hueco = sin-pulso, método FC del coach como dato (bandas + objetivo 80/0/20),
  polarización arreglada (agrega segundos EN SQL, muere el pulso del sofá),
  ingesta de workout_traces estrenada, API semanal con tramos del plan.
- ✅ **T1b gráfica**: panel «Tiempo en zonas» en Rendimiento de la ficha —
  barras semanales con la escala --z*, huecos contados (jamás ceros), ventana
  3/6/12m, filtro por modalidad, banda de tramos bajo el eje, línea de
  confianza del ancla y enlace a programar el test de umbral. QA con dato real.
- Hallazgo de producto: CERO umbrales medidos en la población y atletas sin
  dob/FCmáx: la gráfica lo dice en palabras. Detección automática de umbral
  (nivel Garmin) aprobada como tanda posterior (tarea #11). Mina Garmin: #9.
- ✅ **T2 feedback publicable** (migs 0169, web `88cd7e9d`+`a147220d`, iOS):
  rangos marcables sobre la gráfica («Ojo aquí / Así sí», dato estructurado),
  «Dar feedback» abre el compositor con la nota premontada, forma `grafica`
  con ventana ABSOLUTA congelada al marcar, audio opcional en cualquier
  comunicado (almacén del coach + proxy por destino), y en iOS la gráfica
  dentro de la nota (`ZonasSemanaView` reutilizable) + reproductor. La frase
  del ancla la escribe el SERVIDOR (`source_label`): una sola voz. 100 tests
  web + 1147 iOS. Lección grabada: build en worktree fijado antes de Vercel.
- ✅ **T3 comparativa por periodos** (mig 0170): presets con las fechas REALES
  del atleta (antes/después del alta, antes/con el plan — desactivado con el
  motivo escrito si no hay plan —, trimestres) + a medida; dos columnas con
  reparto % por zona, horas y delta en palabras; embebible en la nota
  (display `comparativa`, misma longitud ambos lados, labels del servidor);
  el hueco declarado, jamás ceros. 59 tests. iOS render: tanda posterior.
- ✅ **Mina #9 desactivada** (`9b24dc08`): el webhook de Garmin FUSIONA por
  precedencia de campo (segment-fusion) y ya no borra los tramos del vivo ni
  sus zone_seconds. 17+7 tests.
- ✅ **T4 histórico HealthKit** (`ca032b0e`): import con consentimiento hasta
  2 años (Perfil › Apple Salud), ingest en bloque + rellena zonas con pulso
  viejo, Polar al conectar tira 90 d (techo API). 10 tests iOS + unit web.
- ✅ **Cobertura en Rendimiento + backfill Garmin al conectar**: el coach ve
  por fuente desde cuándo hay dato y si el «antes del plan» es creíble;
  OAuth Garmin dispara backfill 90 d (push al webhook). Programa partner
  Garmin puede estar en pausa para altas nuevas — ver `docs/garmin_setup.md`.
- ⏳ Siguiente: iOS render de la comparativa → #11 detección de umbral →
  #13 instalar iPhone cuando esté a mano.

## Antes · DEL COACH — comunicación estructurada fuera del chat (9-ago)

Idea de Alex: lo que hoy el coach solo puede decir por chat (un protocolo, una
pregunta que bloquea el plan, una tarea con fecha, el porqué de un cambio, un
foco) pasa a ser una entidad publicable y rastreable, el **comunicado**: tipo
(protocolo | pregunta | tarea | nota | foco) × ancla (plan | semana | sesión |
test | carrera | check-in | general) × ciclo de vida (publicado → visto →
hecho/respondido). El chat conversa; el comunicado se publica. Modelo y
absorciones (race_plans muerta, warmupChecklist vacío, coach_guidance…):
`docs/DECISIONS.md` (2026-08-09).

- ✅ **Doble: tanda «Del coach»** — 4 pantallas `propuesta` con el caso real del
  plan rehecho a Singles Pro: `coach-bandeja` (la bandeja que hoy no existe) ·
  `coach-pregunta` (el wave jueves/sábado, se responde con un toque) ·
  `coach-protocolo` (calentamiento de día de carrera, pasos marcables) ·
  `coach-nota` (el briefing legible por secciones). Validado por Alex en vivo.
- ✅ **Mockup del compositor del coach** — `docs/design/del-coach-compositor.html`.
  Validado: formulario puro (sin IA-redacta) + previa del móvil + biblioteca.
  **Corrección de Alex:** la vista global (pestaña de raíl) queda descartada —
  el seguimiento vive en la FICHA del atleta, lo urgente entra como señal en
  /hoy, y la biblioteca de plantillas dentro de Biblioteca (ver DECISIONS).
- ✅ **T1 cimiento:** mig 0160 APLICADA (comunicados+items+recipients+marks) +
  `shared/domain/coach-communications.ts` + endpoints coach (CRUD, publish
  todo-o-nada, `?athlete_id` para la ficha) y atleta (bandeja, seen/done/
  answer/marks) + push `coach_communication` + 30 tests verdes en rama Neon.
  De propina: cazado y arreglado el footgun `JSON.stringify(...)::jsonb` en
  TODOS los inserts de `notifications.payload_json` (8 sitios; ver DECISIONS
  «payload como OBJETO»; queda tarea de auditoría para las demás columnas).
- ✅ **T2a ficha + compositor:** pestaña «Del coach» en la ficha del atleta
  (lista con estado de un vistazo, detalle con seguimiento fino, vacío que
  explica la frontera con el chat) + compositor fiel al mockup (chips de tipo,
  pasos reordenables, «Dónde le aparece» en palabras de entrenador, «Desde
  biblioteca…», previa del móvil sincronizada en vivo). 14 tests + QA visual
  1440/390.
- ✅ **T2b señales + Biblioteca:** 3 señales nuevas en /hoy (pregunta sin
  responder, tarea vencida, protocolo sin abrir cerca de su fecha) con umbrales
  como DATO del coach (mig 0161 aplicada + resolutor sobre defectos de shared;
  API /api/coach/signal-thresholds) y pestaña «Comunicados» en Biblioteca con
  «Publicar a…» reutilizando el compositor. 135 tests verdes en rama Neon.
  Pendiente menor: UI de edición de umbrales en Ajustes (hoy solo API+default).
- ✅ **Nada se obliga (corrección de Alex, 9-ago):** el check es del PASO, no del
  tipo. Mig **0162 aplicada** (`coach_communication_items.checkable`, default
  true): un protocolo puede ser todo casillas, todo lectura o mezcla, y ya vale
  con título + texto (se cae el mínimo de pasos). El «hecho» derivado cuenta
  sólo las casillas y un protocolo sin ninguna deja de derivarse. Cada fila del
  compositor lleva su alternador «Con casilla / Solo lectura» y la previa deja
  de pintar círculo y botón de cierre cuando no hay nada que marcar. 68 tests
  verdes en rama Neon.
- ✅ **T3 iOS** (`6a03abf5`): módulo Comunicados completo — bandeja fiel al
  doble, detalles por tipo (protocolo con `checkable` y solo-texto sin CTA,
  responder de un toque), visto al abrir, push `coach_communication` con
  deeplink, entrada desde Inicio con badge. Las 4 pantallas del doble pasan a
  «construida». 1072 tests iOS verdes (+98). Instalada en el iPhone de Alex.
- ✅ **Fidelidad al mock** (mig 0163): secciones de nota con FORMA (texto ·
  cifra · reparto · **el camino**), el camino DERIVADO del plan real (tramo =
  microciclo, etiqueta = su nombre, hitos demostrables, color por posición —
  ver DECISIONS «El camino se deriva»), enlace cruzado entre comunicados,
  previa que sigue a lo que editas, y la **espina como pieza compartida**
  (`web/components/plan-espina/`) consumida por previa y doble.
- ✅ **Avisos editables en Ajustes** («Avisos de lo que publicas»: los 3
  umbrales con su valor de serie y restaurar) y ✅ **auditoría jsonb** de TODO
  lib/ (nutrition, sync garmin/healthkit/polar, weekly-review/evaluation,
  audit_log…) con lectores verificados por columna y tests.
- ✅ **La espina, lenguaje canónico de ciclos** (tarea #7): `plan-ciclo` del
  doble re-propuesto espina-first («estás aquí, semana N», calendario por
  tramo, la carrera cerrando el camino) · Periodización pinta cada secuencia
  con la MISMA pieza (`web/components/plan-espina/`) sin tocar la edición ·
  iOS renderiza las 4 formas de la nota (cifra, reparto, camino, enlace) con
  `EspinaDelPlan` reutilizable en `ios/FAHYBRIK/Plan/Espina/`. 27 tests web
  + 1096 iOS verdes.
- ⏳ **Pendiente de validación de Alex:** la propuesta `plan-ciclo` del doble
  (si la valida, se porta a la pestaña Plan de iOS con EspinaDelPlan). Tests
  frágiles ajenos anotados en tarea #8.

## Ahora · El importador habla UN dialecto — y el plan personal como entidad (9-ago)

Alex trajo su propio plan de 95 días en markdown (`health-planning/training/
plan-95d-hyrox-singles-pro.md`) y preguntó qué pasaría al importarlo. Medido
contra la gramática real, no estimado: **4 de 25 líneas entran limpias**, y lo
grave no son los fallos sino los aciertos a medias.

**El hallazgo raíz.** La misma serie, el descanso escrito de siete formas
estándar: sólo `c/2'30"` —la notación de Pablo— captura el descanso. `rec 150s`,
`cada 2'30"`, `(rec 2:30)` salen **`detected` tirando el descanso**; `, rec 2:30`
tumba la línea entera a revisión por culpa de la coma. Y un descanso no es
decoración: separa un 6×800 de VO2max de uno de umbral. Igual con la carga:
`Sandbag Lunges 4×50 m @30 kg` sale verde sin los 30 kg, y
`Farmers hold 3×45 s @2×32` se lee como **2 series de 32 reps**.

Esto es la HARD RULE Nº0 filtrándose al parser: la gramática da por hecho que
todo el mundo escribe como un coach concreto.

**El arreglo estructural** (idea de Alex, y es la buena): el disparador de la IA
está mal puesto. Hoy escala cuando la gramática *falla*; tiene que escalar
cuando la gramática *puede haber perdido algo*. Si al terminar de tipar queda un
número sin consumir, la línea no puede salir verde. Hoy una línea verde-con-
pérdida ni siquiera llega al modelo que podría rescatarla.

**Tanda 1 — CERRADA.** Medido sobre las 25 líneas reales del plan:
**4 → 14 entran limpias, y CERO pérdidas silenciosas** (las 11 restantes son
revisión honesta con el texto intacto). Las 8 stations tipan con su carga.

- ✅ `shared/domain/hyrox/stations.ts`: fuente única de las 8 estaciones (orden,
  slug real de `exercises`, medida canónica, carga por división/género). Open/Pro
  **sólo hombres** —única fuente dada—, todo lo demás `null` explícito y nunca un
  fallback al número masculino; `test-catalog.ts` ya lo consume.
- ✅ Gramática de dosis: dialectos de descanso (`cada` / `rec` / `r` / entre
  paréntesis / tras coma — antes SÓLO `c/2'30"`), carga sobre distancia y tiempo,
  `Target.kg.implement_count` (un farmers 2×32 son dos de 32, jamás 64),
  `Measure.kind:'reps_to_failure'`, y los dos guardias de honestidad.
- ✅ Guardia de **objetivo por referencia**: el guardia del agente compara
  NÚMEROS, así que «a split de carrera» se le escapaba entero y la línea salía
  verde con la distancia y sin intensidad ninguna. Ahora baja a revisión. Ancla
  en la preposición, no en la palabra: «Bulgarian split squat» sigue verde.

**Círculo iOS — CERRADO.** `Measure.repsToFailure` (copy `Vocab.alFallo` = «al
fallo»; sin suelo ni techo, que contarlo como 0 lo borraría del volumen) y
`Target.kg(…, implementCount:)` → «2×32 kg». El PM5 trata «al fallo» como las
reps: no es pieza programable, cuenta el atleta. BUILD SUCCEEDED en app y reloj,
1027 tests iOS verdes, 8 nuevos que fijan las dos regresiones.

**El vocabulario del modelo, CERRADO (9-ago).** Barriendo `types.ts` como
especificación —y no el documento que teníamos delante— salió que de **11
objetivos la gramática solo alcanzaba 4, y de 5 medidas solo 2**. RITMO no
entraba ni en `/km` ni en `/500m`: un coach de resistencia no podía escribir una
línea de su método, y eso es la mitad de HYROX más las dos estaciones de ergo. Y
lo peor no era lo que faltaba sino lo que mentía: un rango sin unidad conocida lo
cazaba el lector de repeticiones, así que «45 min entre 130-150 ppm» salía verde
como dos series de 130 y 150 REPS, y «Peso muerto 4x6 @150-170 kg» destruía el
4x6 entero.

Cerrado: ritmo (los tres formatos), pulso ppm/bpm, vatios, calorías como objetivo
y como medida, tiempo como medida, peso corporal, tope de tiempo, y las bandas de
verdad en distancia y kg. `%FCmax` se reconoce y va a revisión — el modelo no
tiene ese objetivo y derivarlo exige la FCmáx MEDIDA, nunca la fórmula de edad.
`dose.ts` partido en `target.ts` + `measure.ts` (estaba por encima del techo).

Sin cerrar y medido aquí: la banda de kg sobre medida de DISTANCIA
(`Sled Push 5x25 m @150-170 kg`) va a revisión. Es el guardia de residuo
funcionando — antes salía verde con 170, el extremo duro.

**Tanda siguiente — decidida, sin empezar.** Objetivo **derivado**. Y el hallazgo
que la reduce: el resolutor **ya existe**. `shared/domain/methodology/zones.ts`
traduce una etiqueta de coach («Z2», «race pace», «split 2:00», «Z4 row») en un
`Target` por atleta, con las bandas en dato editable del coach (mig 0061) y
marcando `.estimated` cuando tira de fallback. Y `shared/domain/running/vdot.ts`
implementa Daniels, el estándar de mercado. Falta CONECTARLO: el importador no le
pasa nunca la etiqueta, su vocabulario es canónico («race pace») y el coach
escribe «a split de carrera», y `resolveTarget` no está en la lectura del plan
del atleta (sí en dobles y en un script). Cero mecanismo nuevo.

Y después, las estructuras de metcon (ronda rotatoria, chipper continuo,
EMOM/AMRAP con componentes): el esquema ya las soporta, la gramática no las sabe
escribir.

**Usando la app (9-ago) — dónde está de verdad el atasco.** Levanté el dashboard
y planifiqué como un coach en vez de leer código. Tres cosas:

1. **El sitio donde se planifica es una línea de texto libre** en el editor de
   día, con este placeholder: `press banca 4x4 @78-80% r90 · 10x400m r1' · 45'
   carrera z2`. O sea que TODO lo del importador es el camino diario del coach,
   no una función de migración. **Y el propio ejemplo perdía el descanso**:
   `r90` y `r1'` salían verdes tirándolo, porque el patrón exigía frontera de
   palabra tras la señal y entre `r` y `9` no la hay. Arreglado (clase 24).
2. **La palanca real es Periodización.** Cada nivel (N1–N5) × días/semana (3, 4,
   5, 6) = 20 secuencias que se montan UNA vez, y después «todo atleta de N4 cae
   en la variante de sus días y recorre la secuencia automáticamente». Eso es
   1 coach → 100 atletas, y está bien pensado. **Está a `0/4` en N4**, que es
   donde están 2 de los 3 atletas: montado y sin llenar.
3. **56 de 99 bloques no se pueden prescribir** (29 sin dosis, 27 sin tipar).
   Ese es el cuello de botella de todo lo anterior: no se pueden montar
   secuencias con una biblioteca a medias.

**El reparto REAL de la biblioteca a medias (medido, 54 bloques sin tipar):**

| | | |
|---|---|---|
| **12** | entran con el lector de hoy | 6 de movilidad + 6 que cerró la gramática de metcon |
| **22** | **incompletos EN ORIGEN** | el coach nombró el movimiento y no dijo cuánto |
| **20** | límite del lector | EMOM no divisible, tope en rango, cadenas con un tramo sin dosis |

**Los 22 no los rescata ninguna gramática.** `WOD For Time 4r: KB overhead lunge
+ thrusters + clean + TTB – TC12'` no tiene repeticiones porque el coach no las
escribió. Eso deja de ser un problema de parser y pasa a ser de producto: hacer
que completar esos 22 cueste minutos, y que un bloque nuevo no pueda nacer a
medias. Es el siguiente trabajo real de la biblioteca.

**Y el rescate NO era gramática de dosis.** Medí en seco los 54 bloques con
prosa y sin tipar: **solo 6 entrarían** con el lector nuevo, y los seis son
movilidad. Los otros 48 son **todos WODs** — `WOD 5r: 24 wall balls + 20m SB
lunge + 14cal skierg – TC55'`, `EMOM 16' run/ski/farmer carry`, `45'' on/15''
off x10r`, `4r X + 3r Y + 2r Z + 1r W`. El hueco es la **gramática de ESTRUCTURA
del metcon**, no el vocabulario de dosis, y es justo el terreno donde este
producto tiene que ganar a las apps de gimnasio. 🟡 En curso con el corpus real
de los 48 como especificación.

**Retirados los pesos de estación.** Estaban en `shared/domain/hyrox/stations.ts`
sacados de un plan que era un EJEMPLO generado por IA, no una fuente. Ahora
`hyroxStationLoad()` devuelve `null` para todo. Las distancias se quedan: esas sí
vienen del rulebook citado en `test-catalog.ts`. Para rellenarlo hace falta el
rulebook oficial y entero (mujeres, elite, doubles, edad).

**Notación aprendida por coach — el cimiento que falta.** `coach_exercise_synonyms`
(mig 0109) hace que el coach corrija UNA vez el nombre de un ejercicio y no vuelva
a fallar. No existe nada equivalente para la NOTACIÓN: quien escriba `r 90"` o
`RP` cae a revisión para siempre, cada semana. Eso es lo que hace que un coach
pruebe dos semanas y se vaya, y es lo que permite que el coach que está en cola
entre sin que escribamos su dialecto a mano.

**Tanda 3 — diseñada, sin empezar.** El **plan personal**: contenedor de plan
para UN atleta, dentro de su perfil, fuera de la biblioteca de microciclos. La
diferencia estructural encontrada: `program_week_templates` lleva
`level_id`+`phase_id` porque está hecho para emparejarse con un GRUPO (nivel ×
fase); un plan para una persona no tiene nivel que emparejar. Fases opcionales,
nunca obligatorias.

**Deuda encontrada, no arreglada aún:** `web/lib/dashboard/v2/hyrox-template.ts`
y `web/lib/templates/station-defaults.ts` tienen cada uno su propia copia de las
distancias/cargas. La segunda ha derivado: una sola carga por estación sin
partir Open/Pro, y su wall ball de 9 kg es el valor **Pro** puesto donde se
espera un default Open.

**Pendiente de fuente oficial:** cargas femeninas, división elite, doubles/relay
y grupos de edad. El documento de Alex sólo trae los masculinos de Open y Pro.

---

## Antes · CORRER, a fondo — Alex salió a hacer series y la app le sirvió de poco (8-ago)

Alex salió a correr con el iPhone y el reloj, entreno LIBRE, unas series. Lo que
reportó y lo que salió al tirar del hilo en el código:

- **«No se pueden hacer series»** — y tiene razón de raíz, no de pintado. Hay
  tres formas de escribir el mismo entreno y sólo dos llegaban al motor de
  tramos: la gramática nativa (`structure`) ✓, la tabla de `sets` del coach ✓, y
  las rondas de `intervals` del constructor libre ✗. La tercera caía al motor
  rotativo binario trabajo/descanso.
- **«Los metros se quedaban a cero»** — en la muñeca, una serie libre de correr
  caía en `RelojDeParedLiveView`, el guion escrito para burpees y planchas
  («sin GPS que valga, estás en el sitio»): sin metros, sin ritmo y en modo
  ciego mientras corría por la calle.
- **«Juraría que los ha contado mal / parecía que se los inventaba»** — no se
  inventan: es GPS con filtro (descarta fixes >25 m de error, pasos <2 m o
  >60 m). Lo que estaba mal era la VENTANA: fuera del motor de tramos se
  pintaban los metros del BLOQUE contra un objetivo POR SERIE, así que en la
  serie 2 arrastraban la 1 más el trote de vuelta.
- **«La recuperación no es un descanso, es zona X»** — el modelo ya lo soporta
  (una recuperación lleva su propia medida, su objetivo y su modo
  trote/caminar/parado); quien no lo soportaba era el constructor libre, que
  sólo escribe `restS: 90`. Y el diseño de la muñeca daba por hecho que el
  atleta está de pie: congelaba el crono del tramo y dejaba de pintar metros.
- **Saltos de diez en diez** — los metros viajaban al reloj en cubos de 10 m; a
  ritmo de carrera, un refresco cada tres segundos.

**Plan, 3 tandas:**

1. 🟡 **Motor y modelo** (en curso). Una sola gramática para las tres fuentes.
   Hecho: `RunPiernasDerivadas.swift` (antes `RunSeriesDeSets`) deriva tramos
   también de `intervals`+`rounds`; `RunLeg.recuperaEnMovimiento` +
   `WorkoutSession.tramoMide` (el crono del tramo ya no se congela en un trote de
   vuelta, que es el denominador de su ritmo); correr nunca cae en el reloj de
   pared (`LiveFlowView`); los metros viajan al METRO en el espejo (GPS y cinta);
   `GuionSeries` tiene página de recuperación EN MOVIMIENTO (contexto «Trota»,
   modo ojeada, segundo nivel = tu ritmo). 974 tests iOS verdes (+11).
2. ✅ **Constructor libre** hablando la gramática entera. `FreeRunPlan` +
   `FreeRunBuilderView`: calentamiento? · lista de bloques (cada uno con su
   «repetir ×N» y sus tramos) · vuelta a la calma?, y cada tramo con rol
   (correr | recuperar) × medida (distancia | tiempo | lo dices tú) × objetivo
   (zona | ritmo | RPE | libre) × modo de recuperación × cuesta. Correr se salta
   el paso «Formato» —su esquema lo deduce el plan— y emite `structure`, con los
   campos planos viajando debajo (contrato aditivo del cable). Probado contra los
   siete entrenos reales: serie, fartlek, pirámide, progresivo, tempo con sus
   extremos, cuestas y rodaje largo con acelerones. Los tests cazaron que el
   CALENTAMIENTO contaba como trabajo (la card de un 4×1000 Z4 anunciaba
   «10 min Z2») → `tramosDelEntreno()`, la fase manda y no el rol.
3. ✅ **Pantallas de correr con color de zona** (idea de Alex: la zona en grande,
   la pantalla llenándose del color de la zona en gradiente hacia la siguiente).
   Hecho: el mecanismo que faltaba —DÓNDE de la banda estás— en shared
   (`hrZonePosition`) y en iOS (`HRZoneProfile.posicion`); pantalla `propuesta`
   del doble `watch-zona` (tres escenarios: subiendo, con objetivo, sin umbral);
   y portado ya a Swift: `WatchLienzoZona` + `WatchPaginasComunes.zona`, wireado
   en rodaje y en series. El lienzo va en TODAS las páginas de una vista de
   correr, no sólo en la de zona. Sin umbral no hay página ni color (§7).

4. ✅ **El aro on/off de la serie** (Alex, 9-ago: «serie on naranja, serie off
   gris»). Tenía razón en que estaba a medias: el marcador existía como
   `AroTramos` en el doble (para el resumen) pero la pantalla en vivo contaba
   SÓLO piernas de trabajo y en la recuperación se cambiaba por un aro que
   drena — la mitad del entreno no existía en el bisel. Ahora el aro dibuja la
   fase entera: hue = qué es (trabajo naranja / recuperación gris), brillo =
   dónde estás (hecho / en curso / por venir). El ancho de cada arco se reparte
   por orden de evidencia (`FormaDelAro`): segundos si se saben todos, metros si
   todos van por distancia, iguales si no — nunca estimando con un ritmo que
   nadie escribió. Va en las DOS vías (reloj en solitario y espejo del móvil, con
   la forma viajando por el cable) y en el doble (`watch-series`).
   De paso salió un fallo de la misma raíz: contar por ROL hacía que un
   «10' + 5×800» dijera «Serie 1 / 6» calentando. La FASE manda: `serie` cuenta
   sólo la parte principal y cada parte se llama por su nombre. 1019 tests iOS
   verdes (+19).

**Desplegado y en su mano:** web en producción (`fahybrik-ms9kihp3n`, la
pantalla `watch-zona` del doble incluida) e iOS+watchOS instalados directamente
en el iPhone de Alex (`00008110-001610123C99801E`, la app del reloj va embebida).

**Lo que NO se ha hecho, dicho explícito:**
- **«La UI de inicio de empezar es la antigua»** — no sé a qué pantalla se
  refiere exactamente (¿los mosaicos de modalidad del constructor? ¿la ficha
  previa? ¿la puerta del bloque?). El flujo de correr sí cambió de paso
  (ahora modalidad → montar el entreno, sin «Formato»), pero eso es otra cosa.
  Pendiente de que lo señale.
- **El repaso de color del resto de la muñeca** — el lienzo de zona sólo entra
  en las vistas de correr. Ergo, fuerza, EMOM y compañía siguen con el tinte
  plano al 38 %.
- **El aro on/off SÓLO en correr.** Fuerza, ergo y el reloj de pared siguen con
  el aro segmentado por repeticiones: ahí los trozos son iguales y el «off» es
  un descanso que no se ejecuta. Si algún día un descanso de fuerza tiene que
  verse en el bisel, la pieza ya existe (`WatchAroEstructura`).
- **Deuda de lint preexistente en web** (10 errores en ficheros que no toqué:
  `CarrerasTab`, `RendimientoTab`, `use-injuries`, `EvaluarSemanaPanel`,
  `RunStructureForm`, varias rutas de API). No los toco porque son de otra
  sesión en vuelo.

---

## Antes · Circuito llega a Biblioteca/tests + editor de contenido real para tests — DESPLEGADO (8-ago)

Las 4 piezas están cerradas y en `feat/pm5-counter-sync` (última: `0a235d79`).
Desplegado a producción: `dpl_4H3THUFqCaSUefBJHJTPsYkkjU6h`, aliased a
fahybrid.com. Migración 0159 (`template_blocks`) ya aplicada a Neon producción
desde antes. iOS/watch: cambios en el repo, pendientes de instalar en el
dispositivo físico de Alex (no es despliegue web).

Alex señaló que el editor de "Nuevo test" (`/tests`) no construye nada real:
"Protocolo" es texto libre, "Resultados" es una lista abstracta desconectada
del entreno. Auditado hasta el fondo contra Neon real:

- El mecanismo correcto YA EXISTE (`Prescription`, el mismo tipo serie×medida×
  objetivo de los entrenos normales) pero solo lo usan 2 de los 5 tests de
  fábrica (5K, Remo 2K) — "Batería 1RM" y "HYROX half-sim" nacen sin contenido.
- **Bug activo, ya manifestado en producción:** cualquier Guardar en el panel
  borra el `prescription_json` real y lo sustituye por un ancla vacía —
  el Remo 2K del coach 60 ya lo perdió (`updated_at` 26-jul). Recuperable con
  "Restaurar batería por defecto".
- Auditando la ruta Biblioteca (`template_segments`) para HYROX half-sim
  apareció el hueco que la decisión de Circuito (7-ago, ver abajo) había
  dejado pendiente a propósito: 20 bloques circuito reales del coach + 10 ya
  materializados por atleta, con el `rounds` metido en el TÍTULO del bloque a
  falta de columna — el mismo síntoma que motivó esa decisión, sin auditar aún.

**Plan (Alex: "todo junto, retomando Circuito"), 4 piezas, foundational primero:**
1. ✅ Tipo compartido `CircuitConfig` (rounds/pacing por_tarea·por_reloj/descansos
   separados entre estaciones y entre rondas) + tabla `template_blocks`
   (migración 0159, sin backfill a propósito — no se inventa `pacing`) +
   `assignment-detail.ts` ya sirve la config real en `config_json` cuando existe.
2. ✅ Editor de día (`ComponentsForm.tsx`): UI de bloque real —
   `CircuitConfigFields` (rounds Stepper, pacing por_tarea/por_reloj, ventana
   de trabajo SOLO si por_reloj, dos descansos) edita `EditorBlock.circuit`
   directo; fuera el `applyHead` que copiaba rounds/work_s/rest_s en CADA
   estación (el mecanismo que ya divergió en 2 de 22 grupos reales). Solo se
   activa para el bloque Circuito (`format === 'circuit'`) — WOD/EMOM/Tabata
   siguen con `applyHead` tal cual, fuera de este corte. Circuito nuevo nace
   con `circuit: {rounds:3, por_tarea}` (antes duplicaba rounds/rest_s en la
   prescripción de la estación — ya no). Wireado round-trip completo:
   `editor-data.ts`/`editor-serialize.ts` (mismo contrato "input manda,
   si no se preserva" que `group`/`coach_note`) y `day-editor-io.ts`
   (`sessionsToWire` no mandaba `group`/`optional`/`coach_note` al servidor
   tampoco — gap preexistente fuera de este corte, solo se cerró para
   `circuit`). Typecheck limpio, 1001 tests verdes (+8 nuevos), lint limpio.
3. 🟡 Motor en vivo iOS/watch (`WorkoutModels.swift`) — **parcial, a propósito**:
   `conditioningFold` ya lee `pacing` (por_tarea fuerza sin reloj SIEMPRE, ni con
   leftover de item — la confusión de "ventana trabajo" pedida sin reloj), los
   dos descansos viajan separados (`restS` = entre estaciones, `restBetweenRoundsS`
   nuevo = tras la ronda), y el target de cabecera ("3:45/km huérfano") ya no se
   presta del item 0 — solo sobrevive si TODOS los items coinciden. Fallback
   legacy exacto cuando no hay `pacing` (todo bloque hoy). 958 tests iOS verdes.
   **NO hecho, deliberadamente**: generalizar el cursor por estación
   (`fixedListIsStations`/`Cursor.fixedStation`, `LiveTramo.swift`) a un
   circuito real con rondas. Investigado a fondo: `StrikeList`/
   `ForTimeContextStrip`/`StationSubject` asumen lista plana de un solo paso, y
   el motor FIXED no tiene NINGÚN estado de descanso hoy (solo el motor
   ROTATING lo tiene) — requiere un diseño propio, no cabía en un cambio
   aditivo. Sigue pendiente como pieza propia (con pase de UX antes, por la
   regla de prioridad UX del proyecto).
4. Editor de tests real: bloques de verdad en vez de "Protocolo" en texto libre.

Ver `docs/DECISIONS.md` (8-ago) para el detalle técnico completo una vez cierre.

## Antes · el panel «Nuevo test» ya no roba el foco al teclear — DESPLEGADO (8-ago)

`SidePanel`/`AddMicrocicloPicker` enfocaban su contenedor en un `useEffect`
con `[onClose]` de dependencia — `onClose` es una arrow function que el padre
recrea en cada render, así que cada tecleo disparaba el efecto otra vez y le
robaba el foco al input (Alex: «solo puedo 1 carácter a la vez, tengo que
hacer clic»). El foco al abrir ahora corre UNA vez (deps vacías); el listener
de Escape sigue dependiendo de `onClose` sin problema — no roba foco.
`627fe068`, `dpl_EkZDLKEzwBoc12KjAdYKhbZ2dLAf`, aliased a fahybrid.com.

**No verificado con clic real en navegador** — el dev server compartido
(puerto 3901, de otra sesión) tenía la conexión a Neon caída en el momento;
no se reinició por no ser mío. Diagnóstico por lectura de código: patrón muy
conocido de React, encaja exacto con los tres síntomas reportados (borde
naranja parpadeando = foco programático repetido, cursor que sale = foco
robado, un carácter y clic = el efecto se re-dispara en cada tecleo).

## Antes · el editor de día ya resincroniza — DESPLEGADO en producción (7-ago noche)

**Bug real, no cosmético, encontrado en la misma sesión de pruebas de arriba:**
la nota que Alex escribió para «Puente de glúteo» se guardaba perfecta en la
plantilla de la semana y nunca llegaba al atleta ya asignado. Rastreado hasta
el fondo contra Neon real: `instantiateWeekIntoMicrocycle` materializa una
COPIA DE UN SOLO INSTANTE, sin dejar ningún rastro de qué plantilla salió —
no había forma de saber a qué microciclos ya asignados avisar cuando el coach
edita después. Ver `docs/DECISIONS.md` (7-ago, «Asignar una semana deja de ser
una copia de un solo instante») para el detalle completo.

**Arreglado y DESPLEGADO** (`0d896d0a`, `dpl_8nVEsEtPSobU1yYUBpc3NMxyAWfi`,
aliased a fahybrid.com): migración 0158 (`microcycles.source_week_template_id`,
linaje) + `resyncWeekTemplateAssignments` (reusa el motor de materialización,
reemplaza el contenido de cualquier asignación todavía `'scheduled'`, nunca
toca una que el atleta ya completó/parcial/saltó) + el guardado del editor de
día la llama automáticamente, best-effort. Verificado contra una rama Neon de
test real (creada y borrada esta sesión, no mock): 2 tests nuevos
(`resync-week-template.test.ts`) + el resto de `coach-integration/` (60/62 —
2 fallos preexistentes de OTRA feature en curso, «#34 tests calibración»,
sin relación con este cambio, verificado por `git log`/`git diff`).

## Antes · card del Plan — build fresco instalado directo en el iPhone de Alex (7-ago noche)

Alex probó la card de hoy en un build viejo (anterior a `a56b9b0b`) y reportó
tres cosas: no veía los nombres de ejercicio ni la nota del entreno dentro de
la card, y el pull-to-refresh no le respondía. Las dos primeras ya estaban
arregladas en código sin llegar a su móvil; la tercera era un bug real nuevo.

**Arreglado esta tanda (`a56b9b0b`, `17e60d1a`):**
- La card de hoy enseña los NOMBRES de los ejercicios del bloque, no un
  recuento («3 ejercicios» → «Puente de glúteo, Marcha desde puente de
  glúteo, +1 más»). Si el coach dejó nota para hoy, esa nota ocupa el sitio
  de las cifras (se repiten en cuanto abres la sesión).
- «Ver técnica» en el pre-entreno ahora abre la MISMA `ExerciseDetailView`
  que ya usa `SessionExercisesSheet` (vídeo + consejos + descripción + nota),
  y aparece también cuando el ejercicio solo tiene descripción, sin vídeo —
  el caso real que Alex reportó (Puente de glúteo).
- `FillingScreen.scrollBounceBehavior` era `.basedOnSize`: un día con poco
  contenido llena exactamente el alto disponible, sin margen para rebotar, y
  sin rebote `.refreshable` no tiene hueco donde aparecer. Pasado a `.always`.

**Segunda ronda, contra ese build fresco (`1028c984`):** el hueco bajo las
partes seguía cayendo a la dosis (series/carga/descanso) cuando la sesión
tenía un solo bloque — nunca debe: ese hueco es SOLO la nota del coach, sin
nota se calla. Y el bloque único repetía el título de la sesión («Trainingpeaks
· Semana 1» dos veces) — el título del bloque ahora solo se enseña si hay más
de uno que distinguir. Con esto, un día de un bloque y un día de cinco
bloques usan la MISMA composición — antes lucían como dos diseños distintos.
Borrado `ClaveDosis`/`DatoClave` (sin otro consumidor). 42/42 tests, instalado
de nuevo directo en el iPhone físico (`xcrun devicectl`, sin esperar
TestFlight — sigue bloqueado por la firma pendiente, ver más abajo).

**Auditoría grande en curso, PAUSADA a mitad:** Alex pidió analizar y luego
diseñar de verdad el concepto «Series/Circuito» (rondas de varias estaciones
en hybrid training) — hoy no existe como tipo, son N líneas sueltas que
copian `rounds`/`work_s`/`rest_s` por convención de UI, y esa copia ya se
demostró rota en producción (2 de 22 bloques circuito reales tienen el campo
en una estación y no en otra). Auditados a fondo iOS+watch (motor en vivo,
`LiveTramo.Cursor`), el editor web (`ComponentsForm.applyHead`) y los datos
reales en Neon — modelo propuesto y aprobado por Alex en `docs/DECISIONS.md`
(7-ago, «Circuito pasa a ser un tipo de bloque real»). **Sin construir
todavía** — se interrumpió para atender el feedback en vivo de arriba. Quien
retome: el modelo y los 3 hallazgos de investigación están en esa entrada de
DECISIONS.md; falta escribir el schema compartido, el editor web, y el motor
+ reloj en iOS.

---

## Antes · «semana cero» diseñada, sin construir — DESBLOQUEADO (7-ago noche)

**El refactor de Plan que bloqueaba esto ya cerró y compila.** `PlanView.swift`/
`PlanHoyModel.swift`/`PlanHeroeHoy.swift`/`PlanHoyAtoms.swift` commiteados y
verificados (`dd2c6e80`): build limpio, 41/41 tests. `claveDeMostrado`,
`cargarDetalleDeMostrado`, `diaSeleccionadoId` ya existen; `desgloseHoy`,
`desgloseDe`, `diaAElegir`, `tocarDia`, `ElegirSesionDelDia` quedaron borrados
a propósito (el mecanismo nuevo — un solo día MOSTRADO, seleccionable por
toque o deslizando semana — no los necesita). Quien retome puede tirar de
`main`/`feat/pm5-counter-sync` sin esperar más.

**Lo que queda por hacer:** construir la semana cero. Diseño cerrado en
`docs/design/puesta-a-punto-model.html` (abrirlo). Resumen: es
`week_offset = 0` en `coach_test_schedule` (hoy prohibido por `CHECK >= 1` en
base y zod → pide migración que relaje a `>= 0`); se llena de DOS fuentes que el
coach ya tiene hechas — sus tests de calibración (automáticos, ya hay inyector
en `instantiate-program.ts:185`) y su biblioteca (arrastrar/activar). Preajuste
reutilizable POR NIVEL, nunca autoría por atleta. Fuera de la periodización
(`microcycle_id = null`, que ya es lo que pasa). Falta decidir alcance.

**Arreglado y desplegado hoy en esta tanda:**
- La app dejaba de mentir: el vacío decía «tu coach aún no ha publicado tu plan»
  con el plan YA publicado y empezando el lunes siguiente. Ahora son tres estados
  honestos, con «Tu plan empieza el lunes 10 de agosto». Campo nuevo
  `AthleteWeekPlan.plan_starts_on`.
- Tres afirmaciones de MÉTODO fuera del copy (ver DECISIONS.md 7-ago: la app no
  puede decir lo que un coach hace ni con qué cadencia).
- Doble reserva: asignar dos veces ya no duplica los entrenos
  (`instantiate-program.ts`, guarda por atleta+fecha+slot).

**Hallazgos anotados, sin tocar:** el guardián de idempotencia de la calibración
mira toda la vida del atleta (por eso el plan nuevo de Alex no lleva tests); el
alta por intake ancla a ESTE lunes y crea días pasados; deriva de contrato en
los tests (editar uno ya forkeado → 422 `unknown_slug`); la maquinaria de tests
está sin estrenar (2 asignaciones en toda la producción).

---

## Antes · Rediseño del editor de microciclos — FASE 1 + FASE 2 EN PRODUCCIÓN (7-ago)

Alex aprobó la maqueta (`docs/design/microciclos-editor-rediseno-mockup.html`)
y las dos fases están desplegadas en app.fahybrid.com
(`dpl_DeS3YXCUqzkFQqgum98Tmh8yZnNy`, último). Mismo patrón las dos veces:
contrato escrito antes de construir + cimientos del líder + agentes en
worktrees en paralelo + integración/QA en producción por el líder.

**FASE 1 (cero cambios de schema/API):**
- **Semana**: tarjetas con bloques+dosis en mono y lomo de modalidad, weekstrip
  (sesiones/bloques/ejercicios + barra apilada + chip «N bloques sin dosis»),
  día vacío compacto, puntitos en S1..SN.
- **Día**: carril de días sticky + hoja plana; DOSIS COMÚN derivada una vez por
  bloque con «hereda N×M» por fila; QUICKLINE con `parseNotationCell` en
  cliente (chips en vivo, honestidad: lo no entendido va a revisar, exercise_id
  JAMÁS inventado); drawer lateral derecho.
- **Compositor**: steppers/chips por dedos, %RM en TickBand con rango, pirámide
  por serie, «El atleta ve» fijo al pie, modalidad como dato del ejercicio.

**FASE 2 — «venga la fase 2», construida el mismo día (cero migración SQL,
`optional`/`rounds_max` viven en `slots_json` jsonb):**
- **Cimientos del líder**: `Prescription.rounds_max` (mismo patrón que
  `Measure.max`, 5-ago) + `WeekDayPart.optional`/`EditorBlock.optional`,
  autoritativo desde el input del day editor. `prescriptionToText` ya renderiza
  la banda de rondas.
- **Stream A** — rango de rondas: chip «＋ rango» en `component-stations.tsx`,
  cubre rounds/emom/intervals/for_time/tabata con un solo cambio.
  **Encontró y reportó** (arreglado en integración): `cleanScheme()` no
  limpiaba `rounds_max` huérfano al cambiar a un formato sin rondas.
- **Stream B** — rango de reps en «Series iguales»: antes solo se podía
  DESPLAZAR un rango existente, ahora se puede CREAR uno desde un punto
  (chip fantasma «＋ rango» → Stepper de techo → «quitar rango» limpio).
- **Stream C** — superserie visible y creable: picker «Series rectas |
  Superserie» en el compositor (normaliza TODO el bloque a la vez, nunca un
  ejercicio suelto — el bug que DECISIONS.md 5-ago documentó haber arreglado
  una vez), etiquetas A1/A2/A3 en la hoja del día en vez de A/B/C cuando rota.
  **Encontró y evitó**: el arquetipo `strength` solo edita el primer ejercicio;
  volver a series rectas con 2+ ejercicios cae al editor legacy por-item en vez
  de dejar el segundo ejercicio huérfano.
- **Stream D** — «Opcional» de punta a punta: toggle en el header del bloque
  (día + compositor), badge en Semana, el importador reconoce el prefijo
  literal «OPCIONAL:»/«OPCIONA:» (typo real tolerado) y lo convierte en el
  flag. **Backfill de producción aplicado y verificado dos veces** (por el
  agente y de forma independiente por el líder): microciclo 76 (`program_week_
  templates.id=180`, no 76 — el brief tenía el id equivocado, el agente lo
  detectó contra la DB real antes de escribir), domingo, 2 bloques.
- **Integración (líder)**: fusión de `rounds_max`/superserie/opcional en
  `compositor-chrome.tsx` (los 3 streams tocaban el mismo header), arreglo de
  `rounds_max` huérfano.
- **Bug real cazado en QA de producción, no de fase 2**: cambiar de día en el
  carril dejaba el panel mostrando el día ANTERIOR (cabecera y carril sí se
  actualizaban) — `<DayEditor>` no llevaba `key` por semana+día, así que React
  reutilizaba la instancia y `useState(initial)` sin resincronizar se quedaba
  con las sesiones viejas. Arreglado con `key={dayKey}` en `MicrocicloV2.tsx`.
  Estructural desde fase 1, no introducido por ningún stream de fase 2.

**Verificado en producción** con sesión Clerk real: los 4 huecos probados en
vivo en el microciclo real de Alex (badge Opcional en Semana y Día, drawer con
picker de superserie + etiquetas A1-A5 + rango de reps 8-12, navegación de día
arreglada). tsc limpio (salvo el error preexistente `complete-gaps.test.ts:138`),
698 tests editor+prescription+programming+import en verde (3242 la suite
completa), 4 tests nuevos que fijan `rounds_max`/`optional` como contrato.

**NO verificado en vivo**: el control de rango de rondas de circuito (Stream A)
— sí cubierto por sus 16 tests propios y revisión de código, pero ningún bloque
del microciclo real usa ese archetype concreto (rounds/intervals) para probarlo
sin crear un bloque de prueba en el dato real de Alex. Biblioteca de bloques y
SessionEditor (montan el mismo BlockEditor rediseñado) sin pasada visual.

**PENDIENTE — hallazgo de dominio, no bug de código**: los «3 bugs del
importador» del encargo original NO reproducen en la gramática actual
(verificado con los 3 verbatims reales antes de tocar nada). El problema real
es que `block_exercises` se generó con un script de un solo uso ANTERIOR a
esta gramática. Dry-run contra las 99 filas reales de coach 60
(`infra/scripts/repair_block_exercises_grammar.ts`, solo lectura): 22 rellenos
limpios (bloques/filas vacías) + ~53 casos donde el fresco es más completo que
lo guardado (necesita diff por campo, no por objeto entero) + ~29 que ni la
gramática de hoy resuelve (WODs densos, correctamente a `review`). Sin aplicar
nada — el heurístico de «qué cuenta como contenido» tenía un fallo real.
Detalle completo en `docs/DECISIONS.md` (7-ago).

---

## 7-ago · Importar plan por foto — «Completar huecos»

Un clic en la revisión: resuelve ejercicios (match/crear/descartar basura) y
siembra dosis genéricas marcadas como propuestas. El coach confirma y refina
en el microciclo. Archivos: `import-complete-gaps.ts` + botón en
`ImportReviewGrid`.

---

## Antes · confirm desbloqueado (7-ago tarde)

Descartar basura + strip de líneas sin nombre: sin eso, crear 5 ejercicios
dejaba 43 líneas bloqueando Confirmar.

---

## Antes · 504 del assist — DESPLEGADO

**Síntoma:** visión OK (~20s) + `placed`, luego 504 a 300s. Fix `8037d14f`
existía en la rama pero no en prod.

**Desplegado 7-ago:** `dpl_EcsQGCh85thWRu21b2UobY2oW8Wf` + modelo
`x-ai/grok-4.5` en vision/chat.

---

## 6-ago (noche) · La pestaña Plan pasa a ser «hoy dentro del bloque» — CONSTRUIDO

Alex enseña el mockup `plan-bloque` del doble y pide incorporarlo al plan real.
Auditado antes de tocar Swift: `InicioView` y `PlanView` leían el MISMO
`store.planWeek`, derivaban el MISMO `SessionMarkState` y navegaban al MISMO
destino — dos renderizados de «qué toca hoy» con dos copys distintos. Decisión
completa en `docs/DECISIONS.md` (6-ago).

**Construido y en `feat/pm5-counter-sync`** (`d318781f`/`232d417d`/`ca893ae8`):
`PlanView` (2023→582 líneas) es ahora el bloque + carril de 7 días + hoy en
grande con su desglose real (`AssignmentDetail` solo de hoy, nunca la semana
entera) + pie que abre `PlanCicloView` (nuevo, real: bloque actual + semana a
semana con cumplimiento + próxima semana). `InicioView` pierde el héroe, la
fila PM y «Hecho hoy»; conserva readiness/carrera/tendencias/pareja/pasos.
Cuatro correcciones que el dato real impuso sobre el mockup (cinco estados de
día no cuatro — `partial` existe y colapsarlo en «hecha» mentiría · `group`
descartado, `estructural` sale del `format` del bloque sin schema nuevo ·
«Semana N de M» no puede salir de `macro_progress` — sale de `week_label` ·
`compliance_pct` es fracción 0–1, no porcentaje). Detalle completo en
`docs/DECISIONS.md`.

**Verificado independientemente** (no solo por quien lo construyó): `xcodebuild`
limpio sin warnings nuevos, 41/41 tests nuevos en verde (`PlanHoyModelTests` +
`FormatoTests`) tras resetear el simulador (el primer intento colgó con el
flake ya conocido del runner). Doble re-sellado: `plan-bloque` → `construida`
(difiere en un punto real: AM+PM es fila compacta, no está en el mockup de 4
escenarios) · `plan-ciclo` sigue `propuesta` — lo construido es una v1 real
pero deliberadamente más simple (una etapa, no la secuencia encadenada del
mockup) porque `macro_summary.block` llega null del servidor.

**Sin verificar: nadie lo ha visto con datos de un atleta real** (sin bearer de
sesión en el entorno de build). Primera cosa que hacer.

---

## 6-ago · Que el reloj reconozca el movimiento (DISEÑO — sin construir)

Alex pide un plan para que el reloj sepa qué está haciendo el atleta: las ocho
estaciones de HYROX, y si se puede, también la fuerza (banca, peso muerto,
sentadilla). → **`docs/reconocer-el-movimiento.html`**.

**Lo que cambia el planteamiento: no es una capacidad, son cuatro**, y dos de
ellas **no necesitan datos etiquetados** — detectar trabajo/descanso y contar
repeticiones se resuelven con procesado de señal (la línea base de MM-Fit, *sin
entrenar nada*, acierta el 96 % de las series dentro de ±1 rep). Clasificar el
movimiento es la única que pide corpus, y es la que menos falta hace porque
**el programa ya declara qué toca**. Orden invertido respecto al instinto.

**Las ocho estaciones:** 2 ya resueltas por hardware (el PM5 emite ski y remo:
medida, no inferencia) · 4 con evidencia publicada desde muñeca sola (Soro et
al. 2019, 54 sujetos, 98,9 % en 10 clases que incluyen burpee y wall ball) ·
**2 sin literatura ninguna** — sled push y farmer's carry, donde la muñeca va
agarrada y deja de moverse. Esas dos no se clasifican: las sitúa el orden fijo
de la carrera.

**Fuerza — y aquí me corregí a mí mismo a media tarde.** En barra la muñeca *es*
la barra y se mide la velocidad de cada repetición (Apple Watch 7 vs captura
óptica: r=0,95, revisado por pares). Escribí que eso hacía del RIR una medida y
que la pérdida intra-serie «cancela sesgos por ser un cociente». **Las dos cosas
eran falsas** y las retiré: el atleta entrenado acierta su RIR con 0,65-1 rep de
error, los modelos generales de velocidad fallan por más de 2, la validez del
acelerómetro de muñeca **se hunde con cargas pesadas** (r=0,33 al 100 % 1RM), y
el error crece cuando la barra va lenta — que son justo las últimas reps, las
que definen la pérdida. El cociente arrastra el error, no lo cancela.
**Lo que queda es mejor:** el modelo velocidad→RIR *individualizado* sí funciona,
y nadie lo tiene porque nadie recoge ambas señales a la vez durante meses.
**El RIR tecleado no es el rival de la velocidad: es su etiqueta.** Ver
`docs/DECISIONS.md` (6-ago).

**Ya existe media arquitectura:** el reloj corre el motor entero con
`HKWorkoutSession` viva y `workout-processing`, hay canal bidireccional abierto,
y `MirrorTramo` ya le dice al reloj qué movimiento toca. Falta `CoreMotion` en
el target del reloj (`ios/project.yml`) — hoy hay **cero** CoreMotion y **cero**
CoreML en todo el repo. Punto único de inyección del contador:
`FuerzaVivoView.swift:318`.

**Garmin queda fuera y no es culpa nuestra:** Connect IQ no da acelerómetro
crudo a terceros (valor cacheado 1-25 Hz, background capado a 30 s cada 5 min).
Garmin se reserva el acceso privilegiado. Ahí se sigue empujando el entreno y se
confirma a toque.

**Urge lo mismo que en el predictor: GRABAR.** Solo uno de los cinco datasets
públicos permite uso comercial con certeza (RecGym, CC BY 4.0) y es el menos
útil; ninguno tiene trineo ni carry. El corpus hay que generarlo, la etiqueta
débil la da el programa gratis en cada sesión completada, y **cada sesión que
pasa sin grabar no vuelve**.

**Plan de ejecución:** → **`docs/plan-reconocer-movimiento.html`** — siete fases
con archivos, migraciones (desde `0157`), criterio de aceptación medible por
fase, contrato de datos, ajustes del coach con sus defectos, y los tres errores
que hundirían esto. Hallazgo que abarata la validación: **el PM5 es verdad de
referencia gratis** — sabe cuándo se rema y cuántas paladas van, sincronizado,
así que valida las fases 1 y 2 sin grabar un vídeo.

**ALCANCE DECIDIDO (Alex, 6-ago): fases 0 a 3.** Grabar · trabajo/descanso ·
contador de repeticiones · velocidad de barra. Las cuatro son procesado de
señal: **ninguna necesita corpus**. Las fases 4-6 (clasificador, alineador,
bucle) quedan para después — Alex: «al final querré todo».

**Bloqueante antes del primer byte de la fase 0:** consentimiento y propiedad
del dato. La señal inercial de muñeca identifica a la persona por su forma de
moverse. Es la arista que quedó abierta el 4-ago y ahora tiene fecha límite.
Las fases 1-3 procesan en vivo y descartan, así que **pueden arrancar sin
esperar**; lo que espera es ARCHIVAR.

**Aviso de mercado:** Amazfit anunció el *Helio Strap Pro* en junio-2026
diciendo cubrir los 8 movimientos de HYROX. Sin cifras ni paper. Merece mirada.

---

## 6-ago · El entreno deja rastro, y hoy lo borramos al guardarlo (DISEÑO — sin construir)

Alex enseña tres capturas de TrainingPeaks (no para copiarlo) y pregunta por las
kcal y por el reporte final de un entreno: quiere todas las variables posibles,
guardadas en la base, para analíticas y predicción, y visibles después desde el
calendario.

**Diseño:** `docs/design/reporte-post-entreno-model.html` — modelo entero, roto
contra 12 casos reales (los 3 suyos + 9 del dominio).

**Lo que se encontró auditando antes de proponer nada:**
- Las **kcal existen en el esquema pero no se miden en carrera** (solo erg/PM5):
  7 tramos de 221 en producción las tienen. Su pregunta tenía razón de ser.
- El resumen post-entreno **ya se diseñó completo** en su día (zonas, deriva,
  recuperación 60s, potencia) y se recortó al construirlo. Lo dice el propio
  Swift: *«Decoupling / recovery / power require sensor streams we don't capture
  yet»* (`PostWorkoutSummaryView.swift:824`). El hueco no es de pantalla.
- El motor **mide y tira**: `closeCurrentSegmentLap()` → `resetSegmentAccumulators()`
  borra las muestras tras reducirlas a cinco números de zona.
- **`unique (execution_id, position)`** hace físicamente imposible guardar un
  circuito por rondas — el caso del brick que enseñó.
- `RoutePoint` es `(lat, lon)`: **altitud y timestamp se descartan** aunque vienen
  gratis en el mismo `CLLocation`. Sin ellos no hay desnivel ni splits.
- `tss.ts` **ya tiene implementados y testeados** los modos por FC/LTHR y por
  potencia/FTP, esperando dos columnas que no existen. Por eso el TSS de hoy sale
  solo de RPE×duración.
- **El hallazgo que abarata todo:** hay **102.910 muestras de pulso** en
  `biometric_streams` (2022→hoy) y solo 226 ligadas a un entreno. Probado contra
  la sesión 188: 632 muestras caen dentro de su ventana (una cada 4,9 s). Deriva,
  zonas reales, curva y recuperación se pueden calcular **retroactivamente**
  cruzando por tiempo, sin tocar iOS.

**El patrón, once veces:** nos lo mandan y lo tiramos. La cinta manda desnivel y
calorías por Bluetooth y el parser salta los bytes (`FTMSTreadmillParser:87,93`)
· Polar parsea calorías y distancia y no hay columna donde ponerlas · Garmin
tipa `activeKilocalories` y nunca lo lee · `HKWorkoutRoute` (GPS+altitud del
propio Watch) no se referencia en todo el repo · el descanso real entre series se
cronometra, se pinta y solo sobrevive el prescrito · el PM5 pierde splits, drag y
fuerzas **justo en series y EMOM** (los dos paths construyen el lap sin ellos) ·
`TreadmillHUDModel.measured` se calcula y no lo lee ningún fichero.

**Encuadre que dio Alex a media sesión:** la app es el CENTRO del atleta — que no
tenga que abrir Garmin ni Fitness, y que sepa que sus datos viven ahí y seguirán
ahí. Verificado el hueco más incómodo: **ya ingerimos sueño, VFC, FC en reposo y
pasos, y solo se usan por dentro para el readiness — no hay ninguna pantalla donde
el atleta los vea.** Tenemos su dato y le obligamos a mirarlo en otra app.

**Cuatro cambios propuestos:** cabecera medida en `workout_executions` (desbloquea
TSS real) · `round_index` con el unique ampliado · tabla `workout_traces` (patrón
de `workout_routes`, no fila por muestra) · altitud y reloj en `RoutePoint`.

**Riesgo mayor del diseño:** la ronda convierte la relación ejecución↔prescripción
de 1:1 a 1:N — toca todo lo que empareja tramos con el plan.

**Cuatro fallos ya existentes destapados de paso** (no son del diseño, están ahí):
1. **Garmin BORRA el detalle en vivo** — `delete from segment_executions where
   execution_id=…` y reescribe con sus vueltas planas. Sin fusión por campo. No se
   nota porque nadie ha conectado un Garmin todavía.
2. `segmentExecutionSchema` omite **12 columnas que sí existen** — quien diseñe
   contra el zod se queda ciego a la mitad de lo guardado.
3. El `avg_hr` **mezcla aparatos**: PM5, correa y HealthKit entran al mismo
   acumulador sin filtrar. La jerarquía existe solo para la etiqueta.
4. Las 80 series de fuerza con carga y RIR **no llegan a la vista del coach**.

**Pendiente de decisión de Alex.** No se ha construido nada.

---

## 6-ago · El EMOM sabía si eras máquina — y nunca lo decía en la muñeca

Bug de raíz encontrado revisando lo shipeado anoche: `GuionDelEspejo.emom()`
mandaba `modo: .ojeada` a TODA ronda de EMOM sin excepción — un burpee en el
suelo pintaba controles que el atleta no podía tocar. El dato ya existía
(`PrescriptionSet.modality` → máquina o no) pero se calculaba y se tiraba antes
de llegar al cable.

**Cerrado, de raíz, no un guard.** `EmomInterval.isErg` (ya se calculaba, ahora
se queda) → `MirrorTramo.tareaEsErgo` en el cable → `GuionDelEspejo.emom()` lee
el dato en vez de asumir · `GuionEmom.estadoSolitario`/`gestosSolitario`
construidos (no existían: el EMOM en solitario llevaba el motor real pero
ningún guion lo leía) · `EmomLiveView` sustituye a `RotatingLiveView` (que
documentaba dos huecos — enganche a marcar tarea, guion — que ya no existían;
sólo faltaba el adaptador) · de paso, el 3-2-1 de `RelojDeParedLiveView`
(intervals/tabata/death by/steady) estaba sin pintar desde que se shipeó
anoche — arreglado igual que ya lo tenía `FixedLiveView`. Esto cierra el punto
(1) de «Abierto» de la entrada de abajo.

Tests: `GuionEmomTests` (9, guion puro) + `EspejoEmomTests` (6, motor→cable→
guion Y motor→guion sin cable, ski/bici vs. burpees en las dos vías).
Verificado: build iOS + watchOS limpios, 924 tests iOS en verde (suite
completa, incluidas éstas).

---

## 5-ago (madrugada) · Una vista por lo que estás haciendo — reparto de pantallas del entreno

Se rehízo de raíz el reparto de superficies del entreno en los dos dispositivos. El
detonante: entrenar con la app y encontrarse dos pantallas para el mismo tramo de
correr, el crono que no cuadra entre ellas, y la muñeca enseñando la app de julio.

Análisis previo (antes de tocar nada): **`docs/entreno-vista-por-vista.html`** — mapa
de lo que hay, ley de diseño con fuente oficial de Apple y Garmin, y la matriz de los
dieciséis tipos de entreno reales con su sujeto por dispositivo. Decisiones
estructurales en `docs/DECISIONS.md` (tres entradas del 5-ago).

**Cerrado.** El cable del espejo lleva el TRAMO en dato y no frases (`MirrorTramo`),
así que los mismos guiones sirven las dos vías del reloj · seis guiones puros en
`ios/FAHYBRIK/Watch/Guiones/`, compilados también en iOS y testeados de cabo a rabo ·
el espejo dejó de tener pantalla propia · el bisel es la forma de la PANTALLA y no un
círculo (era idioma Garmin) · **Always-On** resuelto en el lienzo y heredado por las
seis vistas · **una vista por ejercicio en iOS**: murieron seis HUD sin diseño detrás
y el sheet de depuración salió de producción (1.109 líneas fuera) · **la auto-pausa
es del motor**, no de una vista (el crono se quedaba parado para siempre al cerrar la
pantalla en un semáforo) · las series que el coach escribe como `sets` ya generan
tramos, así que plan y entreno libre pintan la misma pantalla.

**Reglas que fijó Alex.** No rediseñar lo que el doble ya diseñó: si no gusta la UI y
hay mockup, se porta el mockup — ni se parchea la vieja ni se añade una encima. Nunca
pantalla vacía: si sobra sitio, el dato crece. El aro cuadrado se queda (las esferas
redondas son otro reloj). El listón son Apple Entrenamiento y Garmin.

**Abierto.** (1) ~~Tabata y Death By de burpees se quedaron sin ventana trabajo/descanso~~
— resuelto 5/6-ago, ver la entrada de arriba (`GuionRelojDePared` + su 3-2-1). (2) El
espejo `run-live` del doble miente: refleja la app de julio y `twin:desfase` no lo caza
porque compara fechas. (3) Las pantallas del reloj que no son el vivo (puerta de
bloque, brief, resumen, splits, mapa) siguen en el lenguaje viejo. (4) `resumen-carrera`
está diseñado y en curso de porte.

---

## 5-ago · Importar la semana desde una FOTO — CONSTRUIDO, y el muro es el catálogo

**Estado: la cadena entera está construida y en verde (2931 tests, tsc limpio, iOS 859 tests).**
Falta desplegar y aplicar las migraciones 0149/0150. Diseño y mockups: `docs/importar-por-foto.html`.

**LA MEDICIÓN CONTRA LA SEMANA REAL DE ALEX** (`web/tests/import/photo-e2e.test.ts`, corre la
cadena completa sin DB ni modelo). Antes → después de los arreglos de hoy:

| | mañana | tarde |
|---|---|---|
| Tarjetas con bloque ejecutable | 0 de 14 | 2 de 14 (solo 1 es arreglo de hoy) |
| Items leídos | 51 | 56 |
| Estados | detected/review | detected 21 · **incomplete 17** · review 18 |
| Ejercicios que resuelven | 2 | 5 |
| Ejercicios que NO resuelven | 49 (casi ninguno llegaba al resolutor) | **51 de 56 — y ahora es real** |

**El diagnóstico honesto: el parseo ya no es el cuello de botella, el CATÁLOGO sí.** Medido contra
producción: **79 ejercicios, de los cuales solo 7 de movilidad**. De los 22 ejercicios de la semana
que no resuelven, **19 (86 %) son movilidad y activación**. Y no queda ninguna traducción por hacer
— se verificó leyendo los 79 nombres reales y cruzándolos uno a uno.

**APLICADO Y DESPLEGADO (5-ago, con OK de Alex).** Las cuatro migraciones en producción y
verificadas contra la base real: `0149` defaults del coach (tabla creada, 0 filas — un coach que no
toca nada usa los del sistema) · `0150` formato superserie (el enum acepta `superset`) · `0151`
plegado de acentos (`unaccent(lower('Puente de Glúteo')) = 'puente de gluteo'` → cierto) · `0152`
catálogo de movilidad: **79→121 ejercicios, movilidad 7→28**.

Despliegue: `dpl_CGWd5eHWdYHhhDd7VcW5E2N5y7bd`, READY en producción desde el commit `1c359374`,
sirviendo fahybrid.com y app.fahybrid.com. Comprobado contra los dos dominios (raíz 307 · POST
auth/request 400 · coros/status 200 · athlete/benchmarks 401).

**INCIDENTE EL MISMO DÍA, y su arreglo (`ca5f62eb`, desplegado en `dpl_8kK2GGRxQp5R8cyWYA2UkuNP7nPi`).**
Alex probó la función y vio «No se pudo conectar». Los logs: `upload-url` 201 (la subida bien) y
`proposal` **504 tras 300 s**. Causa más consistente con la evidencia: el descargador de las
capturas (`photo-proposal.ts`) **no tenía ninguna cota de red** —ni `head()` ni el `fetch`— y bajaba
las imágenes en serie; un socket colgado ahí se come el presupuesto entero y **no llega siquiera** a
la llamada al modelo, que sí estaba acotada a 90 s. Por eso salió un 504 opaco a los 300 y no un 502
limpio a los 90.
Arreglado: cada salto de red con su aborto (10 s localizar · 20 s bajar), descargas en PARALELO,
presupuesto blando de 260 s que devuelve error legible en español antes de que Vercel mate la
función, tope AGREGADO de 30 MB (10 capturas de 15 MB eran ~200 MB hacia el modelo) e
instrumentación por etapas.
**Lo que el incidente destapó y era peor que el bug: NINGÚN error 5xx llegaba a Sentry.** Ni este ni
ninguno. Ahora los 5xx de la ruta se capturan.
**LECCIÓN, anotada porque se repitió hoy:** un `fetch` sin timeout dentro de una función con
`maxDuration` es una bomba — se come el presupuesto y mata la petición sin decir por qué. Y sin
instrumentación por etapas, la causa hay que deducirla en vez de leerla.

**SEGUNDO INCIDENTE, tras probar la UI: «cada foto = una semana, empezando por la 1» era invención
mía, no algo que Alex pidiera.** Su queja textual: *«¿quién te ha dicho que sea solo 1 semana? ¿y
si es 1 día? ¿o 3 días? ¿y si quiero subir la semana 45? ¿cómo haces un diálogo de subir sin poder
especificar?»*. Tenía razón — no había forma de decir dónde va lo que subes.

**Arreglado (`d92d49b6`, desplegado en `dpl_5sd85aEawUNxZKYsumYiotfocCKE`):** el coach ya NO declara
qué sube — el lector ya ve las cabeceras de día en la foto. Solo declara **dónde empieza**:
`target_week_id` (obligatorio, verificado contra el microciclo real del coach) + `target_weekday`
(opcional, 1..7). `start_week` desaparece de los dos lados. Un mismo control cubre un día suelto,
tres días, una semana entera o varias seguidas — incluida la semana 45, listada como cualquier otra.
La UI puso los dos desplegables ANTES de la zona de arrastre (se elige el destino, luego se sueltan
las fotos) y cazó un bug real que el encargo no mencionaba: el diálogo mapeaba SIEMPRE desde la
primera semana del microciclo, así que anclar en la 3 con varias capturas habría machacado la 1-5 en
vez de llenar la 3-7 — dos semanas ya escritas borradas en silencio. Ahora coloca por desplazamiento
desde la elegida.
La regla de colocación (`photo-placement.ts`, pura): sin día → cada uno en su día real, semanas
consecutivas desde el ancla · con día y un solo día encontrado → ancla ahí, lo escrito en la foto no
manda · con día y varios → el primero ancla, el resto conserva el MISMO hueco relativo (puede cruzar
a la semana siguiente) · desbordamiento → nunca se recorta, error con los dos números.

**Efecto del catálogo, medido con el resolutor REAL antes de aplicar:** de 48 ítems sin resolver de
la semana fotografiada, **19 pasan a resolver (48→29)**. De los 23 nombres reales: 19 resuelven, 1
queda por un corte de OCR (no por catálogo) y 3 quedan fuera a propósito porque no son movilidad.

**Tres bugs más del mismo patrón, cazados AL VERIFICAR y no al construir** (los tres resolvían en
silencio al ejercicio equivocado, sin levantar bandera): `Dominada (lastrada)` daba *Pull-up* en vez
de *Weighted pull-up* porque el paréntesis rompía la ventana de dos palabras · `Scapular Push Up`
chocaba con el alias más corto `push up` · `Single Leg Glute Bridge` con `glute bridge`. El de
`Scapular Push Up` está en producción HOY, sin relación con nada de esto.

**Seis fallos del tipo «no falla, acierta MAL con confianza»** cazados y cerrados hoy — ninguno
levantaba bandera, así que el coach no tenía forma de verlos:
`B: Deadlift 5x5` tipaba un ejercicio llamado «B» tirando el nombre real · `3-4 RONDAS` y
`12-15 repeticiones` fabricaban series de un ejercicio llamado «RONDAS» / «repeticiones» ·
`A2) 90-90` fabricaba dos series de 90 reps · `P: Realiza 4 series…` fabricaba un ejercicio «P» ·
el contador `0/10 Sets 0/5 Exercises` se comía los 5 ejercicios reales de su tarjeta · un título de
tarjeta corto («Running») se fabricaba como ejercicio. Más: el `×` Unicode tumbaba líneas enteras
por motivo tipográfico, el RIR se borraba y nunca se tipaba (toda la biblioteca perdió su
intensidad), «Bici» no tenía modalidad, y `Descanso 1:30` se evaporaba.

**El fallo de MODELO, que era el gordo:** `isNoiseLine` tiraba toda línea sin dígitos como prosa.
Una tarjeta de TrainingPeaks lista los ejercicios SOLO por nombre, así que **26 ejercicios reales
se evaporaban antes de llegar al resolutor**. Arreglado en la raíz con un tercer estado nuevo,
`incomplete` (se conoce el ejercicio, no la dosis), y una opción apagada por defecto para que
Excel y texto pegado no cambien ni un byte.

**Otros dos que habrían mordido:** editar una serie de una superserie la devolvía a series rectas
en silencio (`StrengthFields` reescribía `scheme:'sets'`), y seis fixtures de `confirm-api.test.ts`
usaban `session:` en singular contra un esquema `.strict()` que pide `sessions:` array — habrían
petado en cuanto alguien corriera esa suite con una base delante.

**La decisión de arquitectura: la visión TRANSCRIBE, la gramática TIPA.** El modelo lee la imagen
y devuelve la misma estructura intermedia que ya produce el lector de Excel; a partir de ahí entra
la gramática determinista, `resolveExercise()`, la rejilla de revisión y `confirm`. Un día
importado de una foto queda byte a byte como uno escrito a mano. Si la visión escupiera el JSON
final habría dos caminos de notación a prescripción tipada y divergirían.

**Lo que la exploración dejó claro (3 agentes, todo con fichero:línea):**
- La infraestructura de visión YA existe (`callLlmJsonWithImage`, `LLM_VISION_MODEL`) y ya envuelve
  cada campo en `{valor, confianza}` — se usa para fotos de comida y capturas de Garmin/PM5/Strava,
  pero nunca se conectó al importador del coach.
- `slots_json` es la superficie de AUTORÍA; `templates`+`template_segments` la de MATERIALIZACIÓN.
  Se cruzan UNA vez, al asignar. El importador escribe solo en la primera. **Un entreno inventado
  NO necesita existir en la biblioteca de bloques; sí necesita `exercise_id` real.**
- `completeness.ts` ya distingue dos listones: lo que AUTORA un modelo exige dosis+intensidad+
  descanso; lo que se TRANSCRIBE de un coach solo dosis. Medido contra las 12 semanas de Pablo:
  el estricto rechaza el 57 %, el ejecutable 0 de 137. Importar una foto es transcribir.
- **Un item mal tipado no da error: desaparece.** `WorkoutBlock.items` es `@LossyArray`, así que un
  item sin `scheme` (o sin los 5 campos de ejercicio) se borra en silencio de la sesión del atleta.

**Hecho hoy** (commit `13de22a2`): cinco bugs de la gramática compartida, verificados EJECUTANDO
`parseNotationCell`. Tres de ellos no fallaban — acertaban MAL con `detected`, sin bandera:
`"B: Deadlift 5x5"` tipaba un ejercicio llamado «B» tirando el nombre real; `"3-4 RONDAS"` y
`"12-15 repeticiones"` tipaban series de un ejercicio llamado «RONDAS» / «repeticiones». Más el
signo `×` tumbando líneas por motivo tipográfico, el RIR que solo se borraba y nunca se tipaba
(cada `4x4 | RIR 2` de la biblioteca perdió su intensidad), y «Bici» sin modalidad. 174 tests en
verde, 0 regresiones, 9 tests nuevos de regresión.

**Lo siguiente:** el lector de visión + `build-proposal.ts` multi-bloque por día (hoy colapsa el
día entero en UN bloque, herencia de «una celda = un día» del Excel; la captura real trae días con
tres entrenos), los defaults rellenables como dato editable del coach (patrón `coach_guidance`,
no `coach_methodology` que está muerto), y la UI del cuarto modo.

**Pendiente de decisión de Alex:**
1. El UX del documento (cuarta pestaña + marcado leído/propuesto en la revisión).
2. Dos cosas que tocan `Prescription` y por tanto los `Codable` de Swift: **rango de reps**
   («4 series de 12-15» hoy se aplana a dos series, que es otra cosa) y **superserie**
   (`A1/A2/A3` frente a `A/B/C`, que cambia cómo se ejecuta en vivo). Ambas objetivamente
   necesarias; ninguna construida todavía.

---

## 4-ago · Predicción HYROX v2 — propuesta, y dos supuestos rotos contra el dato real

`docs/prediccion-hyrox-v2.html`. Rediseño del predictor, con la ciencia primaria que existe
(solo hay dos papers utilizables: Brandt 2025 con N=11 y Rappelt 2026 con 39.696 resultados),
el inventario real de lo que medimos, y los mecanismos de recalibración de CORNR.

**El diagnóstico del v1:** hace bien lo difícil (diez tramos, procedencia declarada, nada se
rellena con el objetivo) y le faltan cinco cosas: **no aprende** (la evidencia decae, el entreno
no aporta), la banda es de ancho relativo fijo cuando el fenómeno es heterocedástico, la fatiga
de la prueba es un escalar que solo existe si ya tienes carrera, sin carrera ni marcas no hay
número (**5 de 8 atletas sin carrera, 6 de 8 sin marca medida**), y nunca se ha publicado un
error medido pese a que los snapshots llevan meses guardándose.

**Lo que rompió el stress-test contra las 8 carreras-equipo reales:**

1. **La curva de fatiga de singles no vale para dobles** — error de 22 a 85 s por vuelta, y una
   de las ocho corre MÁS RÁPIDO al final en las siete vueltas. La durabilidad es del atleta *y
   del formato*.
2. **El reparto tampoco** — Rappelt da carrera 48,5 % / roxzone 7,3 % en singles; nuestras dobles
   dan 49,6-60,6 % y 6,8-11,1 %. Y `dobles-gap` presupuesta cayendo a «la carrera de singles del
   más rápido», una forma que en dobles no existe.
3. **Lo que sí sobrevivió:** el ranking de señal. Ski 0,92 · remo 0,92 · carrera 0,45 en nuestros
   datos, mismo orden que Rappelt con 39.696 resultados. **El ergo predice más que la carrera** — y
   lo mide el PM5 gratis.

**Propuesta (revisada el 5-ago con Alex):** el cambio de fondo es que **no se predice el tiempo, se
predice al ATLETA y se simula la carrera con él**. Cinco parámetros (velocidad crítica y depósito de
carrera · potencia crítica y depósito de ergo, en vatios reales del PM5 · durabilidad · coste
observado de las estaciones), y el tiempo sale de simular los diez tramos mil veces. Eso resuelve la
tensión de fondo: predecir el tiempo directo obliga a elegir entre un número que baila y uno que no
se mueve; predecir parámetros no, porque cada observación entra con el peso de su precisión (un
rodaje no informa de la velocidad crítica, un test sí).

Dos consecuencias que valen el cambio: **la probabilidad** («68 % de bajar de 1:30, hace seis semanas
31 %») en vez de un rango, por carrera fijada — y adiós al supuesto de independencia entre tramos,
porque en la simulación la correlación sale sola. Y **separar velocidad crítica de depósito exige dos
esfuerzos de duración distinta**, no un 5K: con un punto no distingues motor grande de depósito
grande, y en una prueba con ocho estaciones que te vacían eso decide el tiempo.

**El compromised running no necesita test nuevo: ya se entrena.** Un EMOM de remo+carrera es un
experimento controlado — mismo atleta, ritmo medido, trabajo previo conocido.

Tres leyes nuevas: el modelo **publica su propio error** antes de pedir confianza, no debuta en
público sin una validación con ese atleta, y su calibración caduca.

**El bucle de aprendizaje (§04b), que es el marco de Alex:** son DOS bucles, no uno. El rápido
(~300 observaciones/mes por atleta) mueve los parámetros de ese atleta y es lo que el usuario ve. El
lento (2-4 carreras/año) es la única etiqueta verdadera y corrige el modelo. Por eso el modelo lleva
física dentro: **la estructura sustituye a los datos que no hay** — con simulación, el bucle lento
solo tiene que ajustar unos coeficientes, no aprender la función entera, y eso son cientos de
carreras en vez de años. **URGENTE y no recuperable: congelar el vector de ENTRADAS con cada
predicción** (hoy `race_predictions` guarda el resultado, no lo que sabíamos). Sin eso hay fuga
temporal y el dataset no vale. Cada carrera que se corra sin ello es dato perdido.

**El activo:** no es el volumen (con 100 atletas no competimos en escala), es la tripleta que no
tiene nadie — *lo prescrito · la adaptación medida · el resultado*, unida por atleta y en el tiempo.
Garmin no sabe qué carrera corriste; el coach no tiene telemetría; HYROX solo tiene el cronómetro.
**Pendiente de Alex:** propiedad y consentimiento del dato desde el día cero, con su arista
multi-coach (de quién es el agregado cuando el atleta es de otro coach) — barato ahora con cero
usuarios, carísimo después.

**Calibrable HOY sin construir nada:** la curva de durabilidad (los laps de correr ya se graban
dentro de cualquier formato desde el arreglo de esta mañana) y el ergo (PM5). Las estaciones piden
que la simulación escriba observaciones. **8 de las 9 piezas del plan NO dependen de datos de
población.**

**DECIDIDO por Alex (4-ago): SÍ al prior poblacional**, con tres condiciones que van con la
decisión — solo estadística agregada por casilla (nunca resultados de terceros identificables ni
exhibidos), ponderada por temporada (el nivel se mueve un 19 % en siete) y **por división Y
formato** (consecuencia directa de lo que rompió el stress-test). Desbloquea las cinco estaciones
de fuerza, el arranque en frío y la proyección sin objetivo. No bloquea nada: se empieza por las
ocho piezas que no lo necesitan.

**Siguiente, por orden de señal / coste:** enchufar el panel del coach (`loadHyroxPrediction()`
devuelve `null` siempre — motor que funciona, coach que ve un vacío) · curva de durabilidad por
atleta y formato · reordenar `next_inputs` al ergo.

### ABIERTO · Al predictor le falta el filtro de procedencia que las carreras SÍ tienen

Mismo fallo que las carreras sembradas (arreglado con `races.is_synthetic`, mig 0142), vivo en
la otra mitad: la consulta del lado entrenado (`web/lib/athlete/race-transfer.ts:186-204`) filtra
por trabajo-vs-recuperación y por modalidad, pero **no por `se.source`**. Hoy `segment_executions`
tiene 158 tramos `source='demo'` (151 de correr, con ritmo) y entran enteros en la población de
«ejecuciones» del atleta al que cuelguen.

**No hay nadie sufriéndolo: no tenemos ningún atleta.** Los ocho de la base somos nosotros
probando, y los tres que cargan el seed (66/67/69) son cuentas inventadas. Lo que importa es que
el agujero está en el motor, no en las filas: el día que un atleta de verdad tenga una fila
sembrada al lado de una real, el modelo no sabrá distinguirlas. Y bloquea calibrar (ley 5: el
error se mediría contra seed).

Arreglo: la misma forma que en `races` — marcar la procedencia y excluirla en la consulta, nunca
borrar filas.

### ABIERTO · Cero tramos fatigados en toda la base

La curva de durabilidad de §04 se calibra con tramos de correr **precedidos de trabajo**, y hoy
hay **cero** en producción: de 158 tramos de correr, 145 no llevan `prior_work_s` (son seed o
ingesta externa del reloj) y los 13 con contexto son todos frescos. El escritor está bien
(`ingest-execution-segments.ts:216`, honesto-o-nada); lo que falta es uso: sesiones reales en
formatos que mezclen ergo y carrera, que es justo lo que se empezó a hacer esta semana. No se
arregla con código.

---

## 4-ago · Lo que Alex encontró entrenando — tres cerrados, tres abiertos

Sesión de gym real (fuerza, dos ejercicios, con el reloj puesto). Seis hallazgos.

**CERRADOS Y COMMITEADOS:**

1. **El avance cerraba el ejercicio, no la serie** (`d9b67424`). Los DOS bugs de
   fuerza eran uno: la regla «con series pendientes no se cierra el ejercicio» vivía
   dentro de `FuerzaVivoView`, y el botón «Siguiente» del reloj entra por
   `primaryAdvance()` sin pasar por ninguna pantalla. Un toque en la muñeca durante
   la serie 1 cerraba el ejercicio entero y saltaba al siguiente — y el descanso que
   sonaba después ya era el del OTRO ejercicio (su valor por defecto, 1:30), con el
   atleta todavía en el primero. La regla sube al motor (`strengthPrimary`), así que
   cualquier mando queda protegido igual. De paso, `isFinalStep` del espejo dejaba a
   la muñeca rotulando TERMINAR desde la primera serie.

2. **La previa se comía las series** (`c8e5c156`). `summaryLine` solo ponía el «N ×»
   cuando el esquema era `.intervals`; un 4×10 llegaba como «10 · Corporal ·
   descanso 15s». Ahora la regla mira la prescripción, no el esquema, y distingue
   REPETICIONES de la ROTACIÓN de un bloque plegado. Y había DOS formateadores de
   cabecera de formato (uno en el renderer, otro escondido en la vista activa), por
   lo que un circuito llegaba a la previa sin cabecera: ahora hay uno.

3. **El «tiempo de vuelta»** (`f4c7f0e9`). Contaba desde que se abrió el tramo, así
   que en un 4×10 sumaba las cuatro series y sus tres descansos. En el hierro pasa a
   ser **Pausa** (desde que cerraste la última serie), que es lo que se pregunta
   alguien con una barra en las manos y lo que la app no contestaba. En correr,
   «Vuelta» pasa a ser el reloj del TRAMO, no el del segmento.

**ABIERTOS:**

4. **BISERIE — el hueco de fondo.** Alex quería intercalar dos ejercicios y no se
   puede decir. Modelo aprobado: un entreno de fuerza es una lista de **grupos**, y
   un grupo es `N rondas × [estación₁…estaciónₖ]` + descanso entre estaciones +
   descanso entre rondas. Con k=1 son las series seguidas de siempre (cero cambio);
   k≥2 es la biserie, y la triserie y el circuito de fuerza salen gratis. UI
   elegida: **grupo explícito** («+ Añadir grupo» → Serie sola | Biserie/Triserie).
   Implementación: **un grupo es un BLOQUE** (cada uno con su `blockPosition`), las
   estaciones siguen siendo un tramo cada una — 1:1 con `items[]`, así que el
   guardado no cambia —, y el motor recorre el grupo por rondas y cierra K laps al
   final, uno por estación.

5. **EMOM sin ronda de descanso.** Hoy `usesRest` excluye `.emom` por diseño: solo
   existe el «Cambio» (la transición DENTRO del ciclo, 45/15). Falta el minuto de
   descanso como estación de la rotación — remo / ski / cinta / **descanso**, que es
   programación estándar. El motor ya tiene fase de descanso (`rollEMOMPhase`) pero
   escalar, igual en todas las rondas; hace falta que la rotación admita estaciones
   de descanso. Ojo: `PrescriptionSet` en el servidor es `.strict()`, así que marcar
   una estación como descanso toca el contrato compartido.

6. **Pantalla bloqueada.** Live Activity existe y funciona, pero SOLO para la
   carrera al aire libre (`RunLiveActivityWidget`, #64). Las otras ~9 vistas en vivo
   no tienen ninguna. Ya hay un modelo de estado agnóstico al formato que se
   construye cada tick para CUALQUIER entreno — `MirrorStateFrame`, el que alimenta
   al reloj —, así que la Live Activity debe comer de ahí y no de una segunda copia.

---

## 4-ago · Inventario del reloj — qué está portado y qué no

Antes de seguir portando mockups del doble a watchOS hacía falta saber qué falta de
verdad. Doce pantallas de reloj en el doble, capturadas escenario a escenario y
contrastadas con el Swift: **docs/reloj-inventario.html**.

- **Diez ya están en Swift** (commit `12b20e34`, 3-ago): rodaje, series, fuerza, EMOM,
  AMRAP, For Time, dobles, descanso y resumen. El port no está por empezar, está por
  terminar.
- **Faltan cinta y ergo** — las dos donde el reloj NO mide la máquina. El ergo no se
  puede portar aún: `MirrorStateFrame` no lleva ni metros, ni /500, ni SPM, ni vatios
  (los de cinta sí están).
- **El agujero real es el modo espejo.** `MirrorHUDView` (554 L) sigue en el lenguaje
  viejo — botón de 52 pt, tejas, barra de cápsula — y es lo que corre cuando el entreno
  lo gobierna el móvil, que es casi siempre. Cinta y ergo viven ahí dentro. Dobles está
  implementado dos veces con dos lenguajes distintos (`RelayLiveView` nuevo en
  solitario, `doblesContent` viejo en espejo).
- **`watch-live` dejó de ser espejo:** enseña la app anterior al port (lo confirma
  `pnpm run twin:desfase`). Y `watch-vivo` es el ancestro de las nueve vistas de
  formato: sobra en el índice.

---

## 4-ago (noche) · El reloj entero pinta los guiones — estado

Hecho y commiteado (120657e1 → 6ac3df46): el cable lleva EL TRAMO (`MirrorTramo`),
el espejo pinta los MISMOS guiones que el modo solitario, seis guiones (rodaje,
series, fuerza, EMOM, ruta, ergo), escaparate `-guion <id>` para capturar sin
entrenar, bisel = forma de la PANTALLA (no un círculo — era idioma Garmin), aro
segmentado de series restaurado del doble, guiones compartidos a iOS y testeados
de cabo a rabo (motor→trama→encode→decode→guion→páginas). 840 tests, 0 fallos
inesperados. Capturas: **docs/reloj-en-vivo.html**.

Reglas que Alex fijó esta noche: NO rediseñar lo que el doble ya diseñó (pasó con
el aro y con un «Frena/Aprieta» inventado — revertidos); versales legibles (nota
9→10 pt); el aro cuadrado se queda (esferas redondas = otro reloj, más adelante).

Pendiente: (1) fallo ESPERADO documentado en `EspejoDeCaboARaboTests` — las
series del coach escritas como `sets` sin `structure` no generan ventanas de
tramo; arreglo = motor, sets→legs, camino de TreadmillLegResolver. (2) Los dos
casos que NO están en el doble (rodaje con zona prescrita + fartlek por tiempo)
deben entrar al doble como propuesta para que Alex los valide. (3) Validador UX
(agente) revisando las 17 capturas contra el doble — aplicar sus hallazgos.
(4) Probar con reloj emparejado el flujo real (crear 5×500 → arrancar en móvil).

---

## 4-ago · La especificidad por formato es un GUION, no una vista

El diagnóstico, verificado en el código: el port de agosto se llevó el **lienzo**
(`Lienzo/WatchLienzo.swift`, `WatchBisel.swift` = el port de `kit-watch/`) pero **no
los guiones**. El doble tiene nueve `guion.ts` (~930 líneas de código real, ~64 casos
atados a ejecuciones reales) que son exactamente la decisión de *qué es el sujeto en
cada momento*; en Swift no existía ninguno, así que las vistas re-dedujeron el
contenido de lo que el motor tenía a mano y todos los formatos acabaron pareciéndose.
Encima el router reparte por **familia de presentación**, no por formato
(`LiveFlowView.swift:88`): For Time, Chipper, Ladder y Rounds comparten página.

### Los cuatro hechos que ordenan el trabajo

1. **El reloj corre en espejo el 90 % de las sesiones** (`MirrorSessionController.swift:5`)
   y **el cable no lleva el formato**: `MirrorStateFrame` no tiene un campo que diga si
   esto es un EMOM o una serie de fuerza — sólo tres strings ya redactados por el móvil.
   En espejo el reloj ni siquiera sabe si el minuto que corre es trabajo o el cambio.
2. **El reloj YA es una app completa en solitario**: compila el mismo motor
   (`ios/project.yml:325-336`) y recibe el `detailJson` entero. Sin móvil sabe el
   formato, el plan y la dosis de cada ronda. No hace falta app separada.
3. **La línea la marca quién mide**: correr fuera → el reloj mide todo, solitario es
   mejor; fuerza y WOD → no lo mide nadie, el reloj basta; ergo y cinta → **cero
   CoreBluetooth en el target del reloj**, el móvil es obligatorio.
4. **Cuatro formatos no existen en la biblioteca real**: Tabata, Death By, Chipper y
   Ladder tienen **cero casos**; AMRAP tiene uno. Se salen del alcance.

### Lo que Pablo programa de verdad (bloques, formato canónico)

`steady 212 · sets 194 · rounds 90 · intervals 89 · for_time 25 · hyrox_sim 24 · emom 16`

### El techo que NO es de código, es del dato

- El **time cap no existe**: 0 de 39 segmentos For Time llevan `total_s`; «TC 30'» vive
  en el título del bloque. **Alex: «tc debería existir»** → hay que rellenarlo en la
  biblioteca (el campo ya está en el modelo: `total_s` y `target.time_cap`).
- 54 de 216 bloques (25 %) no tienen dosis tipada, sólo el texto verbatim.
- Los EMOM multi-estación del coach están **vacíos**; los únicos EMOM estructurados los
  creó un atleta desde la app (`meta_json.origin = "self"`).
- Los fartlek pierden estructura al tipar (el bloque 451 se come la recuperación y la
  inclinación del 1 %).

### Decisiones tomadas

- **v1 = rodaje + series + fuerza.** 80 % del volumen y los tres mejor tipados: se
  pueden hacer específicos sin tocar la biblioteca. For Time, HYROX y EMOM van después
  y arrastran arreglar el dato del coach.
- **No se separa la app.** Lo que cambia es que el atleta elija **«con móvil / sin
  móvil» al empezar** en vez de que lo decida el botón que pulsó
  (`RootView.swift:56-58`: hoy el espejo gana siempre). Correr sin móvil pasa a ser un
  camino de primera.
- **El cable sólo hace falta para ergo y cinta.** Correr sin móvil ya cae en solitario,
  donde el reloj tiene el plan entero: se arregla con el guion, sin ampliar
  `MirrorStateFrame`.

### Hecho (`c0d8b6ef`)

`Guiones/GuionRodaje.swift` y `Guiones/GuionSeries.swift` — funciones puras
estado → páginas; `ContinuousLiveView` y `StructuredRunLiveView` quedan de
renderizador fino. Build FAHYBRIKWatch SUCCEEDED.

- Rodaje: orden de páginas por degradación (con zona viva el pulso gobierna; sin ancla
  manda el ritmo). **Añade el caso dominante que el doble no cubría**: con zona
  prescrita el segundo nivel juzga (en zona / te pasas / vas corto); sin ancla no se
  juzga y la zona prescrita se dice en el contexto.
- Series: tres formas de cierre y el sujeto sale de quién cierra — hito → metros que
  faltan; reloj → cuenta atrás (**el fartlek, que el doble no modelaba**); atleta →
  metros que llevas. El toque «serie hecha» desaparece cuando cierra un hito.

### Siguiente

1. **Tests de los guiones** — los ~64 casos del doble. Bloqueado por dónde vive el
   lienzo: `WatchPagina` está sólo en el target del reloj y el de tests es iOS. Hay que
   partir `WatchLienzo` en modelo (compartido) y vista (reloj).
2. Guion de **fuerza**.
3. La elección **con móvil / sin móvil** al empezar (la parte del reloj primero; la del
   arranque del teléfono toca `PreWorkoutBriefView`).
4. Actualizar los espejos del doble con lo que ha cambiado en Swift.

---

## 4-ago · La cinta graba en CUALQUIER entreno, no solo en un bloque de correr

**El fallo (dos capas, las dos por estrechar de más):**

1. La telemetría de la cinta solo llegaba a la sesión a través de `TreadmillHUDModel`
   — un *view model*, vivo solo mientras la pantalla de cinta está abierta. Un tramo de
   correr dentro de otro formato (EMOM, For Time, HYROX sim, circuito) nunca abre esa
   pantalla: la cinta emitía y la sesión no grababa nada.
2. Aunque llegara, los guardias eran `currentSegment.kind == .running`, y un bloque
   plegado es `.reps`/funcional. Mismo bug que ya se arregló para el remo («gated on the
   TRAMO, not on the segment») pero que nunca se replicó a la cinta ni al GPS.

**El modelo ahora:** la grabación es de ámbito de SESIÓN, no de pantalla.

- `TreadmillDistanceTracker` (puro): odómetro→incrementos, con el fallback de integrar
  velocidad cuando el odómetro se congela. Una sola implementación.
- `TreadmillSessionFeeder`: EL dueño del feed cinta→sesión, vivo todo el entreno,
  cableado en `wireLiveSources` igual que la banda de pulso. El HUD ya no alimenta la
  sesión (era doble conteo); conserva su propio anillo por tramo con su propio tracker
  reseteado por tramo — un tramo de trabajo no hereda los metros del trote de recuperación.
- **El orden es contrato:** `DeviceHub` llama a `onRecordSample` ANTES que a `onSample`.
  El auto-avance del HUD cierra el lap con el mismo sample que completa el tramo, así que
  grabar después metía esos metros en el lap SIGUIENTE. Bug real de producción que
  cazaron los tests.
- Guardias → `tramoIsRun` en cinta, inclinación y GPS; al cerrar el lap ya no se filtra
  por `kind == .running` (lo medido es medido, lo envuelva el formato que lo envuelva).
- Ventana de cinta por tramo (`tramoBeltDistanceMeters`), gemela de la del erg: sin ella
  el minuto 4 de un EMOM reclamaba los metros de todos los minutos de carrera anteriores.

822 tests verdes. Builds iOS + watchOS OK. **Probar en gym:** cinta en un EMOM/For Time
mixto → metros y ritmo del tramo de correr, y en el resumen por estación.

---

## 4-ago · Haptics del reloj mudos en EMOM multi-máquina — CAUSA RAÍZ

Tres arreglos previos (6be705b8, 537ef7e6, 206c0104) reforzaron el TRANSPORTE, que ya
estaba bien. El fallo estaba en el emisor: en `advanceEMOMInterval`, el cambio de
movimiento disparaba `Haptics.heavy()` — vocabulario de UI, que NO llama a
`relayWorkoutCue` y por tanto nunca sale del móvil. En un EMOM remo→ski→cinta el
movimiento cambia CADA minuto, así que ningún cue llegaba a la muñeca; un EMOM de un
solo movimiento (que reenvía `cueGo`) sí funcionaba, y eso lo tapaba.

**Arreglado:** el cambio de movimiento es ahora un cue propio de primera clase
(`Haptics.cueChange()` → `MirrorWire.HapticCue.change` → `Haptics.cueChange()` en el
reloj), no un `cueGo` genérico: en multi-máquina «cambia de máquina» es EL aviso que
se acciona. Reloj viejo que no conozca el nombre cae al `default` (start firme), nunca
a silencio. Builds iOS + watchOS SUCCEEDED.

**Nota de diseño:** solo las cuatro (ahora cinco) funciones `cue*` cruzan al reloj.
`light/medium/heavy/success` son feedback de UI y se quedan en el móvil — si un aviso
tiene que sentirse en la muñeca, va en el vocabulario de cues.

---

## 4-ago · Resumen EMOM de verdad (por estación + totales)

EMOM multi-estación graba **un lap por minuto** (remo/ski/run…) con ritmo/cal/W.
Resumen post-entreno: card **Tu sesión** (totales + por máquina) + tabla por estación.
Se persiste en execution segments. Probar: libre EMOM remo+ski+PM5 → guardar → ver filas.

---

## 4-ago · Multi-máquina en funcional (PM5 ×2 + FTMS)

Gym Alex: EMOM/AMRAP/For Time con remo + ski + cinta no ofrecía conectar.
**Shipeado en iOS** (rama `feat/pm5-counter-sync`):

- Slots por rol: Remo · SkiErg · BikeErg · Cinta · Banda (derivados de sets/modality).
- `PM5Pool`: un store/service por rol; tramo vivo enruta al monitor de su modalidad.
- Contadores: EMOM per-tramo (reset al saltar ski↔remo); AMRAP acumulativo (ya en `ErgCounterPolicy`).
- Free functional: sets con modality del ejercicio; card de dispositivos en el builder.
- 32 tests verdes (eligibility + pool + counter policy). Build sim OK.

**Probar en gym:** libre funcional EMOM con remo+ski+run → conectar 2 PM5 + cinta → verificar contador a 0 en cada ronda ergo y lectura de cinta en el run.

Pendiente natural de la lista 4-ago: fuerza (series/descanso), rest en EMOM, lock screen, rondas en previa.

---

## 3-ago · Apple Watch en vivo — port del diseño del doble a WatchOS

El live feo (`watch-live` / botón 52 pt + tejas) deja de ser la UI del reloj.
**Shipeado en Swift** el lenguaje del doble (`kit-watch` → `FAHYBRIKWatch/Lienzo/`):

- **Kit:** `WatchReloj` (páginas, modos ciego/ojeada/mando, tinte de zona, destello),
  `WatchAroContinuo` / `WatchAroSegmentado` (progreso en el bisel, cero altura de contenido).
- **Familias:** series de calle · rodaje · EMOM/rotating · AMRAP/For Time/HYROX ·
  fuerza · descanso · relevo dobles · resumen post-entreno · genérico.
- **Reglas:** un sujeto por página · pantalla = botón · sin zona no hay tinte ·
  pulso en página propia · franja solo en mando (ojeada = gesto latente).

Build: `FAHYBRIKWatch` **SUCCEEDED** (sim Series 11 46mm). Twin: pantallas
watch-* marcadas `construida` (no `espejo` aún — MirrorHUD y checklist siguen
el layout viejo; cinta/ergo no tienen vista reloj propia).

Pendiente natural: espejar MirrorHUD · checklist al lienzo · vistas cinta/ergo
si el reloj llega a recibir contadores de máquina · QA en muñeca real.

---

## 3-ago · El doble había caducado — re-sellado entero + índice por recencia

Alex dejó de fiarse del índice del doble («no encuentro el mockup de ayer», «hay cosas desactualizadas que parecen la realidad») y la auditoría le dio la razón: **5/5 espejos desfasados** (congelados antes de la campaña iOS «un guion no es un dato») y **24/33 propuestas ya construidas en Swift** sin re-sellar. Hecho: fecha `actualizado` obligatoria en cada pantalla (estampada desde git), índice con «Lo último» primero + tanda colapsada en colección, estado nuevo **`construida`** (12 pantallas), campo **`enApp`** en parciales (14), «Tests guiados» fuera de pendientes (su doble es `tests-calibracion`), afirmación falsa de `ranking-box` corregida, y detector permanente **`pnpm run twin:desfase`** (fecha git de fuentes vs sello). Detalle en `docs/DECISIONS.md` (2026-08-03 «El doble mentía»). Los 5 espejos quedaron **re-fidelizados contra el Swift de hoy** (campaña «un guion no es un dato»: átomos con contrato `ausente`, motivos con palabras, estados que se omiten en vez de pintar rayas; devices ganó el escenario de conexión perdida que le faltaba desde su nacimiento) — `twin:desfase` en verde y typecheck limpio.

---

## 3-ago · Garmin CIQ — listo para sideload (falta reloj USB)

Clave local generada (`garmin-ciq/developer_key.der`, gitignored). Compila con
`./garmin-ciq/build.sh` (JAVA_HOME openjdk + monkeyc SDK 9.2.0) →
`bin/fahybrid-fr965.prg`. **No se puede sideload sin volumen `/Volumes/GARMIN`.**
Siguiente: conectar reloj por USB → `cp bin/fahybrid-fr965.prg /Volumes/GARMIN/GARMIN/APPS/`
→ login email/código → día con carrera hasta reproductor nativo. Código de la app
no bloquea; `exitTo` solo se valida en hardware.

---

## 3-ago · Sincronía de contadores PM5 — implementado (rama `feat/pm5-counter-sync`)

OK de Alex: app-dueña · AMRAP cumulative · ergo antes que carrera.

**Hecho (32 tests verdes):** `ErgCounterPolicy` · programmer por tramo (bout fixed, no intervalos nativos) · auto-cierre series m/cal · re-ancla count-in→GO · UI cal 0 por defecto · strip con ventana de tramo · DECISIONS. Plan: `docs/plan-sincronia-contadores-dispositivo.md`.

**Pendiente:** record per-bout de series ergo en el payload · QA gym con PM5 real · paridad carrera (cinta/GPS, PR9 del plan).

---

## 2-ago · Los tests, que estaban peor de lo que parecía

Alex pidió que el coach pueda montar **un test de ergo de 2 × 2 min que calibre zonas**. No se puede, y al abrirlo salieron **tres sistemas de test paralelos** que no se hablan (`test-types.ts` · `coach_calibration_tests` · `methodology_tests`) y cinco huecos: el coach **no puede definir qué se hace** (el protocolo es texto libre y el contenido se materializa sin prescripción, así que iOS no lo puede guiar); el catálogo de calibración **clava** «zonas de remo» = *tiempo de un 2K*; una medida de **distancia no calibra jamás**, que es justo el caso de un test por tiempo fijo; no existe **agregación** de tramos («la media de los dos»); y el **umbral de pulso se teclea a mano** teniendo nosotros el stream de FC entero. Todo el diagnóstico, con ficheros, en `docs/DECISIONS.md` (2026-08-02).

**Construido:** la superficie del atleta — `app.fahybrid.com/es/design/test-comparativa` (pantalla `propuesta` del doble), rediseñada el mismo día con dirección de Alex: **las zonas son el sujeto** («muy importantes en HYROX, en running y en ergs»). La marca antes → ahora con delta y %, la referencia elegible (anterior · hace 3 meses · tu mejor · 1ª vez), y **la escalera de las seis zonas: la banda de cada una entonces y ahora** — los cortes son del coach (dato editable, seed por defecto), el test mueve el umbral y todas van con él. Seis escenarios; tres son el encargo: **«2 × 2′»** (el test que hoy no se puede montar), **«Carrera 5K»** (la misma escalera en /km) y **«mismo tiempo, 9 ppm menos»** (la mejora que hoy se pinta como «nada»).

**Espera decisión de Alex:** rehacer el modelo de test (protocolo estructurado × medida por tramo × agregación × qué ancla produce, con el ajuste como dato del coach) toca migración + editor del coach + el puente + iOS. No se ha tocado nada de eso.

---

## En qué estamos ahora

**Que el software sea de verdad multi-coach.** Alex, el 29-jul: *«al final esto derivará a FLEXR, este código, y lo venderemos a otros coaches. Pablo es nuestro coach, no es "el coach". Habrán con suerte miles de coaches.»* Es la **HARD RULE Nº0** de `CLAUDE.md`, y la línea es: **MECANISMO en código** (cómo se calcula un TSS, cómo se detectan los tramos, cómo se resuelve un ancla) · **MÉTODO en dato editable** (dónde cortan las zonas, los pesos del readiness, los umbrales de veredicto). La pregunta que decide cada caso: *¿otro entrenador competente lo haría distinto?*

**ATR está fuera, del todo** (migración 0148 aplicada en producción, con el código desplegado antes). Sobrevivió a las limpiezas de 0064/0068 porque **la columna viva no se llamaba `atr_` sino `target_block`**: una metodología se barre por semántica, nunca por su sigla. De paso caían «Listo para TRANS» en la cola de HOY, las anotaciones del gráfico de VO₂máx, un HTML público y **el propio `CLAUDE.md`**, que enseñaba ATR a todo agente que arrancara.

**El nombre del coach ya sale de la base** en las push, los correos de cita y de lead y los `.ics`. Y **un lead se graba con su dueño en la captura** (0147): NULL significa «sin asignar», nunca «el coach por defecto».

**En curso / lo siguiente:** las cuatro vistas en vivo que faltan en Swift (ergo, For Time, AMRAP, dobles) y el reloj · llevar a Swift las pantallas aprobadas del doble · cablear `coach_methodology`, que tiene 37 columnas, 0 filas y 1 sola lectura.

**Esperan decisión de Alex:** si guardamos la serie de ritmo (`execution_streams`) · el identificador de coach en el enlace público de captura · las tres filas «Pablo Amigo» (60/61/62) con los atletas repartidos · el modelo de las 5 estaciones de HYROX · borrar o revivir `methodology_blocks`/`methodology_rules` (motor muerto cuya forma sigue siendo un catálogo de fases) · la firma de distribución, que bloquea TestFlight.

---

## Cerrado el 6-ago · La jerarquía de fuentes de FC gobierna el número, no solo la etiqueta

`WorkoutSession.injectLiveHR` ya tenía la jerarquía correcta entre pulso simultáneo
(correa=3 > Watch/HealthKit=2 > PM5=1, ventana de 10 s) pero solo mandaba en la
ETIQUETA de la tira de conexión: con dos fuentes activas (reloj+correa, o
reloj+PM5 remando — normal, no un edge case), `avg_hr`/`liveHRBpm` se alimentaban
de CUALQUIER lectura, así que `avg_hr` era la media de la unión de dos streams y
un artefacto del PM5 podía colarse como `max_hr` del tramo aunque la correa nunca
llegara ahí. Ahora la decisión de ownership se toma ANTES de tocar ningún
acumulador — solo la fuente dueña alimenta el número y los cuatro agregados.
Aditivo: `segment_executions.hr_source` (migración **0153, aplicada a producción**)
dice de qué aparato salió el pulso, distinto de `source` (el tramo).
11 tests nuevos/corregidos en `HRProvenanceTests` — dos de ellos **afirmaban el
bug** («una lectura de menor prioridad sigue actualizando el valor en vivo»), así
que el comportamiento erróneo estaba certificado por la suite. Detalle en
`docs/DECISIONS.md` (2026-08-06).

**El orden importó:** la 0153 fue a producción ANTES de integrar el código,
porque el INSERT de `ingest-execution-segments.ts` referencia `hr_source` sin
condicional — al revés habría roto TODO el ingest de segmentos, no solo el pulso.
Verificado con ensayo en transacción revertida contra el esquema real: columna
nullable creada, 221 filas intactas, CHECK rechazando valores fuera del
vocabulario.

---

## Cerrado el 30-jul · El lenguaje del entreno, en la app

`docs/CONTRATO-UI.md` §10 fija el idioma de las vistas en vivo — **la zona tiñe el lienzo, un solo numeral, el sujeto ancla su centro, la acción no compite, y el trabajo no va en gris** — y ya no vive solo en el doble: **correr, fuerza y EMOM lo hablan en Swift**, con 730 líneas del HUD viejo muertas.

Al reescribirlas salieron bugs de la app real: el pulso ausente pintaba «—»; «tiempo del tramo» enseñaba lo que QUEDA mientras la distancia enseñaba lo CUBIERTO, en la misma caja; y en fuerza **el botón grande cerraba el ejercicio** mientras «serie hecha» era un botón de 12 pt — el gesto que repites cuatro veces era el pequeño.

**Y al terminar una serie ya se ven los tramos**: el resumen pasó de «¿hay más de un bloque?» a «¿hay más de una fila?», porque una carrera estructurada es UN bloque con N tramos. Cada uno con su ritmo **medido**.

---

## Cerrado el 30-jul · La honestidad de la duración y de las series

**La duración la escribe el coach o ES el resultado — no hay tercer caso.** El «26 minutos para todo» eran el calentamiento y la vuelta a la calma compartidos (25,7 min): el trabajo no entraba nunca. De 42 plantillas, 26 pierden el número; y leer la prescripción tipada se lo **da** a 12 entrenos libres que la fórmula vieja no sabía leer. La semana dice ahora las dos mitades: «6 sesiones · desde 50 min» + «5 sin tiempo previsto».

**El motor ya graba las recuperaciones** (0146, con `leg_index`/`leg_role`/`leg_phase`), y el reloj deja de fundir los tramos en una fila. Eso rompía ~20 lectores que asumían «una fila de correr = un esfuerzo»: la economía en Z2 le habría dicho al coach que el atleta empeora justo cuando entrena más duro.

**El resumen honesto de una serie está diseñado** (`/es/design/resumen-carrera` y `watch-resumen`): la media se gana ser el sujeto **solo si la carrera fue UNA sola cosa**. Falta construirlo en Swift — y falta guardar la serie de ritmo, que hoy no existe en ninguna tabla.

---

---

## Cerrado el 29-jul · El triaje de coherencia, entero

Las cuatro tandas fusionadas y verificadas (iOS BUILD SUCCEEDED · typecheck limpio · ~1.880 tests en verde). Origen: `docs/audits/triaje-coherencia-28jul2026.html`.

**Una sola verdad por concepto.** Las zonas de FC no eran dos modelos sino **tres** — el tercero, un `200` clavado en el SQL del coach. Manda el umbral, el móvil deja de calcularlas, y muere `PersonalHRMax`, cuyo `resolve(nil,nil,nil)` **nunca devolvía nil**: todos los `zone_seconds` que ha visto Pablo salían de un 184 inventado (0 de 8 atletas tienen máxima medida). La FC en reposo caía en el día equivocado en **64 de 81 filas** por agrupar en UTC.

**Que nada se guarde sin que el atleta lo diga.** La carga prescrita dejaba de archivarse como real, el récord de celebrarse sin serlo, y un Tabata abandonado en la ronda 3 de 8 de sellarse como 8. La raíz de la recuperación tras cierre no eran las 9 líneas del modal: era que al entrar al tramo se volvía a rellenar con las prescritas.

**Que el coach no decida con datos fabricados.** El volumen de 7 días no eran horas (`Σ tss/60`, +63 % a un atleta); el gráfico de carga usaba **otro motor** que su propia tarjeta (4,2 bajo un KPI que decía 8,5); el «TSB» de la barra de Rendimiento contenía **TSS**, así que cuanto más entrenabas más «fresco» decía; y su consulta pedía la tabla `training_load`, **que no existe** — el error se tragaba en silencio y la casilla enseñaba «—» a todo el mundo desde siempre. El briefing diario inventaba tres cifras y la ficha de un atleta sin datos servía **los números de Marc con el nombre real encima**.

**Que el conjunto se vea como una app.** El censo real de formateadores era **23 relojes, no 6**; 9 ritmos con 3 grafías; 11 distancias. La cadencia se escribía «ppm», la misma unidad que el pulso y en las mismas pantallas. El reloj escribía los kilos con punto y el móvil con coma.

---

## Cerrado el 29-jul · El umbral, el peldaño «declarado» y la escalera de ritmo

El test de umbral **no existía**: vivía en un seed de `methodology_tests`, tabla vacía que ninguna línea de aplicación consulta. Y no era conectable — los CHECK no admitían ni la medida `hr` ni la calibración `hr_zones`, y si un valor hubiera llegado igual, el puente lo trataba como contrarreloj: **156 ppm se habrían guardado como 156 segundos**. Ese mismo fallo lleva meses shipeado en la recuperación de pulso, que se pinta como un cronómetro.

**La escalera pasa a ser medido → declarado → 0,88 × FC máx → 0,88 × Tanaka**, y `estimated` deja de ser un booleano: ahora hay `confidence` (measured | declared | estimated), porque un sí/no no distingue un test de laboratorio de un cumpleaños — y esa indistinción **es** el mecanismo por el que una estimación se disfraza de medición. `loadHrAnchors` filtraba por fecha y no por procedencia: un declarado de ayer le ganaba a un test de la semana pasada.

**El mapper era UNA función desconectando tres peldaños de la escalera de ritmo.** Por eso 66 y 67 tenían umbral medido y ninguna zona. Arreglado: 66 pasa de 241 estimado a **248 medido**; 67 de 250 a **270**, que es el umbral que él mismo registró.

Migración **0145 aplicada** (aditiva, amplía dos listas CHECK).

---

## Abierto · El onboarding no lo ha recorrido nadie, y tiene 15 agujeros

**0 de 8 atletas han pasado por el onboarding de la app.** Los que figuran como completados lo recibieron del alta web del coach, que lo estampa **para saltarse** los 19 pasos. Así que el dato no se pierde por el camino: el camino no se ha recorrido.

Pero si alguien lo hiciera hoy, **15 respuestas caerían por un agujero del validador**: las 5 estaciones de HYROX, los 5 campos del paso de umbral (incluida la FC máxima, cuya columna existe y está vacía en 8/8), el 1K de remo, el 500 de ski, las horas de sueño, las horas/semana y el tipo de objetivo. Además hay **6 enterrados** (se guardan y no los lee nadie) y **12 mudos** (se leen y ninguna pantalla los pinta). Y **27 columnas que el onboarding escribe no las devuelve ningún endpoint con bearer de atleta**.

El caso que mejor lo resume: el paso de umbral pregunta la FC máxima, el servidor la tira, y luego «Mis zonas» le pide al atleta que **la vuelva a teclear** en Perfil.

---

## Abierto · 29 rutas de API del coach que no llama nadie

Trabajo construido y servido que Pablo no recibe: la **revisión semanal entera**, la tabla de cohorte, el briefing, la bandeja de triaje con acciones en masa y posponer, los ajustes masivos de plan con previsualización y deshacer, la paleta ⌘K, el mensaje a varios atletas, y **la ingesta del método por RAG** — que es el titular del proyecto. Hay hasta un `columns.ts` huérfano que define etiquetas y anchos de una tabla que nunca se construyó.

Ninguna pantalla pinta hoy `load_coverage`, `tsb_label`, `acr_label`, CTL, ATL ni ACR: la decisión de la cobertura vive entera en el DTO. **«Lo computa el módulo» no es «lo ve el coach».**

---

---

## Pendiente de fondo · La metodología propia

Tenemos tecnología pero no método. Pablo no tiene uno documentado y su referencia es la metodología del entrenador que le entrena a él como atleta — que no es la dirección que queremos. La salida no es discutirle el contenido, es darle un **marco ya decidido y modificable**, para que su trabajo sea corregir en vez de crear.

La tesis de trabajo: *la identidad de un método no está en los ejercicios, está en las reglas*. Los ejercicios los usa todo el mundo; lo que nos hace reconocibles es cómo decidimos, medimos y ajustamos.

---

## Cerrado el 28-jul · TANDA 1 del triaje — una sola verdad por concepto

**Sin desplegar. Cero migraciones.** Base de las demás tandas: todo lo que viene
después se apoya en esto, por eso fue sola.
Origen: `docs/audits/triaje-coherencia-28jul2026.html`.

**1 · Las zonas de FC ya significan lo mismo en los dos lados.** Había TRES
modelos: %LTHR en el servidor (el que alimenta al Garmin), %FCmáx en el iOS (el
HUD en vivo y los `zone_seconds` que lee Pablo) y %FCmáx sobre un **200 clavado
en el SQL** en las analíticas del coach. Con el atleta 64 (nacido en 1982, sin
máxima medida) el primero pone Z2 en **128-137 ppm** y el segundo en **106-124**:
bandas disjuntas. A 130 ppm estaba donde su coach quería y la app le decía Z3.
**Decisión: manda el umbral, nunca la máxima** — es lo que mide un test y contra
lo que prescribe el coach; sacar un porcentaje de una máxima estimada por edad
son dos suposiciones apiladas. El modelo vive una sola vez en
`shared/domain/methodology/hr-zones.ts`, el servidor lo publica en
`GET /api/athlete/zones` y con la identidad, y **el iOS dejó de calcular zonas**:
borrados `percentOfMax`, `HRZoneClassifier` y `PersonalHRMax` entero.

**2 · Se acabó la FC máxima inventada de 184.** `PersonalHRMax.resolve(nil,nil,nil)`
NUNCA devolvía nil, y era la única vía de construcción de sesión: los segundos por
zona que le llegan a Pablo salían de un número que nadie midió (0 de 8 atletas
tienen máxima en la base). Sin ancla ya **no hay zonas**, y lo estimado viaja
marcado hasta el coach: el resumen dice «Umbral 156 ppm · estimado», el tiempo en
zona lleva su ancla, y el reloj no recibe alerta si el umbral es estimado.

**3 · El VO₂máx del mismo Cooper por dos fórmulas.** No sobraba ninguna: Cooper
estima **VO₂máx** (2800 m → 51,3) y Daniels estima **VDOT** (→ 43,9), que es otra
magnitud aunque comparta unidades. Lo que sí estaba duplicado era **qué fila se
coge**: la pantalla cogía el Cooper más largo y la proyección el más fresco, y la
pantalla aceptaba cualquier 5K mientras la proyección rechazaba los que nadie
midió (el atleta 67 tiene tres `run_5k` con `source='unknown'` y salía un VDOT de
49,9 en pantalla). Ahora hay **una** regla de evidencia en `mark-projection.ts`.

Pendiente natural: nadie escribe todavía un `lthr_bpm` medido — la cadena de
anclas lo prefiere, pero no hay UI que lo registre, así que hoy todo umbral es
estimado. Y si algún día se quiere el histórico de bandas de FC (snapshot como el
de ritmo), eso sí pediría migración.

---

## Cerrado el 28-jul · Las tres señales de salud que Alex trajo de entrenar

**Sin desplegar. Cero migraciones.**

**1 · La FC en reposo no se leía — por TRES sitios, no uno.** Contra los datos
reales del atleta 64 (45 lecturas de `hr_resting`): (a) compartía el corte de
las 14:00 del sueño, pero es un AGREGADO DIARIO que Apple sella a cualquier
hora — las lecturas del 3-jul (58 ppm, 15:19) y del 27-jun (54 ppm, 14:32)
estaban en la base y la app decía «sin dato aún»; (b) Apple REESCRIBE la FC del
día (51 → 50 → 52 con el mismo `recorded_at`) y no había desempate, así que se
enseñaba la que devolviese el planner; (c) la lectura llega 6-13 h tarde y falta
los días sin reloj, y la fila se quedaba vacía en vez de enseñar la última con
su edad. Y (d) una jornada sólo se recalculaba mientras ERA hoy, así que una FC
publicada con retraso no entraba nunca en su propio día — la ingesta de
HealthKit recalcula ahora los días que tocan las muestras que llegan.
Réplica de solo lectura sobre producción (25-jun → 28-jul): 2 días recuperan su
lectura, 2 corrigen la revisión, 30 idénticos, 0 regresiones.

**2 · Los entrenos del móvil ya se escriben en Apple Salud.** La app sólo
escribía desde la muñeca; entrenar sin reloj dejaba la sesión invisible para los
anillos y para todo el ecosistema de Apple.
`HealthKit/HealthKitWorkoutWriter.swift` escribe el HKWorkout con tipo de
actividad de verdad por modalidad (remo→rowing, ski→esquí de fondo, bici, correr,
fuerza, funcional) y energía/distancia/FC POR TRAMO. Sin duplicar: antes de
escribir le pregunta a Salud si ya hay un entreno que cubra ese intervalo (solape
≥50 %) y adopta SU uuid — vale si fue el reloj, si fue otra app o si el relevo
del reloj llegó tarde. El uuid viaja como `source_workout_ref`, que el camino
libre tiraba aunque el reloj lo hubiese generado. Y no nos leemos a nosotros
mismos: lo que escribimos va marcado y el lector lo descarta.

**3 · El VO₂máx existe para el atleta.** Nueva pantalla (Perfil › Rendimiento ›
«Tu VO₂ máx») con las cuatro reglas de `docs/design/pantallas-que-ganan-su-altura.html`:
el número a 88 pt como sujeto, la curva de 3 meses, el «Probarme · Cooper 12 min»
anclado abajo. **La regla de coherencia la decide el servidor**
(`GET /api/athlete/vo2max`), no la vista: manda el del reloj; sin reloj manda el
Cooper (su regresión mide esta misma magnitud, por eso el estado vacío tiene
salida de verdad); el VDOT de las marcas va debajo con su fuente escrita y
JAMÁS se promedia con el titular.

Pendiente natural: espejar las tres en el doble (la hoja de «Cómo llegas hoy» y
la pantalla de VO₂máx no tienen aún su pantalla en `(design)`).

---

## Apple Watch · diseño portado a Swift (era pendiente 28-jul)

El bloque de diseño del reloj **ya no está congelado**: el 3-ago se portó el
lenguaje del doble a WatchOS (ver entrada arriba). Sigue valiendo el hallazgo:
avanzar de ronda desde la muñeca ya funcionaba; lo que faltaba era la ejecución
visual por casuística — eso es lo que entra ahora.

---

## DEUDA VIVA · queda UNA entrada de DECISIONS.md por subir

La sesión del doble ya commiteó y, al hacerlo, **repuso las dos entradas
apartadas** (dobles/race-evidence, semana bloqueada del free) **y la del
EMOM/interval** desde los diffs del scratchpad. Queda pendiente la que nunca
tuvo diff: **el reloj como tercera forma del entreno libre**, que vive solo en
el mensaje de su commit y debe subir al registro cuando su sesión retome.

---

## Cerrado el 28-jul · El ergo SÍ sincronizó — lo que fallaba era otra cosa

El «no han empezado sync» de la 173 (ski 400 m) **no era el ergo**. La DB lo
desmiente: `segment_executions` guarda 400 m en 4 splits de 100, 165,7 W,
38 paladas/min, `source: pm5`. Eso es telemetría real, no se teclea a mano —
y sincronizó mejor que la 179 (remo 5×500), que sólo capturó 1 split de 5.
Lo que no arrancó fue el **pulso** (FC 70/80 en un esprint a 165 W): la 173
fue lo primero de la mañana y la primera lectura de HealthKit del día llega
a las 09:28, después de que la pieza terminara a las 08:58. Ya lo arregló
otra sesión. **Punto cerrado: no perseguir más el ergo.**

**Pero al mirarlo salió un fallo que nadie había reportado: el ski se
guardaba como remo.** Remo, ski y bici comparten un monitor PM5 y una sola
rejilla en vivo, así que el `SegmentKind` no puede decir qué máquina fue y
su cubo por defecto contesta "row". Se guardaba la máquina que **transporta**
el dato, no la que **entrenó** el atleta. No es cosmético: un ski 1.000 y un
remo 1.000 son marcas distintas del catálogo, las analíticas por modalidad
mezclaban dos disciplinas que no se parecen y el predictor transfiere ski y
remo a la carrera de forma distinta. Arreglado en la raíz — al guardar se
consultan las dos fuentes que sí lo saben (catálogo, luego prescripción).

**Soltar el aparato ya es parte de cerrar la sesión.** Dentro del entreno ya
estaba cubierto; el agujero estaba un piso más arriba: quien emparejaba el
PM5 en el brief y se echaba atrás sin llegar a la vista activa dejaba la
máquina cogida. `DeviceHub.stopAll()` soltaba cinta y banda pero no el ergo,
siendo que su propia cabecera prometía «un solo ciclo de vida» para los tres.

**PENDIENTE de decisión de Alex:**
- **Filas históricas mal guardadas** (ski/bici grabados como remo): hay una
  sentencia de corrección propuesta y **sin ejecutar** — la ejecuta él.
- **`exercise_id` sigue NULL** en los tramos de ergo. Enlazarlo pide contrato
  nuevo: hoy ni `WorkoutSegment` ni `LapRecord` llevan ejercicio, y el ergo
  libre no tiene ninguno que enlazar (el atleta elige *máquina*, no una fila
  del catálogo). No se inventó nada.

---

## Cerrado el 28-jul · En un For Time la transición es un SUCESO, no un toque

La distinción que ordena el motor, dicha por Alex: **en un EMOM manda el
RELOJ** — acaba el minuto, acaba la ronda, no hay nada que detectar. **En un
For Time no hay minuto que te saque**, así que las transiciones son sucesos y
el suceso lo conoce el propio aparato.

La causa estaba en el plegado: un For Time se colapsaba a UN tramo (el bloque
entero), pero la biblioteca manda una simulación HYROX como N segmentos
hermanos, cada uno con su modalidad y su medida y **ninguno con `rounds`** — la
lista SÍ es la ruta, y el cursor de tachado SÍ sabía por dónde iba. Nunca
estaba conectado al tramo. Nace el cursor `fixedStation`: si la lista son
estaciones, **la estación es el tramo**.

- **Entrada, gratis y en la raíz**: la superficie del dispositivo ya se enruta
  por el tramo, así que al entrar en el remo el ergo se pone delante solo; el
  PM5 ya se reprograma por clave de tramo, así que el monitor se pone a cero
  al llegar. El parcial de la estación arranca cuando el monitor se mueve.
- **Salida por la MEDIDA, no por el movimiento** — una regla, no una lista de
  casos: metros/calorías los sabe la máquina · segundos los sabe el reloj de la
  app (sin emparejar nada) · repeticiones no las sabe nadie y ahí se toca.
- **Un monitor parado NO es una salida.** La prueba es el CRUCE del objetivo,
  no «la lectura está por encima» — por eso una reconexión a mitad de pieza no
  la da por hecha ni la reinicia.
- **Siempre hay salida manual**: el botón grande deja de cerrar el bloque
  entero y cierra la ESTACIÓN, igual que la línea.
- **La pizarra**: el reloj del bloque (que es la puntuación) se muda a una
  franja de contexto y no desaparece nunca; en una estación a pulso el sujeto
  es el trabajo que tienes delante, sin contador de repeticiones inventado; lo
  tachado lleva su tiempo real y lo que la máquina midió — **1.014 m se leen
  1.014**, no se redondean al objetivo.
- **La transición viaja al reloj**: el espejo leía el título plegado del bloque
  y decía lo mismo veinte minutos; ahora lee el tramo.

Verificado con banco standalone (52 asserts) sobre los ficheros de dominio
reales y prescripciones de producción. EMOM, AMRAP, For Time con rondas y el
5×500 real (exec 179) **no** son rutas y no auto-avanzan.

Y dos de la misma sesión de entreno: **en horizontal la acción ya no se
recorta** en ningún formato (el trabajo rueda, el botón se ancla) y la **cinta
deja de pintar controles que no controlan** — velocidad e inclinación se pintan
solo si la máquina declara que los acepta, juzgadas por separado.

Diseño: `docs/design/vivo-funcional-pizarra-mockup.html`.

---

## Cerrado el 28-jul · El doble: la app entera vive replicada en la web

**Desplegado en `app.fahybrid.com/es/design`** (puerta ADMIN-ONLY — solo el
usuario de Alex; un coach rebota a sign-in —, `noindex`; en el móvil,
«Pantalla completa» pinta el lienzo 1:1 y gira con el teléfono). Es la herramienta de dirección de UX que pidió Alex: se
acabaron los mockups sueltos en artifacts y HTML.

- **Marco de iPhone** (isla, barra de estado, rotación vertical/horizontal,
  claro/oscuro) y **marco de Apple Watch**; tokens 1:1 de Theme.swift en
  `twin.css` (el `colors_and_type.css` de mayo queda como histórico).
- **Seis pantallas v1**: benchmark del remo completo (marca → puerta →
  «Conecta el remo» sin escape → HUD con cara horizontal de monitor), correr
  calle/cinta (GPS, mapa, autopausa, velocidad manual honesta), dispositivos y
  relojes, el entreno en la muñeca (watch), marcas (biblioteca+detalle) y el
  ranking del box como PROPUESTA (mockup aprobado, absorbido).
- **Simulación determinista** por escenarios con cronología (el PM5 aparece al
  escanear, el monitor sucio se resetea, el GPS tarda, la autopausa engancha).
- **Contrato de sinceridad**: cada pantalla sellada espejo (con sus fuentes
  Swift en el panel) / propuesta / pendiente — el índice ES el inventario.
- **Regla de proceso** en `CLAUDE.md` + decisión en `docs/DECISIONS.md`
  (2026-07-28): los mockups nuevos nacen como pantallas propuesta del doble; un
  cambio de UX shipeado actualiza su espejo en el mismo lote.

Pendiente natural: ir espejando las cards «pendiente» (Hoy, plan semana,
post-entreno, fuerza/metcon, tests, chat…) a medida que se toque su UX.

---

## Cerrado el 28-jul · CIMIENTOS de diseño iOS — lo que ya funcionaba, extraído y propagado

**Sin desplegar. Solo iOS; cero servidor, cero migraciones.** Reglas:
`docs/design/pantallas-que-ganan-su-altura.html` · auditoría:
`docs/audits/inventario-diseno-ios-28jul2026.html`.

Alex: «es simplemente funcional, diseño cero: huecos enormes, todo pusheado
arriba, todo del mismo tamaño de letra». La auditoría demostró que la causa es
MECÁNICA, no estética, y que el sistema correcto ya estaba construido en cuatro
pantallas. Esto lo extrae a `Theme/ScreenScaffold.swift` y lo reparte.

- **`.anchoredAction`** — la acción anclada, una sola, sobre `.safeAreaInset`.
  De 6 `safeAreaInset` en 284 ficheros y cinco maneras a mano → **16 pantallas**
  con el mismo componente. Muere el FALSO ANCLA (5 pantallas de Carreras con un
  `Spacer(minLength:)` dentro del `ScrollView`, que no empuja nada) y el número
  mágico `.padding(.bottom, 120)` de MarkDetailView.
- **`CenteredScreen`** — el reparto de altura. El mecanismo existía tres veces
  sin compartirse; ahora es uno, y además SCROLLA en vez de recortar con texto
  grande (Day1Flow no tenía un solo ScrollView en 379 líneas).
- **`RedesignEmptyState` v2** — sale de `CarrerasView.swift`, donde vivía como si
  fuera privado de una pestaña, y **exige salida**: `exit:` sin valor por defecto.
  19 usos, 19 salidas (antes 4). Lo gordo: el camino feliz de RaceDetail te pedía
  fijar un objetivo sin darte botón (nueva `FijarTiempoObjetivoSheet`), y un
  atleta sin pareja cruzaba CUATRO pantallas de Dobles idénticas sin poder
  invitar a nadie — encima el predicho dobles decía «pídeselo a tu coach», que
  nunca fue verdad.
- **`.compactSheet()`** — hojas de 1-3 campos a media pantalla (había 4
  `presentationDetents` en toda la app).
- **Tipografía**: cero medios puntos en la app (67 sitios). Y donde la etiqueta
  pesaba lo mismo que su dato, manda el dato (MyZonesView, zonas de Analíticas,
  fila de umbral de Inicio).
- **Código muerto**: `Today/TodayView.swift` y `Plan/PlanStationsSection.swift`.

**Lo que NO toqué:** la des-privatización del kit de HUD y todo el motor en vivo
(otro agente). El contenido de cada pantalla —qué es el sujeto y en qué orden va
lo demás— es la fase siguiente, con mockups aprobados.

---

## Cerrado el 28-jul · El registro dejaba de decir la verdad — `source`, el RPE ajeno y el log vacío

**Sin desplegar. Migraciones 0143/0144 escritas y SIN aplicar** (las aplica Alex).

Alex entrenó cuatro sesiones de verdad (ski 400, 1 km, EMOM, remo 5×500) con PM5 y
cinta conectados, y el registro mentía en tres sitios distintos.

- **`source` hacía dos trabajos.** Decía a la vez de qué APARATO salen los números
  y CÓMO se registró el entreno, y su tipo (`biometric_source`) solo sabe hablar de
  aparatos — así que «lo hizo en vivo con la app» no tenía forma de escribirse y el
  camino libre mandaba `'manual'` a pelo. Ahora `source` conserva su significado (la
  precedencia entre aparatos de los ingestores depende de él) y nace `recorded_via`
  (live | manual | imported). `contributing_sources` y `totals_source`, que existían
  desde 0108 y **nadie escribía**, pasan a llevar los aparatos reales.
- **El histórico NO se reescribe.** De las 74 filas `manual`, 57 son seed y 1 es un
  registro tecleado de verdad. El backfill es aditivo y sale de evidencia ya
  guardada (un registro a mano no graba tramos); las de seed se quedan en NULL,
  que es la respuesta honesta.
- **El «RPE 7» no era un fallo de lectura.** Los dos endpoints devuelven 9
  (verificado ejecutando los loaders reales contra producción). El calendario del
  historial abría `day.sessions.first`: en un día con cuatro sesiones, tocabas la
  carrera y se abría el ski. Ahora un día con varias sesiones no adivina — las
  enfoca abajo y eliges.
- **El 7 sí se estaba fabricando al GUARDAR:** el selector nacía en 7, así que tres
  de las cuatro ejecuciones llevan un esfuerzo que Alex nunca eligió. El RPE pasa a
  ser opcional de verdad y el log dice «sin registrar» en vez de un número de nadie.
- **El log ya no es un reloj y dos tiles.** El titular es el TRABAJO (rondas de un
  EMOM, distancia de un remo, tiempo de un For Time), y debajo van FC/potencia/
  palada/calorías, zonas, tramos con su aparato, parciales, «cómo fue» (RPE +
  dificultad + molestia, que se guardaban desde #58 y no volvían nunca) y, al final,
  la procedencia. Cada bloque condicionado a que ESA ejecución tenga el dato.

**Pendiente de decisión de Alex:** el RPE no se puede añadir a posteriori (no hay
endpoint de edición); hoy si no lo contestas al acabar, se pierde.

**Lead anotado, no perseguido:** cada guardado de entreno libre consume DOS ids de
`workout_executions` (173, 175, 177, 179 con hueco en medio) mientras la secuencia
de asignaciones va seguida — apunta a un intento que hace rollback dentro de la
transacción de `create-free-workout`. No pierde datos; merece una mirada.

---

## Cerrado el 28-jul · EL TRAMO MANDA — la pantalla en vivo, rehecha desde la causa

**Sin desplegar.** Solo iOS; cero migraciones. Alex entrenó de verdad (ski, carrera,
EMOM ski+bike, remo 5×500 → ejecuciones 173/175/177/179) y trajo quince síntomas.
Eran tres causas.

- **Los dispositivos eran un caso especial del ejercicio suelto.** La app decidía
  qué medir mirando el SEGMENTO. En el EMOM de ski+bike los dos movimientos
  colapsan a un kind que no es de ergo, así que no se podía ni conectar el PM5 y
  no se guardó un solo dato (producción: `modality: "other"`, cero erg). Ahora
  manda `LiveTramo` — la ventana activa (ronda del EMOM, serie del intervalo,
  tramo de carrera) con su modalidad, su medida y su objetivo. Vale para cualquier
  aparato, no solo el PM5.
- **El reloj medía la sesión, no el tramo.** El tramo tiene reloj propio, se
  congela al entrar en el descanso, y en un tramo de ergo sin caja de tiempo
  **arranca cuando el ergo se mueve**, no al pulsar Empezar. Y su ventana de
  metros se reancla por serie (adiós al 1000/500 de la segunda).
- **La vista no se ganaba su altura.** El objetivo dice lo que TE QUEDA con una
  barra que se ve, el hero crece hasta llenar el hueco muerto, el raíl pasa de
  ocho azulejos ilegibles a tres grandes, y **el descanso es una pantalla con
  sujeto propio** (cuenta atrás enorme, qué viene, cómo baja tu pulso, cómo fue la
  serie). Horizontal por fin tiene acción.

También: **hápticos que se notan** con el móvil en el suelo (los generadores se
soltaban antes de vibrar; y un tick de cuenta atrás era el impacto más flojo de
iOS), **un pulso de reposo deja de contar como esfuerzo** (el ski salió a 70 ppm y
121 s en z1 porque el reloj no se unió y colábamos la lectura pasiva de fondo),
**se puede seguir entrenando al acabar** en vez de caer directo a guardar, y **los
aparatos se sueltan al terminar**, no al desmontarse la pantalla.

Verificado contra las prescripciones reales de esas sesiones con un banco que
compila el dominio de verdad: 35 comprobaciones en verde.

---

## Cerrado el 28-jul · El cronómetro sin movimientos SE GUARDA (era lo único que faltaba)

**Sin desplegar todavía.** Servidor + iOS; **cero migraciones** (la forma viaja en
`templates.meta_json`, que ya existe y ya lleva el `origin`).

Ayer el arranque en un toque quedó hecho pero la sesión **moría al cerrar**: el
servidor exigía al menos un ejercicio y el 422 ni siquiera se reintenta. Un
cronómetro sin movimientos tiene formato, duración y esfuerzo REALES — registrarlo
es justo lo que nos separa de una app de crono. Decisión tomada y construida.

- **El reloj es una tercera forma, no un caso degenerado.** Un funcional sin ítems
  manda la prescripción que corrió (esquema + rondas/ciclo/ventana, **sin sets**) y
  se valida igual de estricto que todo lo demás: esquema metcon obligatorio, y si
  trae sets se rechaza (declarar contenido y no declararlo a la vez es incoherente).
  **Fuerza sigue exigiendo ejercicios**: una sesión de hierro son sus levantamientos,
  ahí no hay reloj que la defina.
- **Cero segmentos, cero ejercicio inventado.** No hay movimiento honesto que
  nombrar, así que no se fabrica ninguno — meter un placeholder ensuciaría sus
  analíticas por ejercicio. La forma se guarda en `meta_json.prescription`.
- **El plan ya no pinta un FORMATO donde va la modalidad.** `week-plan` leía los
  segmentos y, sin ellos, caía al formato: la semana decía `modality: 'amrap'`. Ahora
  el reloj declara `funcional` y su duración exacta cuando el formato la acota
  (AMRAP = su ventana; EMOM = rondas × ciclo). For Time y Rondas son abiertos: no se
  inventa duración.
- **El cajón del coach deja de mentir.** «Este entreno no tiene plantilla asociada»
  era falso: tiene plantilla, no tiene ítems. Tres estados distintos, tres frases
  distintas — y el título de la sesión (que ES su forma, «AMRAP · 12:00») ya no se
  pierde.
- **La hoja «¿qué hiciste?» sigue ahí y nunca bloquea.** Si la saltas, guardado
  igual; si la rellenas, los movimientos sustituyen a la forma y cuentan en tus
  ejercicios. El copy ya no amenaza con que «se queda solo en el reloj».

Verificado: los tests nuevos FALLAN sin el cambio (6 del validador; 3 de la semana
con el error exacto `expected 'amrap' to be 'functional'`) y pasan con él, contra
rama Neon real. tsc + eslint + 1737 tests en verde; build de iOS en verde.

---

## Cerrado el 27-jul · El constructor funcional ya es un cronómetro de box (y sabe de intervalos)

**Sin desplegar todavía.** iOS + dos ficheros de `shared/domain`; cero servidor, cero migraciones.

Idea de Alex probando la app: en «Crear funcional → EMOM» los valores por defecto
ya eran buenos, pero **obligaba a añadir movimientos antes de dejarte empezar**. Una
app de crono arranca en dos o tres toques; nosotros no arrancábamos hasta declarar
contenido. Esa era toda la diferencia.

- **Arranque vacío.** Los cuatro formatos (EMOM, AMRAP, For Time, Rondas) son relojes
  completos por sí solos, así que «Empezar» solo pide formato. **De 6 toques a 4**
  hasta el primer pitido (uno de los que se van cargaba el catálogo por red).
- **Preguntar después.** Al cerrar, un paso de un toque para decir qué hiciste, con
  el mismo selector y la misma tarjeta de dosis del constructor. Lo declarado a
  posteriori sale idéntico en el cable a lo declarado antes.
- **Recuerda tus números** por formato. En un box se repite la misma forma toda la
  semana. Solo estructura, nunca los movimientos.
- **Modo interval de los Rogue** (ampliación de Alex): trabajo y transición
  explícitos — 10 rondas de 1 min con 45 s de trabajo y 15 s de cambio. El motor
  **avisa de cuándo PARAR**, no solo de cuándo empezar (tono nuevo «para» +
  háptico), el HUD dice TRABAJO / CAMBIO con su cuenta atrás, y Tabata cae solo
  como preajuste de la misma estructura. Preajustes en un toque: Al minuto / 45-15
  / Tabata; el EMOM simple no gana ni un toque.

**Desbloqueado el 28-jul** (ver la entrada de arriba): el cronómetro sin movimientos
ya se guarda. Aquella nota decía que el servidor no lo aceptaba y que el copy lo
avisaba en claro; ambas cosas dejan de ser ciertas.

**Lo que NO existe y no construí** (avisado, no inventado): un EMOM no tiene conteo
de repeticiones por ronda. Tabata sí (`rotRepsByRound`) y el AMRAP tiene su ronda
parcial, pero el EMOM solo registra rondas hechas de N — y como graba UNA vuelta
para todo el bloque, no hay fila por ronda donde colgar las reps. No es un enganche,
es una forma de registro nueva.

Verificado: build del simulador en verde; `work_s`/`rest_s` de EMOM comprobados
contra PRODUCCIÓN (cero filas con `rest_s`, así que el ciclo no se mueve); tsc y
282 tests de vitest en verde. Decisión en `docs/DECISIONS.md`.

---

## Cerrado el 27-jul · Los benchmarks pedían un ritmo imposible (1:52 /km). Muerto de raíz

**Sin desplegar todavía.** Solo iOS; cero servidor, cero migraciones.

Alex lanzó el Cooper 12' en su iPhone y la pantalla le pedía **«@ 1:52 /km»**,
más rápido que el récord del mundo de 1 km. Salía en todos los benchmarks y
afectaba también a los atletas de pago.

- **La causa.** El borrador libre nacía con el ritmo por defecto del REMO
  (112 s = 1:52/500 m) y `BenchmarkLaunch` asignaba `draft.modality` a pelo,
  saltándose `selectModality()`, que es quien siembra los valores de cada
  disciplina. Sin récord comparable el 112 se quedaba pegado; en el Cooper
  pasaba SIEMPRE, porque su unidad es metros y nunca se calcula objetivo.
- **La regla.** Un benchmark es un esfuerzo a tope: el único objetivo honesto es
  tu propio récord. Con récord, el bloque dice «Benchmark · a batir 3:52» (o
  «2800 m» en el Cooper) y los contrarrelojes llevan el ritmo derivado de esa
  marca. **Sin récord, no hay objetivo** — la pantalla se calla en vez de
  inventar un número.
- **Blindado por el compilador.** `FreeWorkoutDraft.modality` es `private(set)`:
  la única entrada es `selectModality()`, que siembra el ritmo. El arrastre no
  puede repetirse en ningún lanzador futuro. `targetKind` pasa a opcional; el
  contrato con el servidor no se toca (`target` ya era opcional en los dos
  niveles y `validateFreeWorkout` nunca lo exigió).

Verificado: build del simulador en verde; tabla de las 9 marcas del catálogo
(antes/después, con y sin récord) comprobada contra las funciones reales. El
ritmo falso ya no se guarda en la prescripción que ve el coach.
Decisión en `docs/DECISIONS.md`.

---

## Cerrado el 27-jul · Predictor: las marcas por fin alimentan la proyección, y deja de mentir en los tres fallos de modelo

**Sin desplegar todavía.** Servidor y dominio; cero iOS, cero migraciones.

- **El cable que faltaba.** «Probarme» escribía en `athlete_benchmarks` y
  **ninguna ruta de predicción leía una fila**. Ahora la jerarquía del lado
  entrenado está declarada en un sitio: *marca medida > VO₂max del reloj >
  umbral > ejecuciones*. Entra también el VO₂max del Apple Watch (59 lecturas
  en prod, cero consumidores hasta hoy). Correr reutiliza el Daniels-Gilbert
  que ya estaba en el repo; ergo usa Riegel (`k=1.06`) para 500→1000, nunca ×2.
- **La evidencia envejece.** Los 180 días dejan de ser un escalón y pasan a ser
  la vida media de una decaída continua. Antes, una carrera reciente CONGELABA
  el número; ahora entrenar lo mueve desde la primera semana.
- **Ningún hueco se cobra al objetivo.** Un tramo sin datos ya no cuesta su
  presupuesto (= la meta repartida): no aporta nada, se nombra, y el total y el
  gap van a nulo mientras falte algo. Es el fallo que le decía a un principiante
  que iba bien.
- **El factor de competición se pondera por tiempo de tramo**, no por media
  aritmética de cocientes.
- **Rango en todo** (ley 1): banda por tramo, rango del total, `coverage` y
  `next_inputs` («Mide tu SkiErg 1000») — campos ADITIVOS, la app instalada no
  se entera.

Verificado: 2011 tests en verde (+26), typecheck limpio, lint idéntico al
baseline, y los suites de DB pasados contra rama Neon propia — incluidos dos
tests nuevos end-to-end que prueban que una marca mueve la proyección y que un
novato ya no recibe un total inventado.

**BLOQUEADO por datos, para Alex** — las 5 estaciones de fuerza y el perfil
siguen sin fuente, y **no se ha fabricado ninguna**. Comprobado contra prod:
hay **0 carreras singles reales con splits** (las 2 que hay son sintéticas); las
8 reales son de **dobles**, donde las estaciones van repartidas entre dos y no
describen una forma de singles. Y `weight_kg` / `height_cm` / `body_fat_pct`
están **vacías en los 8 atletas**. Sin eso no hay prior por estación ni signo
del peso (spec §05). Es la decisión abierta de §10: datos de población, o
esperar a las primeras importaciones reales de singles.

---

## Cerrado el 27-jul · Predictor: fuera el dato inventado del cohorte, y una sola cuenta en dobles

**DESPLEGADO** (`758770d` READY) y **mig 0142 APLICADA en prod**: 14 filas
marcadas sintéticas (solo las dos cuentas `@demo.fahybrid.local`), 12
carreras reales intactas. Smoke ok (goal-gap y dobles/race-gap 401 sin
bearer). Pendiente: cable para instalar iOS con el cambio de dobles.

**Idea de Alex (27-jul, noche) — el SEGUNDO gancho del free: cronómetro
inteligente de WOD.** Ya tenemos HUD por formato (EMOM con rondas y
alternancia, AMRAP con contador, For Time, chipper, escalera, simulación) —
más que cualquier app de timer, porque el nuestro además REGISTRA y lee las
máquinas. Lo que falta para ganarles: **velocidad de arranque** (ellos
pitan en dos toques; nosotros pasamos por el constructor). La solución ya
existe a medias: la **línea rápida** del editor del coach (gramática del
importador) aplicada al atleta → `EMOM 12 · 10 burpees` en un campo de
texto. Requisitos no negociables de un timer de box: números legibles a 3 m,
audio sobre la música, pantalla que no se apaga, convivencia con Spotify,
reloj. **Por qué importa:** marcas = profundidad 1×/mes; timer = frecuencia
3×/semana. El embudo necesita los dos.

Dos de los fallos que la spec del predictor (`docs/race-projection-spec.html`, §01b)
marca como «ya afectan al pago». Ninguno depende del rediseño del modelo.

**Carreras sembradas contaminando el cohorte.** Los seeds de demo escribían en
`races` con el `source` del fixture (`hyresult_import`) y, para la pareja, con los
splits multiplicados por un factor. El cohorte —la única lectura de `races` que
cruza atletas— las contaba. Comprobado en producción: para un objetivo de dobles
de 65 min entraban 12 carreras, **5 sembradas**; ahora quedan 7 reales (sigue por
encima del mínimo, la lectura no se degrada). Columna propia `races.is_synthetic`
(migración **0142, escrita y probada contra rama Neon, SIN aplicar a producción** —
lleva el backfill de las 14 filas de cuentas demo).

**Dobles calculaba dos veces.** La regla del reparto estaba en TS y en Swift, con un
clamp que sólo existía en la app y cero tests que las comparasen; además el hero,
las filas y el editor rehacían restas que el servidor ya sabía hacer. Ahora la regla
vive en `shared/domain/dobles-gap` (con el clamp), el endpoint emite `delta_s` y
`gap_s` como el gap individual, y iOS sólo previsualiza el tramo que se arrastra.
Los dos lenguajes clavados contra la misma tabla de casos.

Detalle en `docs/DECISIONS.md` (dos entradas del 27-jul).

---

## Cerrado el 27-jul · El benchmark del remo arrancaba sin PM5 — la puerta estaba en el sitio equivocado

Alex lo pilló en el box: «Probarme ahora» → EMPEZAR → la pieza corría sin monitor.
La secuencia de conexión (ErgPreStartFlow) estaba SOLO en el brief del plan, y los
caminos libre/benchmark se saltan ese brief (`WorkoutContainer.loadPlan` → `.active`).
Fix de raíz: el gate vive ahora en el punto único que cruzan TODOS los caminos — la
puerta de bloque del motor (`ActiveWorkoutView.requestBlockStart`): bloque con erg y
sin monitor → conectar primero (benchmark sin escape); bloque de correr sin
calle/cinta → pregunta primero (arregla también el benchmark de correr, que nunca
preguntaba). El brief conserva solo la tarjeta de conexión temprana. **Instalado en
el iPhone de Alex** (BUILD SUCCEEDED + devicectl install) con todo el lote que
esperaba cable: los 8 arreglos del gym, el reset del PM5 sucio y el Watch.
Pendiente de prueba física: remo con 100 m hechos → conectar → debe resetear a la
pieza programada.

---

## Cerrado el 27-jul · El dashboard iba a 3-4 s por clic DESDE SIEMPRE — funciones en Washington, DB en Frankfurt

Alex reportó lentitud crónica en cada navegación. Causa raíz: nadie fijó región
de funciones en Vercel (default `iad1`, EEUU) con Neon en `eu-central-1` — cada
página paga 8-12 queries en serie y cada una cruzaba el océano (~90-100 ms).
Fix: `"regions": ["fra1"]` en `web/vercel.json` (mismo datacenter AWS que Neon),
desplegado y verificado (`x-vercel-id: cdg1::fra1`). Queda anotado (no urgente
tras el fix): `getCoachSession()` se resuelve 2× por navegación (layout + página,
sin React `cache()`), y el layout recalcula badges del sidebar en cada clic sin
streaming/`loading.tsx`.

---

## NUEVO MANDATO de Alex (27-jul, tarde) · Multi-coach DE VERDAD antes de que haya gente

Palabras de Alex: el free es la excusa para hacer la app «como debería haber
sido desde el principio» — hecha para que haya MÁS cuentas de coach, no un
club con software. Reestructurar bien AHORA, que no hay usuarios y romper es
gratis; no preocuparse por trabajar más: perfecto para largo plazo.
**Auditoría HECHA (~150 hallazgos file:line) y plan DISEÑADO:**
→ `docs/multi-coach-plan.html` (modelo objetivo en 6 principios + 6 obras +
4 decisiones de Alex) · inventario completo: →
`docs/audits/single-coach-audit-27jul2026.html`.
Titulares: la capa método YA escala; el negocio (leads/citas/métricas) no
tiene tenant EN EL ESQUEMA; no puede nacer un club #2 desde el producto;
2 escrituras destruyen datos de otros clubes; iOS expulsa al free (gate por
Stripe activo contra el endpoint legacy sin `tier`); legal nombra a Pablo
responsable de todo dato. Orden recomendado: obra 0 (higiene peligrosa) →
obra 1 (iOS free, LANZA el free) → puerta → esquema → dinero → tiempo/voz,
con lo legal en paralelo antes de abrir el club #2.
Alex ratificó ejecutar con mis recomendaciones (plataforma-comercio, sin
white-label, fahybrid.com sigue de Fabrik, orden 0→1→puerta→esquema→dinero→
voz). Listón explícito de Alex: perfecto, mejores prácticas, CERO código
muerto.

**Obra 1 HECHA y fusionada** (`dd56744`, BUILD SUCCEEDED en el checkout
fusionado): el free ENTRA — gate por `tier` desde `/api/athlete/subscription`
(muere `planLabel` muerto del cliente; la ruta legacy `/api/stripe/
subscription` del servidor se borra TRAS el rollout), `has_coach` persistido
(default coached → los atletas de Pablo, cero cambio), `FreeInicioView`
según mockup, chat/copy de coach condicionados, ni un «Pablo» hardcodeado.
Pendiente físico: cable para instalar; cuenta free de prueba para Alex
(email `+free`) cuando se encienda `FREE_SIGNUP=1`.

**Obra 0 HECHA y DESPLEGADA** (merge `dbe3e9b`, READY; `FUNNEL_COACH_ID=60`
puesto en Vercel): los 10 puntos + un bug preexistente de tipos en
pause-budget. El cupo era LA FILA DEL COACH RESIDUO id=4 (max 100 — ahora
Pablo ve el cupo real de su club: sin límite hasta que lo ponga); hilo de
chat scoped al club (transferencia = hilo nuevo, historial invisible e
intacto); events con dueño; bearer antes que cookie; check-then-act al
WHERE; gates de visibilidad de ejercicios/niveles (helper DRY compartido
con el importador); bajas clavadas a su suscripción. 1632 unit + 54 DB en
rama Neon real, verdes; smoke prod ok (flag-off intacto). Nota: /api/events
sin auth ya era público ANTES (catálogo de carreras) — no es regresión.
**Siguiente: instalar iOS por cable + FREE_SIGNUP=1 + cuenta `+free` de
Alex para la primera prueba real del free; luego obra puerta (alta de club
+ limpieza del residuo coach 4/15 y los demos «Pablo Amigo»).**

---

## Cerrado el 27-jul · FREE tier — el Plan deja de pedir deberes, y llega la semana bloqueada

**Sin desplegar.** Dominio + endpoint nuevo + iOS. Cero migraciones. Con coach
no cambia nada.

Alex probó la pantalla con el atleta 72 (seis HYROX importados, con splits) y le
decía *«Para decirte cuánto tardarías aún nos faltan tus marcas»*. Le pedíamos
deberes ignorando lo que acababa de darnos.

- **Lo que dicen sus carreras** (bloque nuevo, arriba): su mejor tiempo con dónde
  y cuándo, sus 8 km con su ritmo, y sus transiciones. Para el 72: **1:02:02 en
  Berlín (may-2025)**, **4:05 /km** y **4:31** de roxzone.
- **La regla que gobierna el módulo, y que salió del dato real**: el 72 corrió
  DOS dobles el mismo día, 8 km en **2137 s** con un compañero y en **3162 s**
  con otro. Correr y roxzone en dobles sí son suyos (los dos corren los 8 km),
  pero corren JUNTOS: el tiempo lo marca el más lento, así que es un **suelo**,
  no una medida. Las estaciones se reparten y **no se le atribuyen nunca**. Por
  eso tampoco se emite tendencia sobre carreras de equipo.
- **La semana bloqueada** (`«Cómo se arregla»`): estructura NUESTRA y genérica
  (calidad, fuerza, ergo, híbrido, tirada larga: la anatomía de la prueba), sin
  tocar `blocks`, `templates` ni `microcycles`. Los números son suyos o la fila
  no existe. Al 72 le salen **3 filas** (2 a la vista, 1 difuminada) desde sus
  8 km de Berlín: series 5×1 km a 4:15, híbrido a 4:25 con el volumen real de la
  prueba, rodaje 60 min a 5:07. Sin marcas de ergo ni 1RM, **esas dos filas no se
  pintan** — y eso es justo lo que «Tus marcas» le invita a desbloquear.
- **Su objetivo contra su realidad**: solo compara con carreras de la MISMA
  categoría. El 72 apunta a **1:10:00 en dobles pro** y ya hizo **1:05:53** en
  dobles pro: su objetivo se le ha quedado corto. Su 1:02:02 de Berlín NO se usa
  (era open).
- **Copy**: «~4-5 min» se leía como su marca cuando es lo que dura el test →
  «te lleva ~4-5 min». Y cada marca pendiente dice qué desbloquea.

Endpoint nuevo `GET /api/athlete/free-plan` en vez de más campos en `/plan/week`:
otra pregunta, y no le cobra cuatro lecturas más al atleta de pago. **Trampa
esquivada**: los cargadores de atleta establecidos llegan al dato vía coach
(`a.coach_id is not null`), así que con `coach_id` nulo devuelven vacío en
silencio; estas consultas leen sus filas directas.

52 tests nuevos con las 6 carreras reales del 72 como fixture. Suite web entera
en verde (1730), iOS compila.

**Dos correcciones de dato al brief:** el 72 tiene **cero** lecturas de `vo2max`
(las 59 de prod son de los atletas 64 y 67), y el VO₂ máx **ya se pintaba** en
los dos estados desde la primera versión — no hacía falta tocarlo.

---

## EN MARCHA · FREE tier — iOS: la pestaña PLAN ya es la de conversión (27-jul, noche)

Construida sobre el mockup aprobado (`docs/design/free-plan-conversion-mockup.html`):
`FreePlanView` + `FreePlanMarksCards`, gateadas por `hasCoach` en `AppShell`
(con coach no cambia NADA). Compila en verde; **falta el cable para
instalarla**.

- **Sin evidencia** (ni marca medida ni carrera importada): primero lo que le
  damos — su **VO₂ máx del reloj**, que hasta hoy no salía en ninguna pantalla
  (`/api/athlete/biometrics/trend`) — y después lo que le pedimos: **traerse su
  historial de HYROX buscándose por nombre** (el importador que ya existía;
  arriba del todo por criterio de Alex) y, si no ha corrido nunca, las tres de
  arranque (1 km · remo 500 · ski 1.000) hacia «Probarme». Cero venta aquí.
- **Con evidencia**: su carrera + cuenta atrás, sus marcas con fecha y lo que
  le falta, y el cierre con la persona → embudo de cita ya existente.
- **NO se pinta el tiempo proyectado**: el predictor aún no lee las marcas
  (`docs/race-projection-spec.html` §01). En su lugar, la línea honesta de qué
  marcas faltan + punto de extensión marcado en la tarjeta. Fuera por lo mismo
  el diagnóstico por estación y la semana bloqueada. Decisión en `docs/DECISIONS.md`.
- **Inicio**: la barra de la semana se toca — un día abre lo que entrenaste ese
  día, reutilizando el detalle de la app con coach. Y muere el copy que parecía
  decirte que ya habías hecho un remo 500.

Cero cambios de servidor en esta pieza.

---

## EN MARCHA · FREE tier — GO de Alex (27-jul)

Alex dio luz verde («es una idea de embudo que nos puede traer nuevos
clientes»). Brief: → `docs/free-tier-brief.html` · Mockup: →
`docs/design/free-tier-mockup.html`. Modelo confirmado con Alex: mismo
atleta, con o sin enlace al coach; upgrade = enlazar coach+Stripe con todo
el histórico; downgrade/baja = aterrizar en free (la baja deja de ser un
adiós). La UI la decide el servidor con `has_coach` en la sesión: con coach
entra por el camino de HOY (intocado), sin coach por el home free nuevo.

**Fase 1 HECHA y desplegada dormida** (merge `cf665a6`; prod no define
`FREE_SIGNUP` → cero cambio de comportamiento): alta que CREA (email +
SIWA) vía `createFreeAthlete` única con reglas anti-takeover, `has_coach`
en los 4 emisores del shape de sesión, 16 tests route-level de que flag-off
= find-only byte a byte (+7 de DB listos, pendientes de rama Neon — TCP
bloqueado). SIN migración: `athletes.dob` existía desde la 0001. Decisión
en `docs/DECISIONS.md`.

**El barrido dejó las decisiones de la fase 2 (iOS free), ninguna rompe:**
- `POST /api/athlete/workouts/free` → 422 `no_coach` (el libre exige coach
  como destino del aviso) — **bloquea el grabador free**; hay que abrirlo.
- `GET /api/athlete/subscription` → `subscribed:false` sin fila → el gate
  de acceso de iOS echará al atleta free: decidir el plan 'free' ahí.
- «Probarme» free YA FUNCIONA: el catálogo de las 6 marcas es de sistema
  (`shared/domain/athlete/marks.ts`) y marks/attempt es null-safe — la
  «fase Probarme-free» no existe. Los 422/409 de calibración y zonas/1RM
  son la batería DEL COACH, que el free no incluye por diseño.
- Ranking sin coach = vacío por diseño (fase 3: división/global). Defaults
tomados del brief (free ilimitado; rankings división+global); el NOMBRE del
tier sigue abierto (decisión de Alex, sin prisa hasta la ficha).
Después: iOS modo free (home + esconder chat/plan) → Probarme de sistema →
rankings + tarjeta.

---

## HECHO — los 8 mordiscos de la tarde de gym de Alex (27-jul, misma tarde)

Los ocho hallazgos de Alex entrenando en vivo, ARREGLADOS y pusheados el mismo día (web desplegada; iOS compilado en verde, pendiente SOLO el cable para instalar):

1. ✅ Watch: «siguiente» ya no termina el entreno — en el paso final dice «Terminar» y confirma (`isFinalStep` en el frame del espejo).
2. ✅ Rueda de carga en el builder libre (2,5 kg por paso; `KgWheel`).
3. ✅ Carga EN VIVO con herencia: la rueda en el editor por serie; las series no hechas heredan, las hechas conservan su peso real (`setSetLoadCascade`).
4. ✅ Calentamiento OPCIONAL en el libre de fuerza — con ejercicios o vacío (solo la fase); dos bloques; `part:"warmup"` en el wire y el servidor lo respeta (bloque «Calentamiento»).
5. ✅ El descanso avisa de verdad: prepárate a 10 s + 3-2-1 + DOBLE háptico fuerte al cero.
6. ✅ Landscape deliberado: iPhone portrait-only.
7. ✅ Watch congelado en 0:00 con iOS en background: comando `sync` — la muñeca PIDE el frame (0,5·2·5 s); un dato entrante despierta al teléfono, su timer no.
8. ✅ Borrar un libre lo borra DE VERDAD (endpoint `plan/session/delete`, solo `origin='self'`) + regla «un libre nunca es obligación». Las del coach: se deshacen, no se borran.

**Pendiente físico:** iPhone al cable → instalar el lote (incluye la secuencia de conectar el ergo y el reset del PM5 «desconocido=sucio», que necesita prueba contra el remo real).

**Cola siguiente:** pantallas del ranking del box (el dato ya viaja en el GET de marcas) · editor fuerza/metcon (frase + fila abierta) · suite de tests de iOS bloqueada por el test de chat de la otra sesión.

---

## Cerrado el 27-jul · EDITOR DE BLOQUES rediseñado (correr) + la regla del ritmo — DESPLEGADO

Mockup aprobado: → `docs/design/editor-bloques-rediseno-mockup.html`

Alex: el panel era un mal uso del espacio, todo chips, no es lo que el mercado manda. El rediseño, construido para CORRER (el peor caso) y en producción:

- **El cajón de 576px murió**: el editor de bloque es un modal centrado de ~1060px.
- **Fila-frase**: cada tramo cerrado se lee como lo leerá el atleta ("1 km @ 4:30/km"); un Repetir plegado es UNA línea. Solo se abre el tramo tocado (3-4 campos); inclinación/cadencia detrás de chips.
- **Línea rápida**: "6x1000 @4:30 r2'" → tramos tipados vía la gramática del importador (`parseNotationCell` + `legacyToStructure`). Test que clava que los ejemplos del placeholder parsean.
- **Perfil de intensidad** (barras CSS) + **"la sesión suma"** (km · min · km de calidad · % trabajo). El test cazó metros fantasma en recuperación parado — arreglada la aritmética.
- **Añadir copia el anterior** del mismo tipo y se abre solo.
- **LA REGLA DEL RITMO** (el extra del running): en el editor POR-ATLETA, al abrir un tramo, sus zonas reales con el marcador de dónde cae el ritmo escrito y la traducción ("4:30 cae en su Z4 · 4:24–4:38"). En la biblioteca no se pinta (no hay atleta). Solo habla cuando el objetivo habla de ritmo — con RPE/FC no se inventa posición.

**Pendiente (siguiente pieza):** fuerza y metcon con el mismo patrón — la tabla de ítems ya es readout de frases; lo que falta es que el ítem abierto edite inline con pocos campos en vez de la máquina de chips de `PrescriptionFields`, y la línea rápida de fuerza ("5x5 @80% r2'30", la gramática ya la parsea; falta resolver el ejercicio del catálogo por nombre). El modelo de datos intacto en todo.

---

## Cerrado el 27-jul · Readiness descongelado — «¿Cómo llegas hoy?» vivía en el 16 de julio

Alex reportó «no lee sueño ni HRV» con el Apple Watch puesto. Causa raíz: el
snapshot diario de readiness solo se computaba la PRIMERA vez; después nada
volvía a computar un día nuevo, y la hoja enseñaba el último guardado como si
fuera hoy. El suyo nació el 16-jul en plena carrera con su primer sync (el
sueño entró 9 s DESPUÉS del compute, el HRV 80 s después) → 11 días congelado
en «FC 51 · resto sin dato» mientras los datos frescos dormían en
`biometric_streams`. **DESPLEGADO y verificado en prod con sus datos reales:
hoy 27-jul = sueño 5,2 h · HRV 45,3 vs base 40,3 · FC 51 → score 70.**

- El endpoint del atleta ahora computa y persiste HOY en cada lectura (fallback
  honesto al último snapshot si hoy no hay señal). Ingesta HealthKit y check-in
  recomputan antes de responder. Decisión: → `docs/DECISIONS.md` (27-jul).
- **De paso, dos agujeros gordos:** (1) ningún check-in de dispositivo ha
  llegado JAMÁS al servidor — los de Jordi/Marc del 9–22 jul fueron sembrados a
  mano (mismo `created_at`); el «Hecho · hoy» del sheet es estado local y el
  POST muere en silencio. (2) La RequestQueue del iOS era write-only: siete
  features encolaban «para replay» y nadie drenaba. Ya drena (FIFO, veneno 4xx
  fuera, TTL 72 h) — pendiente de que Alex reinstale la app.
- **Actualización (misma mañana):** el check-in de prueba de Alex SÍ entró
  (primero de un dispositivo en toda la historia; sub_score 0 → el servidor
  recalculó 70→50). Por qué los anteriores nunca llegaron ya no es
  reconstruible; la traza del 400 queda armada por si reaparece. Lo que Alex
  vio («no me cambia el readiness») era OTRA cosa: la app refrescaba el score
  en paralelo al POST y re-pintaba el viejo — arreglado (`94c42c0`, pendiente
  reinstalar).
- **Gap cerrado (misma tarde): «Cómo se encuentra», CONSTRUIDO y desplegado.**
  Mockup aprobado (`docs/design/como-se-encuentra-mockup.html`) → panel en la
  ficha › Plan bajo el tile de Readiness (5 preguntas espejadas del iOS con
  recuperación/energía ya giradas, nota literal, bandera adaptativa, racha de
  7 días con huecos honestos, frescura explícita) + chip «Check-in N» en el
  roster solo cuando el check-in de HOY (zona del atleta) baja de 40 — la
  MISMA banda que la regla adaptativa, una sola constante. Muere el endpoint
  huérfano `readiness-breakdown` (cero consumidores). Verificado vivo en
  local (Playwright, claro+oscuro, 390/768/1440) y con tests reales Neon.

---

## Cerrado el 27-jul · MARCAS — el atleta se prueba cuando quiere (DESPLEGADO web · iOS en verde)

Mockup: → `docs/design/marcas-atleta-mockup.html` · Decisión: → `docs/DECISIONS.md` (27-jul)

**La idea (Alex):** nadie sigue un plan al 100%. El día que el atleta se aburre o se lía, que haya una marca nueva en vez de un hueco de adherencia. Tres puertas, un almacén (`athlete_benchmarks`):

1. **Test del coach** → recalibra el plan (ya existía).
2. **Probarme** → 6 marcas que la app mide SOLA: 1 km, Cooper 12 min y 5K (GPS o cinta FTMS), remo 500/1.000 y ski 1.000 (PM5). Cero números tecleados; un abandono no guarda nada. Es un entreno libre de un bloque por el motor de siempre — el objetivo del HUD es tu PR («a batir»). NO recalibra: a Pablo le llega «marca nueva» (push a su PWA).
3. **Registrar** → la 10K/media/maratón de fuera: la actividad ya sincronizada del reloj en un toque (±4% de distancia) o fecha+tiempo a mano.

Reglas duras: catálogo cerrado · **un 5K en cinta jamás bate al de calle** (PR por contexto) · el gemelo de carrera (tu ski fresco vs tu split real, de `station_splits_json`).

**Estado:** mig **0139 APLICADA** (source/run_context/event_name tipadas; backfill honesto: 13 unknown + 5 athlete_test). Web DESPLEGADA y verificada (endpoints 401 sin bearer). iOS BUILD SUCCEEDED: `Marks/` (biblioteca, detalle, registrar), entrada en Perfil › Rendimiento y tarjeta «¿Te pruebas?» solo en días sin nada que hacer. 11 tests de dominio.

**Pendiente:** probar «Probarme» con hardware real (GPS + PM5). La suite de tests de iOS no compila por un test de CHAT de la otra sesión (su refactor en curso) — el target de app sí.

---

## Cerrado el 27-jul (2ª ronda) · Los adjuntos NO se veían en la app: el meta iba doble-codificado y iOS descartaba el mensaje entero

Tras la subida prefirmada (abajo), Alex seguía sin ver fotos "desde ningún
lado al otro" (6ª reincidencia). Reproducido E2E contra producción con bearer
real de atleta: subida ✓, blob ✓, proxy ✓ — pero `attachment_meta` se
guardaba como STRING JSON dentro del jsonb (`JSON.stringify` + postgres.js,
la misma enfermedad de `notifications.payload_json`; 12/12 filas históricas).
El dashboard lo toleraba; **el decode de iOS fallaba el mensaje ENTERO y el
descarte silencioso (@LossyArray / SSE nil) hacía desaparecer todo adjunto
de la app, en ambas direcciones** — por eso los 5 fixes de subida nunca lo
mataron. Arreglo: `client.json()` en el insert (`60638e6`, DESPLEGADO) +
migración **0140** de reparación en sitio (APLICADA; las 12 filas ya son
objetos). Verificado post-deploy: envío nuevo → jsonb object; mensajes de
prueba borrados; sin cambios en iOS → **no hace falta reinstalar la app**.
Footgun documentado en memoria; `mass-adjustments.ts` aún usa el idioma malo
(tablas vacías, latente). Deuda iOS anotada: el drop silencioso de mensajes
indecodificables y el "no enviado" sin motivo merecen endurecerse en el
próximo build.

---

## Cerrado el 27-jul · Adjuntos del chat arreglados de RAÍZ (subida directa prefirmada)

La foto de Alex seguía sin salir del iPhone. Causa raíz, probada contra
producción: **la plataforma corta el body de cualquier función en ~4.5 MB**
(`FUNCTION_PAYLOAD_TOO_LARGE`) antes de ejecutar una línea nuestra — y los
adjuntos viajaban `cliente → función → Blob`. El modelo prometía fotos de
30 MB y vídeos de 200 MB por una tubería que admite 4.5: mal desde la
concepción, no un bug puntual.

Arreglo (patrón estándar, cero servicios nuevos): el servidor valida y
**prefirma** una URL de subida (`issueSignedToken` + `presignUrl` del
`@vercel/blob` que ya usamos) atada a UN pathname, con tope de bytes y
caducidad; el cliente hace un **PUT plano directo al almacén**. Blob privado y
proxy autenticado de lectura, sin cambios. Muere la ruta multipart
(`/api/chat/upload`) y el fallback a disco de desarrollo. Nueva ruta:
`/api/chat/upload-url`; clientes web e iOS migrados (iOS ya instalado en el
iPhone de pruebas por cable).

Verificado E2E contra producción con un atleta desechable (borrado después):
foto de **27.7 MB** enviada desde el compositor del dashboard y servida entera
por el proxy (4200×3150), y **PUT de 120 MB** (tope vídeo) directo al almacén
en 12.6 s. El tope firmado se aplica (403 al pasarse), la URL cruda del blob
sigue siendo privada (403) y cada URL de subida es de un solo uso.

**Herencia del bug, pendiente de decisión de Alex:** auditados los 10 adjuntos
históricos contra el almacén — 9 son punteros muertos (mensajes 4-63, hilo 260;
los bytes nunca se guardaron, irrecuperables). ¿Se purgan esas burbujas?

También: el banner "Activar avisos" de /mensajes estrangulaba el texto a una
palabra por línea (fila única en columna de 300px) → texto a lo ancho y botón
debajo.

---

## Cerrado el 27-jul · El dashboard en el bolsillo del coach (PWA + avisos)

Ni Pablo ni Gerard van a vivir pegados al dashboard. Ahora **app.fahybrid.com
se instala como app** en su iPhone (Compartir → Añadir a pantalla de inicio),
con icono propio —el FHP con banda COACH, para no confundirla con la app del
atleta— y **avisos push de verdad**: mensaje de un atleta → notificación con su
nombre y el texto → tap → esa conversación abierta. Con contador de
conversaciones pendientes en el propio icono.

Cómo: manifest + service worker + Web Push (VAPID) por el MISMO embudo que ya
usaba el push del atleta (`dispatchNotification`), así que citas, leads o bajas
pueden avisar mañana sin trabajo por-trigger. Se activa desde /mensajes o
/ajustes; migración **0138** (suscripciones por navegador) aplicada.

Lo que salió al verificar EN PRODUCCIÓN (todo anterior a hoy, todo arreglado):

- **Los avisos "al coach" iban a un usuario con el que nadie inicia sesión**
  (`coaches.user_id` legacy, no los miembros de `coach_members`). Ni push ni
  bandeja llegaban a nadie. Ahora se reparte a todos los miembros activos.
- **En móvil no se podía responder:** el compositor quedaba DEBAJO de la barra
  de pestañas (el alto solo restaba la cabecera). Token `--v2-tabbar-h`.
- **En móvil la lista de conversaciones era inalcanzable:** se auto-abría el
  primer hilo sin ninguna flecha de volver. Ahora se aterriza en la lista y el
  hilo tiene volver; el hilo tapado ya no marca mensajes como leídos.
- El filo de medianoche: la lista decidía "hoy/ayer" en la zona del servidor
  (UTC), no en Madrid.

Verificado E2E contra producción con un atleta desechable (luego borrado): el
push sale de la instancia desplegada, FCM lo entrega, el navegador lo pinta y
el deeplink aterriza en el hilo. 390/768/1440 sin desbordes. Pendiente de
Alex: apagar la verificación de dispositivo de Clerk (ajuste de su dashboard)
y, cuando la app del atleta llegue a TestFlight, provisionar APNS en Vercel
(hoy `apns_configured: false` — el push del atleta nunca ha podido salir).

**Deuda anotada (pre-existente, vista de pasada):** `notifications.payload_json`
guarda el payload doble-codificado (un string JSON dentro del jsonb, por el
`JSON.stringify` + serialización de postgres.js en `dispatchNotification`).
`->>'campo'` no funciona sobre esas filas. Arreglarlo exige tocar a la vez el
insert y a TODOS los lectores (bandeja iOS incluida) — no de pasada.

---

## Cerrado el 26-jul · El chat, rehecho

Estaba roto de una forma que se veía poco y dolía mucho: había que recargar para
ver la conversación y los adjuntos no iban. La causa no era ninguna de esas dos
cosas — eran **dos sistemas de chat distintos**, el de iOS (con tiempo real y
adjuntos) y el del dashboard (texto plano y sin nada). Se borra el duplicado.

Lo que salió al mirarlo de cerca, todo anterior a hoy:

- **Los adjuntos no se han podido abrir NUNCA.** El proxy redirigía usando
  `getDownloadUrl(pathname)`, que es síncrona, espera una URL y no acepta token:
  lanzaba "Invalid URL", el `catch` la mandaba al disco local y salía un 404.
  Comprobado contra el blob de producción, no supuesto.
- **El último mensaje jamás se marcaba como leído.** postgres.js recorta a
  milisegundos los `timestamptz` que van como parámetro; con el corte recortado
  hacia abajo, el propio mensaje del corte se caía del `<=`. Y paginar hacia atrás
  se saltaba mensajes por lo mismo. El cursor pasa a ser un id.
- **Un mensaje del coach desde /mensajes no llegaba al móvil** hasta que el
  atleta reabría la pantalla: ese camino no publicaba al canal en vivo.
- **El primer mensaje de un atleta nuevo no llegaba a nadie**: el canal se
  suscribía a una lista de hilos congelada al conectar, y ese hilo nace después.

Ahora: una sola conexión en vivo por pantalla, foto/vídeo/voz/archivo en los dos
sentidos (con vista previa antes de enviar, pegar del portapapeles y grabación de
voz en WAV para que suene también en iOS), acuse de lectura de verdad y la lista
de conversaciones al día sin recargar.

Verificado en local contra datos reales y una rama de Neon: envío, recepción sin
tocar la página, adjunto de ida y vuelta byte a byte, `Range` para vídeo, 390/768/1440
sin desbordes y consola limpia. 1560 tests en verde. Desplegado (31abbae).

Migraciones aplicadas a producción: **0136** (mía, `sender_role` obligatorio) y
**0137** (de la otra sesión — su código ya estaba committeado consultando
`baja_scheduled_for` y sin la columna cualquier deploy de la rama dejaba el ciclo
de vida del atleta en 500).

**Pendiente que dejo anotado:** una clave de idempotencia por mensaje
(`client_msg_id`) para que un reintento de envío no pueda duplicar. Se hace
cuando se toque el envío de iOS, y entonces en web e iOS a la vez — adoptarla
solo en un lado recrearía la asimetría que acabamos de quitar. Ver
`docs/DECISIONS.md`.

---

## Acaba de cerrarse (25-jul)

- **El sistema en seis capas** — las seis decisiones que componen un plan, y en cada una qué fija el sistema y qué elige el coach. → `docs/methodology/sistema-seis-capas.html`
- **Batería de pruebas** — 4 pruebas (5K, remo 2K, 1RM, media simulación). Ya construida y funcionando en producto. → `docs/methodology/test-battery-reference.html`
- **Modelo de fases** — Base → Potencia → Ritmo → Pico → Desconexión. 13–19 semanas. Sin entidad de fase en schema (respeta la decisión de la migración 0064). → `docs/methodology/modelo-de-fases.html`
- **Reglas de progresión y ajuste** — progresión semanal, fuerza por RIR, bandas de readiness (67/45), límites de seguridad y reincorporación. → `docs/methodology/reglas-de-progresion.html`
- **Formatos y cargas de HYROX** — cargas oficiales por división verificadas contra el reglamento 25/26 y 26/27, y qué implica cada formato para el entrenamiento. → `docs/design/formatos-y-cargas-hyrox.html`

---

- **Derivación desde la carrera** — el origen: las 7 exigencias del evento y qué se entrena por cada una. Regla: un tipo solo existe si traza hasta una exigencia. → `docs/methodology/derivacion-desde-la-carrera.html`
- **Los 16 tipos de sesión** — derivados de las 7 exigencias, cada uno con su sesión de ejemplo completamente especificada. → `docs/methodology/catalogo-tipos-sesion.html`
- **La semana** — 6 días de 2-3 bloques. Base 8h30 · Potencia 8h35 · Ritmo 7h25 · Pico 3h40. → `docs/methodology/la-semana.html`
- **Comparativa a 5 semanas de competir** — nosotros contra el Excel y contra TrainingPeaks, misma fase. → `docs/methodology/comparativa-semana.html`
- **EL MANUAL** — todo lo anterior navegable en una sola página, pensado para que un entrenador nuevo entienda cómo trabajamos. También publicado en `web/public/metodo.html`. → `docs/methodology/manual.html`
- **`time_cap`** — objetivo nuevo de prescripción: un reloj a batir en vez de una intensidad. Es lo que hace prescribible la roxzone. Cero migraciones (vive en `prescription_json`). 11 tests.

### Contraste contra fuentes externas (transcripciones de YouTube, 25-jul)

Fuente: `~/Public/projects/health-planning/coach-methodology/sources/youtube` (16 ficheros). Se usaron **solo para buscar contradicciones**, nunca como contenido — el riesgo era derivar hacia "lo que hace todo el mundo".

Lo que cambió a raíz del contraste:
- **Tipo 16 añadido** (velocidad y potencia). Faltaba: las series cortas son ritmo submáximo y la fuerza máxima son 1-5 repes; ninguno entrena producir fuerza *rápido*. Dos creadores independientes convergen.
- **Jerarquía codificada en la semana**: el aeróbico manda porque manda en la prueba. Antes el catálogo era un menú plano que permitía una semana 50/50.
- **Sim completa fuera de Pico** → al final de Ritmo. Meter un esfuerzo máximo de 70 min en la descarga contradice el único consenso unánime.
- **Techo de 150 m de sled por sesión**, calentamiento incluido; push y pull separados desde Ritmo.

Lo que se confirmó bien: nuestro modelo de dos anclas (tempo 4:32 vs ritmo de carrera 5:07) es más fino que la simplificación de las fuentes; nuestras reglas de HRV son más estrictas que el contenido popular; y **ninguna de las 11 fuentes de HYROX menciona la roxzone como entrenable** — ahí vamos por delante.

Aviso de calibración: 6 de los 11 vídeos de HYROX son del mismo creador, así que lo que parece consenso es una voz repetida.

### Cierre del 26-jul

- **19 tipos de sesión** (eran 16). Nuevos: sled a sobrecarga, máximo en tiempo fijo y fuerza de tren superior. La **movilidad queda fuera a propósito**: no traza a ninguna exigencia, es bloque dentro de otras sesiones.
- **Dos datos corregidos, los dos míos:** la zona 2 salía de 220−edad y el sistema usa Tanaka (banda real 119-138 ppm); y el sled como 117% de la sentadilla era el mejor caso — es 126% en single Pro, 136% en mujer Open y 145% en hombre de 52.
- **`time_cap` cerrado en web e iOS.** En iOS caía en el `default` y llegaba al atleta como `.unknown`: el objetivo desaparecía sin aviso. Build en verde, 675 tests.
- **La analítica de roxzone NO se construye todavía.** El lado carrera tiene datos (`roxzone_seconds` desde la 0054); el lado entreno tiene **cero filas**, porque `time_cap` acaba de nacer y ningún coach lo ha usado. No hay hueco de esquema: es de adopción. El editor V2 ya ofrece «Tiempo tope» en un ítem de circuito — en cuanto Pablo prescriba una línea así y alguien la ejecute, habrá qué comparar.
- **FCmáx: no hace falta test nuevo.** El pico de carrera llega al 99% de la FCmáx de laboratorio y lo produce wall balls, la última estación. Tres enmiendas de coste cero: esprint final explícito en 5K y remo, registrar el pulso de wall balls en la media simulación como campo propio, y banda de pecho obligatoria en esos tests (el óptico de muñeca falla justo en remo y wall balls).

**Pendiente de decisión (tuyo):**
1. El método es **ciego a la edad**. Para un atleta de 52: bajar compromised running a 1/semana, descarga cada 2-3 en vez de 3-4, y 72 h entre días duros en vez de 48.
2. Las 8h30 de Base son iguales para todos. Sin resolver si un single Pro necesita más.
3. El atleta de dobles entrena el 100% del volumen de estación en solitario, que no es lo que hará en carrera.

---

## Lo siguiente

1. Que Pablo revise la metodología y corrija lo que no le encaje. Su trabajo es **corregir, no crear**.
2. Los nombres de las fases son decisión de Alex — pendientes de visto bueno.
3. Decidir si la metodología pasa a ser contenido editable en el dashboard o se queda como documento de referencia.

---

## DESPLEGADO EN PRODUCCIÓN (26-jul)

La rama `feat/zepp-app` está en producción, commit `02db046`. Los endpoints de relojes ya responden en fahybrid.com Y app.fahybrid.com: `/api/athlete/wearables/garmin/today|workout|workouts` (401 sin bearer) y `/api/coros/status` (200, la URL que declaramos a COROS). Smoke OK, nada roto.

⚠️ **`fahybrik-demo` YA NO EXISTE.** Un solo proyecto Vercel, `fahybrik-web` (`prj_9Fj582l8dFSGZ2MeC8K1xlGYFVde`), sirve los dos dominios. El id de demo que arrastraban las memorias da `Project not found` y hacía fallar el primer intento de deploy de cada sesión. Corregido en memoria: ver `reference_deploy_produccion`.

## Cerrado el 26-jul · TESTS — el coach ya puede ponerlos

Mockup: → `docs/design/tests-aplicar-a-atletas-mockup.html`

**El fallo, verificado contra producción:** la batería estaba bien configurada (4 tests, todos en semana 1) y **no había llegado nunca a ningún atleta** — cero sesiones de test con 7 atletas activos. Un test solo entraba en un plan al materializar el **primer** plan del atleta, y los 7 ya tenían plan. Y aplicar a mano no existía: el atleta podía lanzarse un test desde el móvil, el coach no podía ponérselo.

**Construido:**
- **Aplicar** desde Método › Tests: un test → varios atletas → un día, con «todos» y «los que no lo han hecho nunca», el «último: hace 3 meses» junto a cada nombre, re-test opcional y aviso si le cae encima de otra sesión.
- **Programar test** desde la ficha del atleta: un atleta → un test. Donde Pablo buscaba y no había nada.
- **Columna «Puesto a»** en la biblioteca. Su ausencia es lo que dejó que una batería que no llegaba a nadie se viera igual que una que funciona.
- **Panel de tests en la ficha** (Perfil, bajo Fuerza · 1RM), con **«Falta el resultado»** en ámbar: un test entrenado y sin número no recalculó nada.
- DRY: `materializeTestForAthlete` — los tres caminos (semana 1, «Probarme» del atleta, «Aplicar» del coach) pasan por ahí.
- Muere el botón «Programar re-test» de Perfil, que era un dashed que no hacía nada.

**Pendiente:** que Pablo lo use y ver si el reparto semana/día automático sigue teniendo sentido ahora que puede aplicarlos a mano.

**Nota sobre los 1RM:** se guardan bien (`athlete_strength_maxes`) y el coach los ve en la ficha › Perfil › «Fuerza · 1RM». Lo que NO hay es señal de que se los haya puesto el atleta: la columna `needs_review` existe y no la lee nadie, así que un 1RM autodeclarado llega idéntico a uno medido por el coach.

---

## Hilo abierto: PAUSAS Y BAJAS — el atleta se gestiona solo (26-jul)

Mockup de las pantallas: → `docs/design/bajas-y-pausas-mockup.html`

**El planteamiento (Alex):** se entra por entrevista y se paga por un link de Stripe, así que la app no vende nada. Pero salir no puede depender de que alguien llame: **si quiere pausar o cancelar, que lo haga él**. Pablo se entera, no autoriza.

**Decidido:** la pausa **para el cobro**, con tope de 4 semanas en 12 meses móviles. Agotado el tope no se bloquea: se le ofrece congelar pagando o darse de baja.

### CONSTRUIDO (26-jul) — falta aplicar la migración y desplegar

- **Presupuesto de pausa** — `shared/domain/coach/pause-budget.ts`. 28 días en ventana móvil de 365. Cuenta días vividos, no pedidos: volver antes los devuelve. Puro, 13 tests.
- **Baja programada** — migración **0137** (`baja_scheduled_for`). El atleta se queda `activo` y entrena hasta el fin del periodo pagado; el cron la aplica ese día; hasta entonces se cancela con un botón.
- **Autoservicio** — `web/lib/athlete/lifecycle-self-service.ts` + `/api/athlete/lifecycle{,/pause,/resume,/baja}`. Sin confirmación del coach.
- **Cron de ciclo de vida** — `/api/cron/lifecycle`, diario 05:30 UTC. Arregla un fallo que ya estaba en producción: **nadie miraba la fecha de vuelta de una pausa**.
- **Aviso a Pablo por correo** — `web/lib/athlete/lifecycle-coach-alerts.ts`. Pausa y baja mandan correo; la vuelta no (rutina). Motivo: `notifyCoach()` escribe en `notifications` y empuja por APNs, pero Pablo está en la web y **ningún componente lee esa tabla** — ese canal hoy no llega a nadie.
- **iOS** — `Profile/LifecycleService.swift`, `Profile/LifecycleSheets.swift`, `Subscription/SubscriptionView.swift`. Seis estados. BUILD SUCCEEDED, 675 tests.
- **Cambio de comportamiento:** pausar **deja de liberar la plaza** a la lista de espera. `capacity.ts` cuenta `activo` + `pausado`. El test que decía lo contrario, actualizado.

**Dónde lo ve Pablo** — corregido el 26-jul: *"los coaches no miran el correo para ver cosas de sus atletas, lo miran en sus fichas"*.
- **Ficha:** banner de **baja programada** con el margen que queda y los días de pausa que le sobran. Era el único estado invisible — el atleta sigue activo y entrenando, así que sin banner la ficha enseñaba normalidad de alguien que se va en tres semanas.
- **Roster:** badge **«Se va»** en rojo, fila SIN atenuar, y primero en el orden por estado.
- El correo se queda como empujón, pero ya no es el canal.

**Corregido un fallo mío:** el diálogo del coach guarda en `athlete_pauses.end_date` el día que **vuelve** ("Vuelve el") y yo escribía el último día de pausa. Gana el significado que ya estaba en los datos: el presupuesto cuenta `[inicio, vuelta)` y el cron reanuda con `<=`. Con mi versión cada pausa cobraba un día de más y la vuelta llegaba un día tarde.

**Pendiente:**
1. **Desplegar.** La 0137 ya está aplicada en producción (la aplicó la otra sesión: mi código ya consultaba `baja_scheduled_for` y sin la columna cualquier deploy dejaba el ciclo de vida en 500).
2. **Las tarjetas en la cola de HOY** (pausa · baja · vuelve mañana). Ahora que la ficha y el roster lo cubren, es menos urgente.
3. El endpoint viejo `/api/athlete/pause-request` sigue vivo (solicitud → confirma el coach). No estorba, pero sobra en cuanto se confirme que nadie lo usa.

---

## Hilo paralelo: RELOJES — el entreno en la muñeca (prioridad máxima, 25-jul)

Registro vivo, visual: → `docs/design/relojes-entreno-en-la-muneca.html`
Mockup de las apps de reloj (Garmin + Amazfit, antes/durante/sincronización): → `docs/design/relojes-apps-mockup.html`
Pantalla de conexiones, comparada con TrainingPeaks: → `docs/design/conexiones-dispositivos-mockup.html`

**HUECO ABIERTO — sincronía reloj↔móvil.** Con Garmin, `System.exitTo()` cierra nuestra app CIQ y arranca el reproductor nativo: el iPhone NO se entera de que el atleta está corriendo, y el entreno sigue diciendo "empezar" durante toda la sesión. Al terminar sí se cierra solo (HealthKit → `ingest-healthkit.ts` casa por día y marca hecho; `existsOverlappingExecution` impide el duplicado si le dio a los dos). **Fix propuesto, no implementado:** el `.FIT` lo sirve NUESTRO endpoint, así que la descarga es una señal real — marcar el assignment "en el reloj" ahí y que el iPhone muestre "lo estás haciendo en tu Garmin" en vez de ofrecer empezar. Amazfit no tiene el problema (no puede arrancar entrenos). Apple Watch tampoco (mirroring nativo).

**Premisa de Alex:** máxima conectividad. Que el entreno llegue al reloj siempre que se pueda, y donde no (Polar), que la app lea del dispositivo todo lo posible.

**El diseño:** una estructura canónica + un codificador por marca. Dos reglas de dominio que no se negocian: las zonas viajan como banda ABSOLUTA (la Z4 de un Garmin sale de otra FCmáx), y lo que el reloj no puede vigilar (RPE) va como tramo abierto, nunca como objetivo inventado. Fuerza/EMOM/AMRAP quedan fuera a propósito: ningún formato de fabricante los modela.

**Construido y en la rama:** modelo neutro · codificador .FIT de Garmin + endpoints · guías de Suunto (44 tests) · WorkoutKit para Apple Watch · app Connect IQ (`garmin-ciq/`, sin compilar aún) · dos bugs de Zepp que impedían entrar y ver el día · el permiso de Salud del onboarding que no arrancaba la sync.

**Puede empujarse el entreno a:** Apple (nativo, sin permisos), Garmin (vía Connect IQ, NO depende de la API parada), Suunto (spec pública), COROS (solicitud enviada 25-jul). Polar es solo lectura. Wear OS y Fitbit están muertos para iPhone.

**Lo siguiente:**
1. ~~Los 65 segmentos~~ HECHO: `RUN_CONVERTIBLE_SCHEMES` explícito (endurance + rounds + sets/warmup/cooldown, fuera los metcon de verdad) y `collectRunStructures` ya filtra por modalidad — sin eso, 121 segmentos de bici/remo/ski/movilidad se convertían en "carrera". **Producción: 1 → 78 → 112 de 143 segmentos, 48 sesiones, 16 asignadas.**
2. ~~El filtro del Apple Watch~~ HECHO 26-jul (`483db64`): el criterio ya no es «un solo ejercicio» sino «el trabajo principal es correr» — acompañan movilidad, estiramiento y el trote plano del calentamiento; trineo, ergo o fuerza dejan la sesión en nuestra app. 5 tests nuevos + guarda-raíl del andamiaje (`WorkoutBlock.title`/`format` con null descartaban el bloque en silencio). 27 tests del mapper en verde.
3. ~~Bug de `hr_zone`~~ HECHO: `resolveSegmentBand` solo resuelve `pace_zone`; una zona de pulso ya no sale como banda de ritmo. Test que falla si se reintroduce.
4. Dejar vivos `/api/coros/webhook` y `/api/coros/status`, declarados en la solicitud a COROS.
5. ~~Compilar `garmin-ciq/`~~ HECHO 25-jul: SDK 9.2.0 + OpenJDK instalados, clave de firma en `~/.garmin/` (fuera del repo), y BUILD SUCCESSFUL en 12 dispositivos de las 6 familias. Y PROBADA en el simulador (Forerunner 165 virtual): arranca y pide vincular la cuenta, que es el primer estado correcto. Falta el reloj físico para el guiado, que Garmin no simula. Capturas bloqueadas: macOS deniega screencapture a la terminal sin permiso de Grabación de pantalla.

**Solicitudes ENVIADAS el 25-jul:** COROS (sin plazo publicado; pendiente el correo a api@coros.com preguntando si el push de entrenos entra en el tier estándar) y Suunto (responden en dos semanas; pedimos Cloud API + apps de reloj, y van alex@ y hello@ como desarrolladores porque dan una app por correo).

**Migración 0135 APLICADA** (26-jul, con OK de Alex): `suunto` y `amazfit` en `biometric_source`, y además `suunto`/`amazfit`/`polar`/`coros` en `device_type`. Verificado leyendo pg_enum en producción. Ojo: el dry-run destapó que 0134 (rondas EMOM, de otra sesión) también estaba pendiente y entró antes.

**Pendiente de Alex:** solo el modelo del Garmin que llegue la semana que viene.

**CUANDO COROS ACEPTE — los 4 pasos.** El OAuth está TODO construido (connect/callback/webhook/status, `lib/coros/config.ts`). Entonces: (1) meter `COROS_CLIENT_ID`/`SECRET` en env y deja de responder 503; (2) implementar `lib/sync/ingest-coros.ts`, hoy stub vacío a propósito — su esquema vive en la API Reference Guide privada que solo entregan tras aprobar; el propio fichero documenta cómo, espejando `ingest-garmin.ts` (idempotencia por external_id, mapeo de modalidad); (3) registrar el webhook con ellos; (4) probar con el Kiprun de Gerard. El PUSH de entrenos depende de la respuesta al correo a api@coros.com (¿tier estándar o acuerdo aparte?) — ese correo es lo que más desatasca.

**Hardware de pruebas.** El **Kiprun by Coros** de Gerard vale como COROS de pleno derecho: se empareja con la app COROS, el firmware lo hace COROS y su Help Center lo trata como reloj propio (secciones y release notes de KIPRUN GPS 500/900). CONFIRMADO por Alex que el de Gerard es "by Coros". Límites del Kiprun: no traga Strength ni objetivos de Effort Pace/Power, así que cubre el carril de correr entero pero no las estaciones. Único riesgo sin confirmar: que la API de partner devuelva sus actividades idénticas a las de un COROS de marca (inferencia fuerte, no fuente oficial, porque COROS no publica docs). Para Garmin: Forerunner 165 de 2ª mano, 145-170 €.

**COROS TAMBIÉN entra hoy por Apple Salud**, sin esperar su aprobación: COROS App › Perfil › Ajustes › 3rd Party Apps › Data Sync › Apple Health (support.coros.com/hc/en-us/articles/360041549551). Como nuestra ingesta de HealthKit no filtra por app de origen, los entrenos del Kiprun de Gerard llegarían igual que los de un Apple Watch. Eso permite probar la mitad de la integración HOY y gratis; la API de partner solo hace falta para MANDARLE el plan al reloj y para tener atribución/laps propios.

**Amazfit ya entra hoy** por Apple Salud (la app Zepp sincroniza ahí y nuestra ingesta de HealthKit no filtra por app de origen). El ingest directo de Huami sigue stub: su api-doc.html devuelve 404 y developer.zepp.com es marketing. Es un MEJOR (atribución, laps), no un NECESARIO.

---

## Pendiente de decisión

- **Nombres de las fases** (Base / Potencia / Ritmo / Pico / Desconexión) — subjetivo, decide Alex.
- **Reparto de participantes por división en HYROX** — no es dato público y las fuentes que circulan se contradicen. Existe un estudio de la Universidad de Granada (278.063 atletas) que probablemente lo tiene, de pago. Decidir si se compra antes de fijar estrategia por segmento.
- **Nutrición** — fuera de alcance por ahora. Se retoma después del lanzamiento.

---

## Contexto que no está en el código

- La marca es **FAHYBRID** (con D). `FAHYBRIK` es solo el nombre heredado del repo, Vercel y Neon.
- Los tres perfiles de atleta que esperamos: **dobles Open**, **dobles Pro** y **single Pro**. El grueso será dobles; el single Pro es la punta que da credibilidad.
- Competencia directa: TrainingPeaks, comprado por Garmin el 22-jul-2026. Nadie en el mercado diferencia metodología por división.

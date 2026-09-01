# FOCUS — FAHYBRID

Estado vivo del proyecto. Se actualiza en el mismo commit que el trabajo.
Última actualización: **2026-09-01**

---

## En qué estamos ahora

**FH-48 (este lote):** Verify KO en `main` `a901a311` — `HKWorkoutSession(healthStore:configuration:)` es iOS 26 y el deploy es 18. Crear en 18 con `init(configuration:)` (Apple, deprecado en la clase iOS 17+). Recover / Live builder / `init(healthStore:)` siguen detrás de `#available(iOS 26)`. Reloj = `startDate` + pausas. Disco igual. No el split de builders de PR 100.

**FH-53 (en main / prod):** unique `(execution_id, position)` restaurado (0149). No mezclar con FH-48.

**En main · FH-41 (PR #99):** N × distancia + descanso en PM5 ya no es CSAFE type 7. `PM5WorkoutProgrammer` manda un bout `fixedDistance` (o time/cal). `monitorRunsTheSeries` es false; la app sigue siendo el reloj; la clave de tramo no cambia en el descanso. Pendiente de soak: live + SkiErg PM5 + N × distancia + descanso (el monitor debe mostrar 0…N m de ESA serie).

**Que el software sea de verdad multi-coach.** Alex, el 29-jul: *«al final esto derivará a FLEXR, este código, y lo venderemos a otros coaches. Pablo es nuestro coach, no es "el coach". Habrán con suerte miles de coaches.»* Es la **HARD RULE Nº0** de `CLAUDE.md`, y la línea es: **MECANISMO en código** (cómo se calcula un TSS, cómo se detectan los tramos, cómo se resuelve un ancla) · **MÉTODO en dato editable** (dónde cortan las zonas, los pesos del readiness, los umbrales de veredicto). La pregunta que decide cada caso: *¿otro entrenador competente lo haría distinto?*

**ATR está fuera, del todo** (migración 0148 aplicada en producción, con el código desplegado antes). Sobrevivió a las limpiezas de 0064/0068 porque **la columna viva no se llamaba `atr_` sino `target_block`**: una metodología se barre por semántica, nunca por su sigla. De paso caían «Listo para TRANS» en la cola de HOY, las anotaciones del gráfico de VO₂máx, un HTML público y **el propio `CLAUDE.md`**, que enseñaba ATR a todo agente que arrancara.

**El nombre del coach ya sale de la base** en las push, los correos de cita y de lead y los `.ics`. Y **un lead se graba con su dueño en la captura** (0147): NULL significa «sin asignar», nunca «el coach por defecto».

**En curso / lo siguiente:** las cuatro vistas en vivo que faltan en Swift (ergo, For Time, AMRAP, dobles) y el reloj · llevar a Swift las pantallas aprobadas del doble · cablear `coach_methodology`, que tiene 37 columnas, 0 filas y 1 sola lectura.

**Esperan decisión de Alex:** si guardamos la serie de ritmo (`execution_streams`) · el identificador de coach en el enlace público de captura · las tres filas «Pablo Amigo» (60/61/62) con los atletas repartidos · el modelo de las 5 estaciones de HYROX · borrar o revivir `methodology_blocks`/`methodology_rules` (motor muerto cuya forma sigue siendo un catálogo de fases) · la firma de distribución, que bloquea TestFlight.

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

## PENDIENTE de diseño · el Apple Watch, bloque propio (28-jul)

Alex: «el Apple Watch de momento tenemos que mejorar mucho, NO lo programes
ahora, pero la UI es muy pobre, muy pequeña, debemos trabajarla muchísimo».
**No tocar todavía.** Va después de las pantallas del móvil, como bloque
aparte, porque es otro problema de diseño: 40 mm a distancia de brazo, en
movimiento y sudando — ahí el sujeto es casi lo único que cabe y el resto
debería ser una segunda página, no letra pequeña alrededor.

Hallazgo al mirarlo (no perderlo): **avanzar de ronda desde la muñeca YA
funciona.** El canal de vuelta existe (`PhoneMirrorService.applyCommand`,
`MirrorWire.CommandKind.advance`) y está bien enrutado, incluido el relevo
de dobles (no apunta el trabajo de la pareja al atleta). El principio de
`LiveFlowView` también es el correcto: un botón grande que avanza todo,
cero navegación durante el esfuerzo. Lo que falta es la ejecución visual,
no la capacidad.

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

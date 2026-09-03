# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-03** (build 53: FH-69 recablea BloquesDelEntreno)

## Ahora

**Versión visible in-app (Guidelines §7):** `AppBundleMetadata` lee
`CFBundleShortVersionString` + `CFBundleVersion` con
`Bundle.main.object(forInfoDictionaryKey:)`. Perfil (iPhone) y el footer idle
del reloj muestran marketing + build. Build **53** iPhone, Watch y widgets.
`DEVELOPMENT_TEAM` = `S6W4459DDG` (no se toca).

**FH-69 · VER EL ENTRENO ENTERO MIENTRAS ENTRENAS.** La hoja
(`BloquesDelEntreno`) y el motor (`WorkoutSession+Bloques`) seguían
compilando; el unify de PR 113 soltó el presentador (`mostrarBloques` /
sheet / botón). Recableada la misma hoja en `ActiveWorkoutView` y el
mismo botón en `topStrip`, calle, cinta y puerta. No se mergeó ninguna
`cursor/*`. Fuera de este pico: `SiguienteTramoChip` / `BlockIntervalStrip`
en el HUD de carrera. Ticket:
https://app.notion.com/p/3d04164765c181b89898c0e8da4b041b

**Tipos de Workout recortados (unify):** el unify de main se quedó con los
callers de feat y con `SetRecord` / `SetExecutionDTO` / `LapRecord` /
`SegmentExecutionDTO` / `EmomInterval` de un main viejo. El reloj no
compilaba (`reps_source`, `repsSource`, velocidad, `hrSource`, `isErg`).
Restaurados desde feat `d90fc597`, con defaults para snapshots viejos. No
se tocan pantallas. No se inventa skip-serie. Sin instalar. CoS en Xcode Cloud.

**132 · COMPARTIR EL ENTRENO — construido en iOS, pendiente de probar en el móvil.**
Mockup aprobado en el doble (`/es/design/compartir-entreno`, 5 escenarios) y
portado a Swift: `ios/FAHYBRIK/Compartir/` (modelo+recorte a dos pasadas,
builders desde sesión/plan/semana, vista 1:1 con el doble, servicio y hoja).
Tres entradas: resumen post-entreno (sustituye al ShareLink viejo), la previa
del brief, y la cabecera del Plan (semana). Se exporta PNG-pegatina transparente
(tarjeta sola, 1400 px) — el vídeo lo pone el atleta en Instagram. Marca del
club = ELECCIÓN DEL ATLETA (conmutador, con club por defecto, persistido).
Contrato de Instagram verificado contra la doc de Meta: pegatina por
portapapeles + `instagram-stories://share?source_application=<APP_ID>`;
**el App ID de Meta lo tiene que crear Alex** (Info.plist `MetaAppID`, hoy
vacío → solo hoja del sistema; al rellenarlo aparece el botón directo).
1.656 pruebas en verde (8 nuevas del recorte/builders). SIN instalar en su
iPhone. OJO: `xcodegen generate` regeneró `project.pbxproj`, que estaba
modificado sin commitear por otra sesión.
Card: https://app.clickup.com/t/86ak4x2cz

**157 · UN ENTRENO, UN FINAL — el reloj y el móvil dejan de ir por su cuenta.**
Acabar en el móvil obligaba a acabar OTRA VEZ en el reloj (y al revés). Raíz: en
el reloj vive una app de entreno completa (`WatchWorkoutCoordinator`) con su
cronómetro, su grabación de Salud, su resumen y su envío al servidor — dos dueños
del mismo entreno, ninguno mandando. De ahí los duplicados y los «completado»
falsos.

Ahora: `MirrorEnded` lleva `reason` (`MirrorWire.EndReason`). Solo `athlete`
propaga — un final humano en la muñeca cierra el motor del móvil
(`wristFinishedByAthlete` → `WorkoutContainer`). El autocierre por perder señal
manda `watchdog` y NO termina nada: era eso lo que costaba el entreno al salir a
descansar entre bloques. Y el móvil manda `WatchWireKeys.liveEnd` por
WatchConnectivity SIEMPRE, con espejo o sin él, para alcanzar al reloj cuando iba
por libre → `finishFromPhone()`: guarda su HKWorkout en Salud, vuelve a reposo,
NO manda ejecución (la manda el móvil, que es el dueño).

Compilan iOS y watchOS; 1.648 pruebas en verde. **Esto NO se prueba con pruebas:
son dos aparatos, se comprueba entrenando.** Sin instalar en su iPhone.
Card: https://app.clickup.com/t/86ak56898

**158 · EL ENTRENADOR PUEDE CAMBIAR EL TIPO DE UN BLOQUE.**
El chip junto al nombre ya no es un adorno: es el mismo selector que al añadir (calentamiento, fuerza, circuito, carrera…). Los ejercicios y la dosis se quedan. Grok.
Card: https://app.clickup.com/t/86ak56had

**156 · UN CALENTAMIENTO SE VEÍA COMO FUERZA.**
El martes de la semana 1 ya era `format: warmup`. El editor no lo pintaba (sin chip, color del primer ejercicio = fuerza) y `create_microcycle` no tenía título de sesión: el asistente pegó el nombre del entreno en el primer bloque y la plataforma lo copió como título. Cada día lleva `title` (como `create_session`); el editor reconoce calentamiento/vuelta. Los títulos ya guardados no se reescriben.
Ley: DECISIONS 24-ago. Card: https://app.clickup.com/t/86ak5675p

**130 · OBJETIVOS RELATIVOS A LAS MARCAS DEL ATLETA — pieza 1 de 4 hecha.**
Es la raíz de la card 128: sin esto, una plantilla con kilos absolutos no sirve
para el atleta siguiente y hay que reescribir el ciclo por persona.
Ley: DECISIONS 23-ago «Un objetivo puede ser relativo a una marca del atleta».

Nuevo `Target.relative` con 4 referencias — `race_pace`, `threshold_pace`,
`competition_load` (por estación) y `bodyweight` — con porcentaje o delta en kg
(con banda) sobre las de CARGA. `shared/domain/prescription/reference.ts` (las
referencias + su frase en castellano) y `resolve-relative.ts` (la traducción a
número contra `AthleteBenchmarks` + `hyroxStationLoad` INYECTABLE, porque los
kilos son método del coach). 33 pruebas contra líneas LITERALES del macrociclo;
verificado en rojo (22 de 33 caen sin el kind en la unión).

Reglas que quedan cerradas: nada de `value/min/max` en el relativo (para eso está
`isScalarTarget()`); nada de carga cualitativa («media»/«ligera») — eso es
diccionario del coach, no tipo; nada de porcentaje sobre un ritmo (ambiguo); no
se duplica `percent_rm` ni `{kind:'bodyweight'}`.

**RIESGO ABIERTO, declarado:** el tipo existe pero **nadie lo resuelve al servir
el día**. El iOS instalado degrada un kind desconocido a `.unknown` y pinta el
objetivo EN BLANCO. No hay UI ni gramática que lo produzca (la exposición es una
llamada MCP deliberada), pero **la pieza 3 no es opcional**: resolver al leer y
mandar número + frase, con el número en el campo `target` de siempre.

Piezas 2-4 pendientes: tabla de cargas de competición del coach · resolver al
servir el día · gramática + diccionario.

**133 · Los límites de importar un ciclo (decidido, sin construir).** Contrato de
ENTREGA, nunca de contenido: unidad = tramo de 4-6 semanas, techo por
importación, propuesta revisable siempre, **umbral de cobertura para poder
confirmar**, y lo no tipado entra como nota declarada y jamás como prescripción a
medias. Criterio de vocabulario: una forma entra si sale en más de un coach o
muchas veces en uno; si sale una vez en 1.238 líneas es dialecto.
Ley: DECISIONS 23-ago. El umbral concreto se fija con cobertura real, no antes.

**129 · El catálogo, con los básicos que faltaban (EN PRODUCCIÓN, mig 0205).**
119 → 148 ejercicios. Faltaban curl de bíceps, encogimientos, remo invertido,
mountain climbers y buenos días, entre otros. Regla de Alex: **una fila es un
MOVIMIENTO, no una manera de hacerlo** — por eso las 51 líneas sin resolver del
macrociclo son 29 filas y no 51, y el salto al cajón a una pierna NO entra.
90 alias ES/EN, y anclado el falso positivo del puente de glúteo unilateral (que
resolvía al bilateral). Sigue: 0 de 148 con vídeo.

**128 · EL CICLO DE UN COACH, AUDITADO (sin código, solo diagnóstico).** Alex trajo
un macrociclo HYROX real de 12 semanas (84 días, 310 bloques, 1.238 líneas, 392
formas de línea, 209 movimientos). Informe: `docs/ciclo-de-un-coach.html`.

Diagnóstico raíz: **el modelo sabe decir un número; el ciclo dice «relativo a algo
que el atleta ya tiene»**. 130+ líneas piden ritmo HYROX / peso de competición /
carga media / ritmo del test, y `Target` solo admite absolutos + `percent_rm`. Es
un criterio EXPLÍCITO del coach («sin kilos concretos en las plantillas»), y es lo
que hace reutilizable una plantilla: requisito central de FLEXR, no de este JSON.
Media máquina ya existe y está DESCONECTADA: `methodology/zones.ts` resuelve
`race_pace`/umbral contra las marcas, y `hyrox/stations.ts` modela la carga de
competición por división/género devolviendo null a propósito. Nada de eso puede
aparecer en una prescripción.

Otros tres huecos: **por lado** (86 líneas → hoy texto en `note`, la analítica
cuenta la mitad) · **ámbito del descanso** (5 ámbitos, 2 alturas; `restBetweenRoundsS`
y `rest_between_stations_seconds` viven en DB+iOS pero NO en el tipo compartido:
viajan fuera del contrato) · **prioridad y sustitución del día** (47 esenciales,
31 de 84 con alternativa declarada: no hay campo).

Cabe SIN tablas nuevas: 4 tramos encadenados (5+4+2+1) = las 4 fases. Los 19
criterios son metodología, no calendario.

Catálogo: 126 ejercicios; de 209 movimientos, 112 existen, 35 solo necesitan alias,
**34 faltan** (164 apariciones, mitad pliometría). Fontanería que pesa más:
`exercise_aliases` (197 filas bilingües, índice trgm) **el importador NUNCA la lee**;
no hay fuzzy real; y «Puente de glúteo unilateral» resuelve con confianza al
BILATERAL existiendo el unilateral (falso positivo silencioso). 0 de 126 con vídeo.

Motor en vivo: `Measure.unknown` **desaparece de la pantalla sin decir nada**
(`Prescription.swift:333`) y un scheme desconocido degrada a `sets` sin avisar.

Importador de ciclo: no existe (solo `import_plan_html.ts`, atado a un coach y un
fichero). El camino bueno ya está un piso abajo en `web/lib/import/` +
`shared/domain/import/` («fiel o review», IA solo para lo denso): subirlo un piso.

Medida objetiva acordada: las 1.238 líneas como **corpus**, % tipado y fiel.
Orden propuesto: (1) objetivos relativos (2) por lado + descanso (3) prioridad y
sustitución (4) catálogo + alias (5) gramática (6) importador (7) motor.
**NO se ha tocado código, ni la base, ni ejercicios. Pendiente de OK de Alex.**

**111 · MCP receta de biblioteca (feat/mcp-microcycle-crud):** `create_microcycle` /
`update_microcycle` escriben SIEMPRE en receta (`program_*_templates`), nunca en
lo entregado. Completitud blocking; update resincroniza solo `scheduled`. V1
sin plan personal ni publicar.

**LA PRUEBA DE ALEX DEL 20-AGO — 8 cards, 7 cerradas.** Detalle en ClickUp 116
a 123 y en DECISIONS 20-ago; aquí solo el estado.

EN PRODUCCIÓN, sin instalar nada: **116** el guardado llevaba roto desde el
13-ago 07:11 (la mig 0191 dejó parcial el índice de la asignación y Postgres no
lo infiere desde `on conflict`: 42P10 en los CUATRO escritores; arreglado con la
0203, índice llano) · **117** una lectura de sensor fuera de banda ya no tumba el
POST entero, se encaja o se guarda hueco · **120** un libre reenviado es el mismo
entreno (llave: `started_at`) · **121** un entreno se archiva en el día en que se
HIZO. Los 5 libres del 19 mal archivados, movidos.

EN EL REPO, PENDIENTE DE QUE ALEX INSTALE: **119** el teléfono no leía los metros
que la muñeca lleva mandando siempre (en cinta tonta = cero metros y 0:00 de
ritmo); ahora los recoge y el podómetro se aparta mientras la muñeca emite ·
**123** la estación de correr se cierra sola al llegar a sus metros, como ya
hacían remo y ski, y la pantalla enseña la dosis y lo que falta (de paso:
`tramoRunCoveredMeters` prometía «cinta si la hay» y leía solo Apple, así que con
FTMS conectada no había cuenta atrás) · **121** la hora de fin se sella al
terminar, no al pulsar guardar · **118** correr DENTRO de una sesión ya no la
convierte en carrera (manda si se lleva más de la mitad del tiempo) y sin metros
medidos no hay lectura de carrera.

LA LECTURA DEL ENTRENO, DE MOCK A APP EN UNA NOCHE (118 → 124 → 126). Alex validó
la propuesta del doble («vamos a integrarlo») y está construida:
· **124** el contrato de UI gana suelo tipográfico (15 pt en iPhone, 16 en reloj) y
  contraste AA MEDIDO. Lo medido cambia el diagnóstico: el gris de apoyo pasa AA
  de sobra (6,5:1 / 5,6:1) — cuando un apoyo no se lee es el TAMAÑO, no el color.
· **126 pieza 1, EN PRODUCCIÓN** (6c05b34c, 34a95904, mig 0204): la sesión sabe sus
  totales. Se calculan al guardar en UN sitio (`session-totals.ts`) y viajan en el
  detalle. Escalera: traza de pulso → tramos ponderados por duración → nada.
  Distancia SOLO si una modalidad la midió: correr+remo no son metros de nada.
  Rellenado lo viejo: la sesión del 20-ago ya lee FC 115/149; 41 de 55 con pulso.
· **126 pieza 2, PENDIENTE DE INSTALAR** (d5aaedf6): las 7 capas en Swift,
  sustituyendo a la lectura genérica. Los totales se LEEN, no se recalculan.
  Tres degradaciones DECLARADAS por límites del cable: fuerza sin serie a serie
  (volumen = reps × carga máx), sin número de ronda (lista plana) y sin descanso
  medido. Cada una es card futura, no excusa. 1.621 tests.

EN DEBATE (20-ago, sin construir): **ciclos elásticos** — la secuencia se ancla
a la carrera del atleta y cada tramo declara mín/defecto/máx (dato del coach);
el ajustador reparte las semanas hacia atrás desde la fecha. Propuesta visual en
`docs/ciclos-elasticos.html`. Sin decisión de Alex todavía.

ABIERTO: **122** (el crono arranca con el toque y no con la primera zancada; la
cinta no detecta que se ha parado; no existe la transición — con decisión de Alex
dentro) · **125** barrido de letra pequeña y contraste en toda la app · **127** una
prueba ROJA preexistente (`totals_source` coalescea al revés de su comentario) y
una INESTABLE (`ComunicadosRenderTests` cae bajo carga, pasa sola). Y el duplicado
del 19 sigue en la base: borrarlo es dato del atleta.


**El reloj, auditado y arreglado (105, en trunk):** auditoría en 6 frentes
(ciclo de vida, running, cronómetros, inventario de las 17 vistas, estándares
de mercado). Cuatro arreglos: (1) cards 72+102 eran UNA raíz — `deliverEnd`
mandaba el cierre una vez sin ACK ni reintento y el auto-reparo de `start()`
solo cubría `.ending`; ahora reintenta hasta ACK, repara CUALQUIER estado
`!= .idle` y hay vigía de 5 min que autoguarda (45 s cortaba entrenos reales).
(2) card 101 en DOS pasos: la guarda del podómetro era código inalcanzable, y
el primer arreglo NO cubría bloques mixtos (se pliegan a `kind = .reps`) —
ahora pregunta `tramoIsRun`. (3) `tramoGpsStartDistance`, gemelo del de ergo y
cinta: cada carrera del bloque empieza en cero. (4) la muñeca enseña metros y
ritmo en una estación de correr. Verificado: los 2 targets compilan, 1573 tests
en verde. **La card 67 estaba medio desfasada** (el EMOM ya estaba bien) y **la
70 es una reversión de decisión, no un bug** — anotado en sus cards.
Rediseño propuesto en el doble (`watch-legible`, 5 escenarios): suelo de 16 pt,
el crono deja de caer a 44 pt por tener 5 glifos, corona, bloqueo por agua,
«ahora/después», terminar al alcance. **Pendiente del visto bueno de Alex.**

**Mañana 21-ago Alex prueba en real (asignación 482, plantilla 687, card 107):**
resuelto contra la base, ejercicio a ejercicio — NO son 4 rondas de 8 bloques,
son 8 bloques (las «4 rondas» son 4 parejas correr+estación ya expandidas, lo
dicen las notas del coach): calentamiento 6' Z2 · 1.000 m + SkiErg 500 m · 1.000 m
+ Burpee Broad Jump 40 m · 1.000 m + Rowing 500 m · 1.000 m + Wall Balls 25×9 kg,
con 2:00 de descanso tras cada estación. NO hay trineo (eso fue el 20). Los
arreglos de arriba son justo lo que esa sesión necesita, y la dosis de cada
estación SÍ viaja hasta el tramo (verificado: `prescription_json` se sirve
verbatim), así que la cuenta atrás de metros y el cierre automático tienen de
dónde leer. La sesión se llama «Compromised» en el plan: es contenido del coach.

**Claro y oscuro del panel (106, `feat/coach-theme-toggle`):** el botón
de siempre vuelve a la barra. Acento = piel del club, no naranja de
sistema. Landing / iOS / reloj no se tocan. Ley: DECISIONS 20-ago.

**Correo de avisos del club (78, `feat/coach-inbox-email`):** leads, citas
y bajas van a `coaches.club_notify_email`. Vacío = no se manda. hello@ y
`LEADS_NOTIFY_EMAIL` ya no son el buzón de nadie. Campo en `/es/club`.
Ley: DECISIONS 19-ago «El correo de avisos es del club». No iOS. No main.

**Piel del club a los dispositivos (19-ago, en trunk):** el coach elige UN
color y el servidor deriva la familia entera para las DOS superficies (panel
perla / app casi negra) con AA garantizado en los papeles con significado:
`shared/domain/coach/club-accent.ts` + 15 tests sobre 10 colores reales. El
relleno conserva el color elegido salvo que se confunda con el fondo (exigir
3:1 movía hasta el naranja actual). `GET /api/auth/me` devuelve `club` con
hexes YA resueltos para fondo oscuro: iOS NO recalcula color. El panel «Tu
club» estrena vista previa doble (panel + app), dice qué ajustó y por qué,
avisa de choque con verde/rojo/ámbar y declara su alcance. Ley: DECISIONS
2026-08-19 «La personalización del club tiene DOS niveles» — estándar (piel
viva, un binario, todos) vs por encargo (app propia con icono y nombre
propios, build por cliente, precio muy superior). iOS y el reloj leen la piel (`ClubThemeStore`, persistida; se limpia en
signOut; el reloj por `WatchTodayPayload`) y los correos del atleta la pintan
(`resolveClubEmailSkin`: alta, código, las 4 de citas, recordatorio, resumen,
nurture, lista de espera y aceptación de pago; `coachVoice` deja de firmar la
marca cableada); los correos NUESTROS siguen con nuestra marca. De
paso: el panel pintaba texto con `--v2-accent` en 179 sitios (1,9:1 con el
naranja guardado) → todos a `--v2-accent-text`. EN PRODUCCIÓN (99bcb4d1, con el merge de origin dentro).
Pendiente: nombre y logo del club llegan al móvil pero no se pintan en
ninguna pantalla de la app; un solo logo para dos fondos.

**Rediseño FLEXR del panel (19-ago, COMPLETO y EN PRODUCCIÓN):** el panel
entero adopta FLEXR (contrato `projects/FLEXR/DESIGN.md`, canvas dirección C):
cromo FLEXR (claro perla; el oscuro y el botón vuelven 20-ago),
Bricolage+Figtree, sidebar flotante con slot de tenant, casa =
/atletas (toggle tarjetas/tabla, chips-filtro, franja de triage; /hoy = cola),
todas las pantallas restyleadas, cero em dash en copy (417 sust.), QA con
Chrome sobre prod hecho. El «bg raro movido» tenía DOS raíces, ambas
muertas: clases dark: siempre-activas (html legacy con .dark fijo) y los
overlays fixed de la ficha atrapados por el wrapper animado (containing
block por transform): el reveal pasa a fill backwards y el cajón de sesión
+ 10 modales se portalan al v2-root vía ModalPortal. iOS/doble/landing intactos.
**Resuelto (19-ago, decidido por Alex):** «Editar día» va SIEMPRE al día real
del atleta (/atletas/[id]/dia/[fecha]) anclado a la semana en pantalla; la
plantilla se edita solo desde «Editar plan». Verificado en prod con el atleta
64 (plantilla 89 con sessions=[] y semana entregada llena: los dos recibos
pueden divergir y el botón ya no enseña el vacío).

**UX coach (solo lectura, 18-ago):** el hueco es que el estado no se
entiende, no el publicar-tras-MCP. Mapa:
`docs/coach-ux-grok.html`. Recorrido Preview Coach Demo 1:
`docs/coach-ux-recorrido.html`. Sin implementar. Main/prod/FLEXR intactos.

**Corte prod 19-ago:** `fahybrid.com` y `app.fahybrid.com` sirven el
rediseño FLEXR (deploys de hoy desde `integration/trunk` local, worktree
fijado; smoke ok en los dos dominios). El corte pineado del 17-ago quedó
atrás. Migs Production sin cambios (0 pendientes al desplegar).


**Bloque vs propuesta (`feat/coach-bloque-vs-propuesta`):**
`month_2_pending` ya no mezcla «el bloque se acabó» y «hay una
propuesta de mes por validar». `block_ended` = sin siguiente bloque
(crítico). `month_2_pending` = validar propuesta. No auto-asigna.
No main, no Production.

**Receta vs bloque en Hoy (`feat/coach-hoy-receta-vs-bloque`):** la tira
de asignación separa el programa del atleta (titular: nunca tuvo /
terminó el X) de la receta de su celda (motivo: «Tu método»). Dos
puertas: Reponer bloque (modal de biblioteca → `assign-draft`, queda en
borrador) y Crear receta. «El sistema sigue tu método» exige 34/34.
Ley: DECISIONS 18-ago «Lo que le falta al atleta y lo que le falta a la
receta son dos ejes». No se asigna solo. No main, no Production.

**Carril del microciclo (`feat/coach-parcial-rail`):** badge «N de M
publicadas», cada semana del carril Visible / Borrador, ejecución
cortada = «a medias». No se dice «parcial». No se publica solo.
Caso: Marc 17–23 draft, 24–30 published. Ley: DECISIONS 18-ago
«Parcial son tres nombres».

**Borrador vivo en Preview (`feat/demo-draft-week`):** Marc Vidal
tiene 17–23 ago en `draft` (`delivery_mode=manual`) y 24–30
`published`. Recorrido: Preview `/es/acceso-demo` → Coach Demo 1 →
Marc → Plan.

**Hoy + altas honestos (`feat/coach-hoy-altas-honestas`):** `/es/hoy`
no pinta salud si nadie ve la semana. El alta no dice «antes de
arrancar» si el atleta ya entrenó, chateó o tiene bloque vencido.
Ley: DECISIONS 18-ago «Hoy del club no pinta salud». No se publica
solo. No se asigna el mes. No main, no Production, no FLEXR.

**Semana honesta (#35, en trunk):** Resumen y Plan titulan la semana
calendario del chip. Un bloque de julio no se llama «Esta semana».

**Chip de entrega (#34, en trunk):** Visible · No lo ve · Semana vacía ·
Bloque terminado · Sin plan. Misma puerta que MCP `athlete_sees_it`.

**Trunk 18-ago:** #29–#35 en `integration/trunk`. No main.

**Clonabilidad iOS (#33):** marca/bundle/dominio/esquema/equipo en
`settings.base`. Team id en AASA (público, decisión pendiente).

**Carrera hogar:** shipeada en Swift (13-ago). Plan personal atleta 64
cerrado. Tests = loop (CMJ + feedback `test_result`, mig 0196).

## Espera Alex

- iPhone: abrir la app (API `app.fahybrid.com`). Sign in with Apple.
  No usar `/es/acceso-demo` (404 en prod).
- Elegir capas del layout de vídeos de técnica: `docs/video-tecnica-layouts.html`
- Chat contextual: `/es/design/chat-contexto`.
- ZIP GDPR Garmin para validar el importador FIT.

## Parqueado (no tocar)

Onboarding 15 agujeros · 29 rutas coach sin pantalla · `coach_methodology`
vacía · vivo ergo/AMRAP/FT · 22 bloques incompletos · 20 secuencias.

## Ley

`docs/DECISIONS.md`. Se cita la entrada de la pieza, no se pega el fichero.

## Regla de gasto

Un átomo por sesión de agente. Grok default. Claude solo UI gorda.
Bugs 1–3 líneas: Hermes. FOCUS no se hincha: si hace falta relato, va al tablero.

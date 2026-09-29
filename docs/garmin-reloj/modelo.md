# El reloj Garmin — el modelo (29-09-2026)

Especificación de la app de actividad Connect IQ del atleta. Sale de cuatro lecturas del 29-09: el SDK 9.2.0 instalado en el Mac (34 relojes), una auditoría de capacidades de una app de actividad, un estudio de TrainingPeaks y Garmin con fuentes oficiales, y la auditoría del repo. Informes en bruto: `docs/garmin-reloj/fuentes/`. Las pantallas se diseñan como `propuesta` en el doble (`web/components/design-twin/screens/garmin-*`) con el kit `kit-garmin/`, sobre el motor y las reglas de `kit-reloj/`. El Monkey C va después de la firma de Alex.

**Listón (Alex, 29-09):** «que sea top en el mercado, que gane a TrainingPeaks». En el reloj Garmin, TrainingPeaks es el reproductor NATIVO de Garmin con los entrenos que le llegan por el calendario de Garmin Connect. Ganarle es hacer lo que ese reproductor no puede: la sesión híbrida entera en la muñeca, con el objetivo que manda el coach y sin depender de la API de Garmin (pausada).

Marcas de estado en todo el documento: **[V]** verificado en el SDK 9.2.0 o en una fuente oficial · **[S]** secundario (foro, prensa, reseñas) · **[?]** no verificado, exige reloj real (§12).

---

## 1. Lo que es cierto de la plataforma (y manda sobre el diseño)

| # | Hecho | Estado | Consecuencia |
|---|---|---|---|
| H1 | Un `watch-app` graba su propio FIT (`ActivityRecording`), aparece en la lista de Actividades y se sincroniza con Garmin Connect. **Un deporte por sesión.** No existe SPORT/SUB_SPORT de HYROX. Sí: RUNNING, TRAINING, HIIT, ROWING, MULTISPORT y subdeportes HIIT/AMRAP/EMOM/TABATA/STRENGTH/CARDIO/TREADMILL/TRACK. | [V] | El deporte del FIT lo decide el servidor por sesión (dato, no constante del reloj). |
| H2 | `addLap()` no lleva datos. Los campos propios van por developer fields (256 B por mensaje). Los de VUELTA fallan a menudo en Garmin Connect; los de RECORD y SESSION se ven bien. | [V] la API · [S] el fallo | Cada paso cierra una vuelta (`addLap`), pero **la verdad de un paso vive en NUESTRO servidor**, no en Garmin Connect. |
| H3 | FC, GPS, cadencia y velocidad a 1 Hz. El `onUpdate` de una app solo corre con `requestUpdate()`: el 1 Hz lo da un `Timer`. | [V] | Relojes desde anclas (`System.getTimer()`), nunca contando ticks. |
| H4 | **Acelerómetro en crudo: SÍ.** `Sensor.registerSensorDataListener` entrega acelerómetro, giroscopio, magnetómetro e intervalos RR en lotes de ≤ 4 s; hasta 100 Hz en FR265/965/970/570/955, fenix 7/8, Venu 3, vivoactive 6. Un solo listener a la vez. | [V] | **Corrige DECISIONS 2026-08-06**, que decía que Connect IQ no lo expone. Contar reps y detectar estaciones en Garmin deja de estar descartado: fase 2, sujeto a T10. |
| H5 | **Ni voz ni audio desde una app de reloj.** Solo `Attention.playTone` (19 tonos de sistema o de frecuencia/duración) y `vibrate` (≤ 8 pulsos por llamada; los Forerunner no admiten patrones de intensidad). | [V] | Cero voz en la v1. Tonos y vibración con codificación redundante (§6). La voz por el móvil queda como fase posterior [?]. |
| H6 | Botones (relojes de 5): START/STOP = `enter`, BACK/LAP = `esc` (es UNA tecla), UP = página anterior, DOWN = página siguiente, UP largo = menú. Táctiles: `onTap`, `onSwipe`… Relojes de 2-3 botones (Venu, vivoactive): solo enter/esc. | [V] simulador | Botones primero; el táctil es un acelerador fuera del vivo (§5). Dos niveles de reloj (§3). |
| H7 | Devolver `true` en `onBack` evita que la app se cierre; hay que bloquear BACK mientras graba. | [S] | BACK es la vuelta (LAP): su fiabilidad es la queja nº 1 de toda la competencia (H12). |
| H8 | Memoria de un watch-app: 768 KB (FR165/265/570/955/965/970, fenix 7/8/E, epix 2, Venu 3/4, vivoactive 5/6, Instinct 3 AMOLED, Enduro 3), 512 KB (FR255), 128 KB o menos (Instinct 3 Solar, FR245, FR55, fenix 6 estándar). Storage: 10 MB. Background: 64 KB. | [V] | Suelo de v1: ≥ 512 KB y API ≥ 5.2. Los de 128 KB quedan fuera. |
| H9 | Sin voz de `Media`, sin Always-On propio de un watch-app; el `onPartialUpdate` es de watch faces. | [V] | La pantalla del atleta corriendo depende del despertar del reloj: T2. |
| H10 | La red va por el móvil BLE (o WiFi ya conectado); sin móvil = error -104. No hay tamaño máximo de petición documentado. | [V] códigos · [?] tamaño | Cola local con reintento y acuse; el reloj graba sin móvil (T5). |
| H11 | ¿Cuenta una sesión de app Connect IQ para Training Effect, carga, Training Status, VO2max y recuperación de Garmin? **Nadie lo dice oficialmente.** Un foro de Xert dice que no; fichas de apps dicen que sí con deporte nativo. | [?] | **No se promete nada de Garmin hasta T1.** Es el riesgo mayor. |
| H12 | Competencia en la Store: 44 apps mencionan HYROX (la mejor, ROXZONE: 4,7 con 199 reseñas). Quejas repetidas: el botón de vuelta falla, cuelgues, y en Garmin Connect las estaciones salen como «descanso» y la actividad como «correr indoor». Ninguna es un plan de coach con objetivos; Kinevo y FRENESIT bajan el entreno al reproductor nativo y no miden nada. | [V] la Store · [S] reseñas | El hueco no es «tener app»: es fiabilidad, sesión limpia en Garmin Connect y plan del coach. |
| H13 | TrainingPeaks en Garmin: calendario de Garmin Connect, solo 15 días, sin Strength/Brick/Day Off, RPE = temporizador, rango del reloj ±10 % (no la zona), sin segundo objetivo. **No tiene app propia en la Store** (la antigua ya no existe). | [V] | Ver §14. |
| H14 | Garmin no tiene perfil HYROX nativo (0 menciones en los manuales del FR970 y fenix 9 de 2026). Amazfit es el socio oficial de HYROX (abril 2026). Garmin exige permiso para marcas ajenas. | [V] | «HYROX» no va en el título ni en la ficha de la Store. |
| H15 | Apps de pago con el sistema de Garmin exigen entidad legal en país admitido; nosotros no la tenemos. Cuenta externa y cobro propio están permitidos y son habituales. | [V] | App gratuita que exige cuenta FAHYBRID (declarado en la ficha). |
| H16 | Connect IQ es un programa aparte de la Connect Developer Program (pausada). Revisión oficial ≤ 72 h. Una beta permite probar developer fields en producción. | [V] | Esta vía no depende de la API. |

## 2. Decisión de arquitectura

**Motor propio.** La app es un `watch-app` de actividad con su propio motor: guía cada paso contra su objetivo, graba el FIT, deja RPE y series anotadas, y envía el resultado a nuestro servidor. El reproductor nativo de Garmin no se usa como camino de la app.

**Por qué (objetivo, no gusto):** el reproductor nativo solo entiende cardio por intervalos (H13), así que con él lo mejor que se logra es igualar a TrainingPeaks en carrera. La sesión híbrida (carrera + estaciones + ergo + fuerza + EMOM/AMRAP) solo puede ir en un motor propio. Y el resultado por tramo llega a nuestro servidor sin pasar por Garmin, cuya API está pausada.

**Qué se pierde y se dice sin adornos:** Training Effect/Status/carga/VO2max de Garmin sobre estas sesiones (H11, hasta T1), PacePro, la voz de Garmin, y el alcance de TrainingPeaks (que llega a casi todos los Garmin; nosotros a los de ≥ 512 KB y API ≥ 5.2).

**Qué pasa con `garmin-ciq/` (la app «mensajera», 1.291 líneas):** el motor propio la sustituye en el mismo proyecto y el mismo id de app. Se conserva el login (`Store`, `Api`, `Json`, `DateUtil`, `Controller` como patrón) y se **borra** `Delivery.mc` y todo lo de descargar un FIT y lanzar el reproductor (nada muerto que despiste). Si T1 dice que la carga de Garmin solo cuenta con el reproductor nativo, el código está en git y se recupera para las sesiones de correr puras; hasta entonces no se mantiene un segundo camino. Nunca se ha probado la mensajera en un reloj; no se pierde nada probado.

## 3. Alcance de relojes

- **Nivel A (v1, diseñar y probar):** 5 botones y ≥ 512 KB. AMOLED: FR165/170/265/570/965/970, fenix 8 y E, epix 2, Instinct 3 AMOLED. MIP: FR255/255S/255M/955, fenix 7 y 8 Solar, Enduro 3.
- **Nivel B (después):** Venu 3/4/X1, vivoactive 5/6 (enter/esc/menu): sin UP/DOWN, la navegación por páginas exige táctil, que el vivo mantiene apagado. Necesita su gramática.
- **Nivel C (quizá):** FR745/945 (1,3 MB pero API 3.3.1).
- **Fuera:** ≤ 128 KB.
- **Tres casos de diseño** (por resolución y tecnología): **454** AMOLED (FR965/970, fenix 8 47, Venu 3), **390** AMOLED (FR165/170/570-42), **260** MIP de 256 colores (FR255/955, fenix 7). **El suelo es 218** (FR255S, 218 MIP): todo texto tiene que caber ahí. El mínimo es el caso de diseño.
- La app declara los ids en el manifest **desde el SDK instalado** (`devices.xml`), no a mano: hoy `tactix7` y `enduro2` no existen y rompen el paquete de la Store.

## 4. Principios (la gramática Garmin, G1–G12)

Hereda de `docs/reloj-muneca/modelo.md` el paso como unidad (P2), el objetivo que manda (P3), un color un significado (P6), el descanso común (P8), correr es correr (P9), circuito y HYROX (P10), fuerza (P11), WOD (P12) y el antes y después (P13). Lo que cambia por la plataforma:

- **G1 · Un estado vivo, un pintor.** El motor produce un `EstadoVivo` igual que el de `kit-reloj`; la vista lo pinta con un solo código. Relojes desde anclas; avisos desde las transiciones del estado. Un dato que no llega se pinta «—», jamás un cero.
- **G2 · El objetivo manda** (P3): ritmo si el paso va a ritmo; pulso y zona si va a zona; RPE con su palabra; si no hay objetivo, lo que falta. El ritmo es el ACTUAL, suavizado ~10 s **calculado por nosotros** desde la distancia (`elapsedDistance`), no la media ni el valor del firmware. El veredicto lleva dirección (▲ rápido / ▼ lento) en la banda y en palabra.
- **G3 · Botones, no toques.** En el vivo el táctil está apagado (como en Garmin nativo). Cada botón hace lo mismo que en el reloj nativo y una sola cosa por estado (§5). Nada se cierra sin una tecla física y todo cierre se puede deshacer 5 s (Garmin nativo no deja).
- **G4 · La vuelta no falla.** BACK/LAP es la tecla que más se rompe en la competencia. Es el primer requisito de calidad: una pulsación = una acción + un aviso propio + deshacer; nunca dos pasos por una pulsación, nunca ninguno; BACK jamás cierra la app grabando.
- **G5 · Un evento, un aviso, con codificación redundante** (vibración por número de pulsos + tono por melodía): funciona con el sonido apagado y con la vibración de los Forerunner, que no cambian de intensidad (§6). Cero voz.
- **G6 · Tu zona, no la del reloj.** Las bandas llegan del servidor en bpm y s/km absolutos por atleta con el método del coach. El reloj nunca aplica sus zonas de Garmin. Una zona estimada se dice estimada.
- **G7 · Lo que nadie mide no se pinta.** «Lo dices tú» en estaciones sin medidor. Sin sensor de pulso: «—». Sin GPS: crono.
- **G8 · Escribir primero, enviar después.** Cada paso cerrado se guarda en Storage antes de enviar nada; un resultado espera hasta el acuse del servidor, sin caducidad. El reloj graba sin móvil.
- **G9 · Una sesión, una versión.** El reloj termina la versión del plan con la que empezó y el resultado dice cuál fue. Un plan viejo se dice viejo.
- **G10 · La sesión se puede reconstruir.** Un checkpoint en Storage cada cambio de paso y cada 30 s. Si la app muere, el siguiente arranque ofrece «Seguir» (nueva grabación, misma sesión; el servidor une las dos por `assignment_id`) o «Guardar lo hecho». Garmin no permite reanudar un FIT tras cerrarse [S]: se dice, no se promete.
- **G11 · Un solo idioma de pantalla.** Números en la fuente de marca (bitmap, subconjunto de dígitos y símbolos), texto en la fuente del sistema. Nada de texto por debajo de 6,2 % del diámetro. Copy de atleta de box, no de ingeniero.
- **G12 · Nada de método en el código.** Umbrales de aviso, histéresis, preaviso, vuelta automática, nombres de clase y de formato, mapa deporte→FIT: dato del coach o del servidor con defecto (HARD RULE Nº0). El reloj obedece; no decide metodología.

## 5. Interacción (una fila por estado; la misma gramática en todas las familias)

| Estado | START/STOP | BACK/LAP | UP | DOWN | UP largo |
|---|---|---|---|---|---|
| Brief | **Empezar** (con GPS listo o «Empezar sin GPS») | Atrás (sale de la app) | sesión anterior del día | sesión siguiente | Ajustes |
| Cuenta atrás 3-2-1 | Cancelar | Cancelar | — | — | — |
| Paso en curso | **Pausa** | **Siguiente paso** (vuelta) + 5 s de deshacer | página anterior | página siguiente | **Controles** |
| Durante los 5 s de deshacer | Pausa | siguiente paso otra vez | **Deshacer** | página siguiente | Controles |
| Recuperación / descanso | Pausa | **Empezar ya** | página anterior | página siguiente | Controles (+30 s aquí) |
| Serie de fuerza | Pausa | **Serie hecha** | página anterior | página siguiente | Controles |
| Anotar la serie (en el descanso) | confirmar campo (reps → carga → RIR); en el último, cerrar | campo anterior; en el primero, salir de anotar | valor + | valor − | Controles (Pausa, saltar el descanso) |
| AMRAP con ≥ 2 movimientos | Pausa | **Ronda hecha** | **reps +1** | **reps −1** | Controles (aquí están Datos/Vueltas/Estructura) |
| Ventana que no se salta (minuto entero de máquina en un EMOM, Tabata, AMRAP de UN movimiento) | Pausa | **sin efecto** (un BACK con sudor no salta una ventana; «Saltar paso» está en Controles) | página anterior (en el AMRAP de un movimiento: **reps +1**) | página siguiente (**reps −1**) | Controles |
| Campana de un AMRAP (puntuación) | **Guardar** (con 5 s de deshacer con UP) | **Ronda hecha** solo si hay una en curso; si no, sin efecto | **reps +1** (mantener acelera) | **reps −1** (mantener acelera) | Controles |
| Pausa | **Reanudar** | Controles | — | — | — |
| Controles | elegir | cerrar | anterior | siguiente | — |
| RPE | **confirmar** | omitir (RPE nulo) | valor + | valor − | — |
| Resumen | siguiente página / Hecho | atrás / Seguir | página anterior | página siguiente | — |

- **Anotar la serie** se abre en cada descanso con series por anotar y se reabre con UP mientras haya algo propuesto (con DOWN no: cambiaría un dato sin querer). Lo propuesto no cuenta como declarado hasta confirmarlo con START. Cada campo confirmado suena como una tecla (§6).
- **Un cierre que no cierra paso** (guardar la campana, anotar una serie) también tiene su deshacer de 5 s con UP: es el deshacer de FAMILIA, una sola pieza del kit.
- El táctil solo actúa fuera del vivo (brief, controles en pausa, RPE, resumen) y siempre tiene su tecla equivalente.
- **Páginas del vivo** (UP/DOWN, circular): Paso → Datos → Vueltas → Estructura. Mismas cuatro que la corona de la muñeca de Apple.
- **Controles** (UP largo): Pausa, Saltar paso, +30 s (descanso), Cambiar entorno (calle/cinta/pista), Terminar (pide confirmar con START; ofrece «Guardar lo hecho»), Descartar (confirma dos veces).
- Terminar antes de tiempo guarda como `completeness: partial`; el motor decide la completitud, no la pantalla.

## 6. Vocabulario de aviso (vibración + tono; sin voz)

Codificación redundante: la vibración distingue por **número de pulsos** y el tono por **melodía**. Si el atleta silencia los tonos queda la vibración; si el Forerunner ignora los patrones de intensidad queda el conteo. Un evento sin aviso propio no vibra (pausa, reanudar, +30 s, deshacer y el estado del envío no avisan). En un mismo instante suena UN aviso, el de más prioridad; el acuse de una tecla va delante.

| Evento | Vibración | Tono (de sistema o propio) |
|---|---|---|
| 3-2-1 antes de un paso de trabajo | 1 corta por segundo | `KEY` ×3 |
| Empieza trabajo (GO) | 2 largas | `START` |
| Empieza recuperación / descanso | 1 larga | `STOP` |
| Preaviso (10 s o 100 m, solo en pasos ≥ 30 s) | 1 corta | `INTERVAL_ALERT` |
| Afloja (rápido / pulso por encima) | 2 cortas | dos notas que bajan |
| Aprieta (lento) | 3 cortas | dos notas que suben |
| Vuelta automática (km) | 2 cortas | `LAP` |
| Paso cerrado a mano | 1 muy corta | `KEY` |
| Bloque hecho | 1 larga + 1 corta | `SUCCESS` |
| Sesión hecha | 3 largas | `SUCCESS` ×2 |
| GPS listo | 1 larga | `SUCCESS` |
| Campana de un AMRAP | 4 largas | melodía propia (5 notas) |
| Campo de anotación confirmado | 1 muy corta | `KEY` |
| Sensor o GPS perdido | 3 largas | `FAILURE` |
| Sensor o GPS recuperado | 1 corta | `KEY` |
| Batería baja (< 10 %) | 2 largas | `LOW_BATTERY` |

Reglas (todas dato del coach o del servidor con defecto): ningún aviso fuera de objetivo en calentamiento ni recuperación; histéresis y cadencia mínima 20 s; dirección del aviso por objetivo (`avisa`); preaviso mínimo 30 s; una serie a zona se juzga por tiempo en zona tras un margen de gracia. Con la app inactiva Garmin deniega `Attention` (H5): el motor sigue, el aviso no suena; se comprueba en T4.

## 7. Pantallas (una por lo que haces)

Cada una en los tres casos de diseño (454, 390, 260) y a 218. Las que llevan datos reales usan los casos de §11.

**Fuera de la sesión:** G01 Glance «Hoy» (una línea en el bucle de Garmin: título y duración) · G02 Brief del día (estructura en una línea, duración, entorno calle/cinta/pista, GPS buscando/listo, Empezar) · G03 Varias sesiones el mismo día (mañana/tarde) · G04 Hoy no toca · G05 Sin plan / plan viejo («Plan de hace 3 días · acerca el móvil») · G06 Vincular el reloj (código de 6 caracteres en la muñeca; se escribe en la app del móvil) · G07 Sesión interrumpida (Seguir / Guardar lo hecho).

**En vivo:** G08 3-2-1 + GO · G09 Paso de correr (calle, cinta y pista; a ritmo, a zona, a RPE, abierto), con banda del objetivo y marca ▲▼ · G10 Aviso fuera de objetivo · G11 Recupera (trote, andar, parado) con «Luego» · G12 Descanso común · G13 Estación (medida o «lo dices tú») · G14 Roxzone · G15 Serie de fuerza + anotar (reps, carga, RIR) · G16 EMOM (ventana y tarea) · G17 AMRAP (rondas y reps) · G18 For Time (crono total y cap) · G19 Ergo (remo, ski, bici) · G20 Pausa · G21 Deshacer · G22 Controles · G23 Datos (rejilla) · G24 Vueltas · G25 Estructura · G26 Aviso de sistema (GPS/sensor perdido, batería).

**Al terminar:** G27 Sesión completada + guardado · G28 RPE (0–10 con su palabra; omitible: un RPE omitido es nulo, nunca inventado) · G29 Resumen de corredor («5 de 6 dentro», series frente a objetivo) · G30 Resumen de circuito (parciales por carrera y estación, Roxzone, coste de la carrera comprometida) · G31 Estado de envío honesto: «Guardado en el reloj · sube al tener el móvil» · «Enviando» · «Enviado ✓» · «Sesión caducada · vuelve a vincular el reloj, tu entreno espera» (401: nunca se tira) · «El servidor no contesta · lo reintento solo» (5xx). **No existe «rechazado con Reintentar»:** el servidor no rechaza un entreno con trabajo (DECISIONS 28-09, «Nunca 4xx por un entreno con trabajo») y repetir un 4xx da el mismo 4xx.

## 8. Datos

**Plan.** Endpoint nuevo por lotes (`GET /api/athlete/wearables/garmin/plan?from&days=14`) que sirve PASOS ya resueltos, no el detalle en bruto de la asignación. El paso es `PasoBase` de `kit-reloj/paso.ts` codificado en posicional compacto y versionado, con las cadenas internadas en una tabla por sesión (nombres de ejercicio y cue). Bandas de zona en bpm y s/km absolutos por atleta. Por sesión: `id` (assignment), `ver` (huella), `fit_sport`/`fit_sub_sport` (dato), entorno, estructura en una línea, pasos. Presupuesto: ≤ 6 KB por sesión, ≤ 8 KB por clave de Storage, decodificar en memoria solo la sesión en curso. Se descarga a 14 días al abrir la app con móvil y en segundo plano cada hora [?].

**FIT.** `createSession` con el deporte y subdeporte que manda el servidor. Una vuelta por paso (`addLap`). Developer fields en RECORD (paso, objetivo) y SESSION (versión del plan); la verdad de cada tramo va al servidor. Sensores habilitados **antes** de `createSession`.

**Resultado.** `POST /api/sync/workout-execution` (el endpoint que ya usa el móvil): `recorded_via: 'live'`, `source: 'garmin'`, `assignment_id`, `started_at` fijado y guardado ANTES de grabar (el reintento manda el mismo), `source_workout_ref` estable, `completeness`, `perceived_exertion`, y `segments[]` con `position`, `modality`, tiempos, distancia, ritmo, FC media y máxima, `zone_seconds_json`, series de fuerza (`sets[]` con reps, kg, RIR), `leg_index/role/phase` en las carreras. Cola en Storage con reintento y sin caducidad hasta el acuse. Series por segundo por `/api/sync/workout-traces` (lotes pequeños).

**Login.** Flujo de código de dispositivo, el estándar del mercado: el reloj muestra un código de 6 caracteres; el atleta lo escribe en la app del móvil, ya con su sesión. Sustituye al flujo actual (teclear el email y un código en los ajustes de Garmin Connect, que solo bajan al reloj al salir de la pantalla). Sesión renovada con `/api/auth/refresh` (180 días deslizantes; la mensajera nunca lo llama).

## 9. Ciclo de vida y fallos que el diseño ya contempla

BACK bloqueado en el vivo · guardado en `onStop` y checkpoint (G10) · GPS perdido: banner + el crono sigue · sensor de pulso perdido: «—» y aviso · móvil ausente: se graba igual y se dice al terminar · Storage lleno (`STORAGE_FULL`): se borra lo más viejo de ESTA app y se avisa · plan sin detalle: no hay Empezar (regla del 28-09) · dos apps grabando: Garmin puede negar el GPS; se dice · la app muere: G07.

## 10. Arreglos aguas arriba (sin ellos, el dato cae a texto)

- **A1** Contrato de paso en `shared/` (Zod + TS), una vez, con builder servidor `AssignmentDetail → pasos`. Hoy vive en Swift y en el doble; no hay endpoint de pasos. Fixtures de oro (las 22 sesiones) compartidos con iOS.
- **A2** M1–M8 de `docs/reloj-muneca/modelo.md` en el servidor: dos objetivos por paso, modo de recuperación, entorno, tandas anidadas, EMOM con duración total, HYROX como estructura, máquina e implemento como dato, cue por paso.
- **A3** Reglas de aviso del coach servidas como dato (hoy defectos del cliente).
- **A4** Mapa modalidad → `fit_sport`/`fit_sub_sport` como dato (T1 y T9 lo deciden).
- **A5** Endpoint de plan por lotes y endpoint de código de dispositivo.
- **A6** `hr_source` sin valor para «óptico del reloj» (CHECK cerrado): ampliar.
- **A7** Semántica de un segundo POST con los mismos `assignment_id`: hoy la captura reinserta segmentos frescos; confirmar el upsert por `(execution_id, position)` antes de partir el resultado en sobres.
- **A8** Con la mensajera se retiran `garmin/today`, `garmin/workout` y el codificador FIT de entrenos (`workout_name` sin fecha y `reason` desalineado eran sus fallos); el manifest se genera desde `devices.xml`.

## 11. Contra qué se rompe

Las 22 sesiones reales del modelo de la muñeca (491, 494, 573, 479, 551, 509, 511, 535, 538, 488, 529, 492, 498, 572, 506, 552, 542, 493, 482, 505, 530, 536, 513, 514) más los casos de `kit-reloj`. Examen automático (`web/tests/design-twin/kit-garmin*.test.ts`), por sesión y por cada uno de los 4 tamaños:

1. Cada paso resuelve a UNA pantalla de §7.
2. Todo texto cabe a 218 sin bajar de 6,2 % del diámetro.
3. Cero texto libre salvo cue y nombre de catálogo.
4. El plan codificado cabe en 6 KB.
5. Anidamiento y recuento de pasos dentro de memoria (≤ 200 pasos).
6. Cada campo cumple el test de uso final: el atleta lo entiende, la app calcula con él, la IA lo adapta.

## 12. Dónde puede fallar y qué solo prueba un reloj

Nada de esto se puede simular (Garmin no simula el firmware). Orden de la prueba, con un FR965 o similar y un FR255:

- **T1** 30′ de carrera grabada como RUNNING y otra como TRAINING/HIIT: ¿Training Effect, carga, Training Status, VO2max y recuperación en el reloj y en Garmin Connect? **Decide el copy y el mapa de A4.**
- **T2** Pantalla AMOLED grabando: ¿se apaga?, ¿despierta al girar la muñeca?, ¿`Attention.backlight`?
- **T3** Las cinco teclas llegan a la app durante la grabación (BACK, START, UP, DOWN, UP largo); ¿se pierde alguna?
- **T4** Vibración en Forerunner (¿respeta on/off?) y tonos con y sin auriculares; con la app inactiva.
- **T5** POST de 2, 8 y 30 KB por móvil BLE, sin móvil y por WiFi.
- **T6** Plan de 14 días en Storage; memoria libre en FR255 (512 KB).
- **T7** Salir con la sesión abierta; batería agotada: qué queda en Garmin Connect.
- **T8** Developer fields en Garmin Connect (beta de la Store): RECORD, LAP, SESSION.
- **T9** `addLap` por paso: cómo aparecen las estaciones en Garmin Connect.
- **T10** Acelerómetro a 100 Hz en lotes: CPU, batería, watchdog; conteo de reps (fase 2).
- **T11** GPS: tiempo al fix, multibanda, pista.
- **T12** Batería: 90′ de HYROX sim con GPS + pulso + acelerómetro.
- **T13** Volver a la esfera con la sesión grabando (fenix 7 la mata según foros).
- **T14** Correa de pulso ANT+/BLE y RR.

Riesgos de producto: reach menor que TrainingPeaks; instalación desde la Store + vincular (TrainingPeaks no pide instalar nada); Roxzone y coste comprometido por movimiento, sin validar; si T1 sale negativo, el argumento «cuenta para tu carga de Garmin» no existe.

## 13. Lo que NO hace la v1

Voz · conteo de reps y detección de estación (fase 2, T10) · lectura del PM5 por BLE/ANT+ (sin verificar; el ergo es «lo dices tú» o crono) · Venu/vivoactive (nivel B) · relojes de ≤ 128 KB · Edge · plan de más de 14 días · «Live» para el coach · lecturas de readiness, HRV o lesiones (cláusula médica §1(c) de Garmin: la app hace SOLO entreno) · la palabra HYROX en la ficha · cobro por Garmin (sin entidad legal).

## 14. Contra TrainingPeaks, en la muñeca Garmin

| Área | TrainingPeaks | Esta app | Veredicto |
|---|---|---|---|
| Cómo llega | Calendario de Garmin Connect, 15 días, cambios del coach al instante (Training API) | 14 días por móvil, versión del plan por sesión | Detrás en inmediatez; delante en control |
| Alcance | Casi todos los Garmin (Edge 500+, FR 910XT+) | Nivel A: ≥ 512 KB y API ≥ 5.2 | **Detrás** |
| Instalar | Nada | Store + vincular con código | **Detrás** |
| Carrera | Reproductor nativo: ritmo/FC/potencia, ±10 % | Motor propio: objetivo que manda, banda de la zona del coach, dos objetivos, aviso con dirección | Delante |
| RPE | Solo temporizador | Objetivo con su palabra + RPE al terminar | Delante |
| Fuerza | No llega al reloj | Series con carga, RIR y tempo, anotadas en el descanso | **Delante** |
| Circuito / HYROX | No existe | Estaciones, Roxzone, carrera comprometida en UNA actividad | **Delante** |
| EMOM / AMRAP / For Time | No | Sí | Delante |
| Resumen en el reloj | Puntuación de ejecución Garmin (carrera y bici) | «5 de 6 dentro», parciales por tramo | Delante |
| Resultado al coach | Cuando Garmin sincroniza y TrainingPeaks lo recoge | Directo al servidor al terminar | Delante |
| Training Effect / Status de Garmin | Sí (reproductor nativo) | **No verificado (T1)** | **Detrás hasta T1** |
| Voz | No | No | Igual |

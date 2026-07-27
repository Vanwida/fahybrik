# FOCUS — FAHYBRID

Estado vivo del proyecto. Se actualiza en el mismo commit que el trabajo.
Última actualización: **2026-07-27**

---

## En qué estamos ahora

**Definir la metodología propia de FAHYBRID.**

El problema de fondo: tenemos tecnología pero no método. Pablo no tiene uno documentado y su referencia es la metodología del entrenador que le entrena a él como atleta — que no es la dirección que queremos. La salida no es discutirle el contenido, es darle un **marco ya decidido y modificable**, para que su trabajo sea corregir en vez de crear.

La tesis de trabajo: *la identidad de un método no está en los ejercicios, está en las reglas*. Los ejercicios los usa todo el mundo; lo que nos hace reconocibles es cómo decidimos, medimos y ajustamos.

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
- **Gap descubierto:** el dashboard NO enseña en ningún sitio CÓMO se
  encuentra el atleta — `checkin_sub_score` se calcula en resumen.ts y no se
  pinta, y el endpoint coach `readiness-breakdown` está huérfano (cero
  consumidores). Solo hay señal indirecta («sin check-in ≥48 h») y el score
  global. Propuesta pendiente de OK: fila «Cómo se encuentra» en la ficha del
  atleta + chip en roster cuando el check-in del día venga mal.

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

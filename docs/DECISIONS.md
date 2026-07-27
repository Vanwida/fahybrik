# DECISIONES — FAHYBRID

Registro de decisiones estructurales del dominio y de la arquitectura.

**Para qué existe:** en julio de 2026 tuvimos que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y un par de migraciones que habían creado y luego eliminado una entidad, sin que en ningún sitio constara el porqué. Este fichero evita que vuelva a pasar.

**Cuándo se escribe aquí:** siempre que se tome una decisión que condicione el dominio o el modelo de datos, y muy especialmente cuando se **elimina o se descarta** algo. Lo que se borra sin dejar rastro es lo que alguien reconstruye seis meses después.

**Formato:** una entrada por decisión. Qué se decidió, por qué, y qué NO hacer en consecuencia.

---

## 2026-07-27 · El dato fabricado se marca en columna propia, no en `source` (migración 0142)

**Decidido:** `races` gana `is_synthetic boolean not null default false`. Lo escriben en `true` los tres seeds de demo (`seed_demo_athlete_races`, `seed_demo_race`, `seed_demo_dobles_race`) y lo excluyen las **dos únicas consultas de `races` que cruzan atletas**: el cohorte de singles (`web/lib/athlete/goal-gap.ts`) y el de dobles (`web/lib/athlete/dobles-gap.ts`). Todas las demás lecturas van filtradas por `athlete_id`, así que un atleta de demo sigue viendo lo suyo intacto.

**Por qué:** los seeds escribían con el `source` del fixture (`'hyresult_import'`) y, para la pareja de demo, con todos los splits multiplicados por `DEMO_RACES_SCALE`. Filas inventadas indistinguibles de una importación real, entrando en el presupuesto por tramo de atletas de pago. Comprobado contra producción: para un objetivo de dobles de 65 min el cohorte cogía 12 carreras, **5 de ellas sembradas**; tras el filtro quedan 7 reales — sigue por encima del mínimo de 5, así que la lectura no se degrada.

**Se descarta:** marcarlo con un valor nuevo de `source` (p. ej. `'demo_seed'`). `source` es el **canal de importación**, no la veracidad del dato; cambiarlo habría sacado a los propios atletas de demo de sus lecturas per-atleta (marcas, estación a estación, transferencia, su dobles) y roto la demo. Las dos propiedades son ortogonales y viven en columnas distintas.

**En consecuencia, no hacer:** no escribir una fila de `races` desde un script de siembra sin `is_synthetic = true`; y toda consulta NUEVA que agregue carreras **a través de atletas** (cohorte, calibración predicho-vs-real, estadística de población) nace con `and not is_synthetic`. La spec del predictor ya lo exige para el conjunto de calibración (`docs/race-projection-spec.html`, §08).

---

## 2026-07-27 · En dobles calcula el servidor; la app sólo previsualiza el tramo que se arrastra

**Decidido:** la regla del reparto de una estación vive una vez, en `shared/domain/dobles-gap` (`splitStationPrediction`), **con el share recortado a 0…1**. El endpoint de dobles pasa a emitir también las lecturas derivadas — `delta_s` por tramo y `gap_s` del total — igual que el gap individual, que ya las mandaba. iOS las pinta.

**Por qué:** la aritmética estaba escrita dos veces y con reglas distintas (el clamp existía sólo en Swift), sin ningún test que las comparase; y el hero, las filas y el editor de reparto rehacían restas que el servidor ya sabía hacer. El clamp era el comportamiento correcto — un share es una fracción de UNA estación, y ya es la regla en el borde de escritura (bound de Zod + `normalizeStationSplit`) — así que subirlo al motor no cambia ningún número.

**Se descarta:** pedirle el recomputo al servidor mientras el atleta arrastra el slider (una ida y vuelta por paso no es una UX aceptable). La app conserva **un** espejo local, el del split, y nada más.

**En consecuencia, no hacer:** no añadir más aritmética de dominio en la app — si hace falta un número derivado, lo emite el servidor. Y si algún día se toca la regla del split, se toca en el dominio y se actualiza `shared/domain/dobles-gap/station-split-cases.json`: esa tabla la leen los tests de los dos lenguajes (`tests/analytics/dobles-gap.test.ts` y `DoblesRepartoMathTests`), y es lo que impide que las dos implementaciones vuelvan a separarse en silencio.

---

## 2026-07-27 · Obra 0 multi-coach: el scope viaja al WHERE, y el funnel se atribuye por config

**Decidido:** toda lectura/escritura de dominio del coach lleva su `coach_id` en el WHERE — muere el patrón «el coach» por `order by id limit 1` (capacity, sesión, eventos, chat, plantillas de recuperación) y el check-then-act (la propiedad viaja DENTRO del WHERE de cada UPDATE, no en un select previo). Los ids que manda el CLIENTE (week_template_ids, exercise_id de segmentos/bloques, min/max_level_id) se validan contra el coach antes de escribir; nonexistente y ajeno reciben la MISMA respuesta. El funnel público (leads/waitlist, sin columna de club hasta la obra 3) se atribuye vía `FUNNEL_COACH_ID` (env) con fallback al pick legacy `min(id)` — resuelto en UN solo sitio (`web/lib/leads/funnel-coach.ts`) que muere cuando `leads` gane `coach_id`. Hallazgo que lo motivó: en producción el `limit 1` apuntaba al coach id=4 (fila de dev, cap=100), no al club real (60) — el cupo que el club editaba en Disponibilidad ni siquiera era el suyo.

**Se descarta:** hardcodear el id del club del funnel en código (va en env, y es transitorio); y el barrido de `subscriptions` por `user_id+status` en las bajas — se clava a la fila concreta (subscriptions no lleva club hasta la obra 4).

**En consecuencia, no hacer:** no volver a resolver «el coach» de forma implícita en ninguna query nueva (si no hay sesión, la atribución es una decisión explícita, no un `limit 1`); no añadir superficies nuevas que lean cupo/waitlist sin pasar por `funnelCoachId`; y al desplegar, definir `FUNNEL_COACH_ID` con el club real (documentado en `.env.example`).

---

## 2026-07-27 · La propiedad de un template pasa a ser coach O atleta (migración 0141)

**Decidido:** `templates.coach_id` deja de ser NOT NULL. El dueño de un template es el coach (`coach_id`, biblioteca y contenido suyo) **o** el atleta (`instance_athlete_id`, la instancia per-atleta de 0083) — el check `templates_owner_chk` exige al menos uno. Motivo: el entreno libre persiste como template-instancia + asignación self-origin (modelo cerrado de `create-free-workout.ts`), y un atleta FREE no tiene coach; su instancia no tiene dueño coach y el NOT NULL de 0001 hacía imposible el tier free sin tocar el modelo. La biblioteca no cambia: una fila de biblioteca es `instance_athlete_id is null`, y ahí el check sigue obligando coach.

**Se descarta:** colgar los templates free de un coach real (contamina la propiedad, acopla el free a una cuenta concreta y mete marca en el código) y cualquier camino de persistencia alternativo para el libre free (habría partido el modelo de ejecución en dos).

**En consecuencia, no hacer:** no insertar jamás un template con ambos dueños null (el check lo impide); no añadir predicados de coach a los hydration-joins de instancias (el id llega por FK de una fila ya scoped); y no reintroducir el 422 `no_coach` en el grabador libre — con coach se notifica (attention), sin coach simplemente no hay a quién, y el aviso es best-effort accesorio, nunca contrato.

---

## 2026-07-27 · El alta free CREA cuenta — pero solo detrás de FREE_SIGNUP, y el login sigue siendo find-only

**Decidido:** el signup del tier free invierte la decisión «LOGIN NEVER CREATES» en los dos caminos de atleta (código por email y Sign in with Apple), pero SOLO cuando `FREE_SIGNUP=1` (producción no define la variable → comportamiento actual intacto). La creación vive en UNA función (`web/lib/auth/free-signup.ts#createFreeAthlete`), compartida por ambos caminos: crea `users` + `athletes` con `coach_id` NULL (nullable desde 0001), converge sobre una cuenta existente solo con email PROBADO (buzón que recibió el código, o `email_verified` de Apple), rechaza cuentas sin fila de atleta (un coach jamás recibe una identidad de atleta por el alta free) y jamás re-apunta un `apple_user_id` ajeno. Todas las respuestas que emiten el shape de sesión de atleta (verify, apple, invite/redeem, partner/redeem) llevan ahora `has_coach` (aditivo, derivado de `athletes.coach_id`).

**Se descarta:** la migración `0141_athlete_birth_date.sql`. La fecha de nacimiento YA existe: `athletes.dob date` desde `0001_init.sql:143`, escrita y validada por `PATCH /api/athlete/profile` y leída por iOS. Una columna `birth_date` habría duplicado el concepto con dos fuentes de verdad. Las divisiones por edad del ranking free se derivan de `dob`.

**En consecuencia, no hacer:** no crear ninguna columna nueva de nacimiento; no añadir un segundo camino de creación de atletas fuera de `createFreeAthlete` (las reglas anti-takeover viven ahí); no condicionar `has_coach` al flag (es señal aditiva para todos); y no rellenar `dob`/`sex` con placeholders en el alta — quedan NULL hasta que el atleta los dé en onboarding.

---

## 2026-07-27 · El check-in del atleta se enseña al coach ESPEJADO y con una sola banda de riesgo

**Decidido:** el contenido del check-in diario (las 5 respuestas, la nota, la bandera adaptativa) se pinta al coach en la ficha del atleta (Plan, bajo el tile de Readiness) y como chip de roster. Tres reglas de dominio, no de estética: (1) **espejado exacto** — soreness y fatigue se almacenan invertidas (5 = peor) pero el atleta respondió preguntas positivas («Recuperación muscular», «Energía»); toda superficie de coach muestra el valor YA girado (5 = mejor, siempre), y la inversión vive en UN sitio (`web/lib/dashboard/coach/checkin-presentation.ts`). (2) **Una sola banda de riesgo** — el umbral del chip (<40) es la MISMA constante que dispara la regla adaptativa de `lib/sync/checkin.ts`; jamás dos números que deriven por separado. (3) **Frescura honesta** — «hoy/ayer/hace N días» se resuelve en la zona horaria del atleta; un check-in viejo se muestra fechado y atenuado, y el chip de roster solo existe para el check-in de HOY (uno malo de ayer no pinta nada); los huecos de la racha de 7 días son huecos, nunca ceros.

**Por qué:** el dashboard calculaba `checkin_sub_score` y no lo pintaba nadie — el coach no tenía NINGUNA ventana a cómo se encuentra el atleta (solo la señal indirecta de «sin check-in ≥48 h»). Y el precedente de mensajes demostró que decidir «hoy» en la zona del servidor rompe en el filo de medianoche.

**Se elimina:** `GET /api/coach/athletes/[id]/readiness-breakdown` — endpoint de la era del side-panel de /hoy, huérfano (cero consumidores; solo lo citaban los types generados de `.next`). El desglose del readiness del atleta vive en su endpoint propio (`/api/athlete/readiness/today`); la ventana del coach es este panel + el tile de Readiness. También mueren los campos planos `checkin_sub_score`/`last_checkin_at` del `AthleteResumen` (nacieron sin consumidor), sustituidos por el bloque `checkin` completo + `checkin_week`.

---

## 2026-07-27 · El readiness de HOY se computa al leer y al ingerir — no hay scheduler diario

**Decidido:** el snapshot diario de readiness no tiene (ni tendrá) un cron que lo genere. Se materializa por dos vías: (1) la lectura del propio atleta (`getAthleteReadinessToday`) computa y persiste SIEMPRE el día de hoy en su zona horaria — con fallback honesto al último snapshot guardado, fechado como lo que es, cuando hoy no hay señal alguna; (2) la ingesta de datos (batch HealthKit, check-in) recomputa el snapshot de hoy ANTES de responder, para que las superficies del coach — que leen snapshot guardado (`getLatestReadiness`, sin compute) — reflejen el dato recién llegado sin esperar a que el atleta abra la app. Se elimina el self-heal `isLegacyBreakdown` (el compute-en-lectura lo subsume).

**Por qué:** el modelo anterior asumía que "algo" crearía el snapshot de cada día, pero ese algo no existía: solo computaba el compute-on-miss del primer día de vida del atleta (y el contexto de la IA del coach, incidentalmente). Resultado real: la hoja del atleta enseñó 11 días un snapshot del 16-jul nacido además en carrera con su primer sync (el sueño se ingirió 9 s después de computar; el HRV, 80 s después). Un cron diario tendría el mismo defecto de fondo — computa a una hora fija con los datos que haya, y el sueño/HRV llegan cuando el iPhone sincroniza; computar en el momento del dato y en el momento de la lectura es lo único que no puede quedarse viejo.

**En consecuencia, no hacer:** ninguna superficie debe leer `athlete_daily_readiness_snapshots` esperando que exista la fila de hoy (puede no existir si nadie sincronizó ni leyó); los lectores del coach siguen en `getLatestReadiness` y muestran el último con su fecha. Y ningún compute nuevo debe depender de "ya habrá un job que lo refresque": el refresco viaja con el dato o con la lectura.

---

## 2026-07-27 · La cola offline del iOS entrega at-least-once: drain con veneno fuera y TTL

**Decidido:** `RequestQueue` (iOS) deja de ser solo captura durable y pasa a entregar: AppShell drena FIFO al arrancar, al volver al primer plano y al rotar el bearer, reenviando los bytes originales con el token VIVO (no el capturado). Un 2xx entrega; un 4xx determinista (no 401) es veneno y se descarta — igual que en el gate de encolado; un 401 detiene el drain conservando todo (la sesión está muerta, la entrada no); offline/5xx reintenta en el siguiente drain. TTL de 72 h: más viejo no se reenvía.

**Por qué:** siete features (check-ins, ejecuciones, batches HealthKit, chat, onboarding…) encolaban sus fallos transitorios "para replay" y NADA drenaba la cola — captura durable sin entrega es pérdida de datos con pasos extra. Descubierto el 27-jul rastreando por qué ningún check-in de ningún dispositivo había llegado jamás a `daily_checkins` (los únicos existentes, atletas 66/67 del 9–22 jul, fueron sembrados a mano — mismo `created_at`). El TTL existe porque un check-in o un entreno de hace días aterrizando de la nada distorsiona el "qué ha pasado esta semana" del coach más de lo que aporta.

**En consecuencia, no hacer:** ninguna feature nueva debe encolar en `RequestQueue` cuerpos que no sean re-enviables tal cual (bytes ya codificados, endpoint idempotente o tolerable a duplicado ocasional — entrega at-least-once). Y ningún fallo determinista (4xx) debe entrar en la cola: se descarta en origen y, si importa, se traza en el servidor (el 400 del check-in ya deja `captureRouteError`).

**Decidido:** cualquier subida de ficheros (hoy, adjuntos del chat) va **directa del cliente al almacén** con una URL prefirmada de un solo uso que el servidor emite tras validar (tipo, extensión, tamaño, propiedad): `issueSignedToken` + `presignUrl` de `@vercel/blob`, atada a un pathname concreto, con tope de bytes firmado y caducidad de 30 min. Ruta: `POST /api/chat/upload-url`. La ruta multipart `/api/chat/upload` y el fallback a disco de desarrollo **se eliminan**.

**Por qué:** la plataforma corta el body de cualquier función en ~4.5 MB (`FUNCTION_PAYLOAD_TOO_LARGE`) ANTES de ejecutar nuestro código — probado contra producción el 27-jul (2 MB entra, 6 MB no). La arquitectura anterior recibía los bytes por multipart y los re-subía al almacén: prometía fotos de 30 MB y vídeos de 200 MB por una tubería que físicamente admite 4.5. Era el patrón equivocado desde la concepción; el estándar de la industria para ficheros grandes es la subida directa con URL prefirmada (S3 presigned y equivalentes).

**En consecuencia, no hacer:** ninguna feature futura de subida (fotos de perfil, vídeos de técnica, documentos) debe recibir los bytes en una ruta nuestra. Se valida la intención, se prefirma, y el cliente sube directo. La lectura sigue siempre detrás del proxy autenticado (blobs privados). Nota operativa: el tope real por tipo vive en `CHAT_ATTACHMENT_MAX_BYTES` y ahora SÍ es real (verificado un PUT de 120 MB en 12.6 s).

**Herencia:** los adjuntos enviados durante las dos eras rotas (disco efímero + multipart) son punteros muertos — 9 de los 10 mensajes históricos con adjunto (hilo 260). Los bytes no existen; no hay nada que recuperar.

---

## 2026-07-27 · El dashboard ES la app del coach: PWA + Web Push, no una app nativa

**Decidido:** la superficie móvil del coach es el propio dashboard instalado como PWA (manifest + service worker + Web Push con claves VAPID), con icono propio (FHP con banda COACH, `web/public/brand/fh-coach-*`). No se construye app iOS de coach ni "modo admin" en la app del atleta.

**Por qué:** un coach nativo duplicaría toda la superficie en un segundo stack — la misma enfermedad que acababa de costar el chat entero (dos implementaciones, y todos los bugs en la grieta). Y fuera del App Store solo hay TestFlight (caduca a 90 días) o ad-hoc (perfiles anuales): bombas de relojería para uso diario. La PWA se despliega como todo lo demás y Apple no interviene.

**En consecuencia, no hacer:** no arrancar un target iOS de coach. Si algún día se quiere coach nativo, será rol dentro de la app existente y DESPUÉS de que esté en el App Store — nunca como canal de avisos.

---

## 2026-07-27 · Un embudo de avisos, dos canales; "el coach" = los miembros del workspace

**Decidido:** `dispatchNotification` es el único embudo de avisos y reparte a los canales que existan por usuario: APNS (`apns_push_tokens`) y Web Push (`web_push_subscriptions`, espejo de la primera; endpoint único global = un navegador, re-suscribir reasigna al usuario actual). Y todo lo dirigido "al coach" se reparte a **los miembros activos de `coach_members`** (`coachRecipientUserIds`), con `coaches.user_id` solo como respaldo legacy.

**Por qué:** los avisos al coach iban a `coaches.user_id` — el usuario del club con el que ya nadie inicia sesión desde la cuenta unificada (16-jul). Ni push ni bandeja llegaban a Alex, Pablo o Gerard: se cazó al verificar el push en producción (la suscripción era del usuario 142 y el aviso salía hacia el 124).

**En consecuencia, no hacer:** ningún trigger nuevo debe resolver "el coach" con un join a `coaches.user_id`, ni enviar push llamando a un canal concreto: siempre `notifyCoach`/`dispatchNotification`. Y toda ruta nueva de aviso web debe salir de `webUrlForNotification` (testeada entera: un tipo que caiga en un 404 lo caza el test).

---

## 2026-07-26 · Un `import` dinámico que el empaquetador no ve NO existe en producción

**Decidido:** las dependencias declaradas en `package.json` se importan de forma **estática**. Nunca con `new Function('m', 'return import(m)')` ni con ningún otro truco para esquivar el análisis del empaquetador. Y un almacenamiento que falla **falla a la vista**: nada de `catch` mudo que caiga a un camino de respaldo silencioso.

**Por qué:** `@vercel/blob` se cargaba con ese truco "para que el bundler no lo metiera en el grafo". El bundler le hizo caso y en el despliegue el paquete no viajaba: el import reventaba en tiempo de ejecución, un `catch` vacío mandaba el fichero al disco temporal de la función serverless, y ese disco muere con la petición.

El resultado era el peor posible que puede tener un fallo: la subida contestaba **201**, el mensaje se guardaba con una URL de aspecto correcto, y el fichero no existía en ninguna parte. Nadie veía un error. Verificado el 26-jul contra el almacén de producción: **cero ficheros**, con siete mensajes en la base apuntando a ellos. En desarrollo no se reproduce nunca, porque ahí sí están los `node_modules` — por eso pasó semanas sin detectarse y por eso una verificación en local no bastaba.

**En consecuencia, no hacer:** no usar imports opacos al empaquetador para módulos que hacen falta en tiempo de ejecución. No dejar un camino de respaldo que produzca un resultado *plausible* cuando el principal falla: si el almacén no está, que la petición falle con un código claro. Un fallo ruidoso cuesta una tarde; uno silencioso cuesta semanas de datos.

**Y una regla de verificación:** las rutas que dependen de servicios externos se comprueban **contra producción**, no contra `next dev`. En local resuelve todo `node_modules` y no hay bundle: es justo el entorno donde este fallo es invisible.

**Dónde vive:** `web/lib/chat/upload.ts`, `web/app/api/chat/attachments/[...path]/route.ts`.

---

## 2026-07-26 · El chat es UNO, y su cursor es un id, nunca una hora

**Decidido:** existe **un solo módulo de chat** (`web/lib/chat/`) y una sola familia de rutas (`/api/chat/*`). El coach y el atleta escriben en el mismo hilo, así que comparten DTO, reglas de no-leídos, canal en vivo y tope de texto. Se borra el stack paralelo del dashboard (`web/lib/dashboard/chat/`, `/api/coach/chat/*`).

Además, **el cursor del chat es un id de mensaje**, no un `created_at`.

**Por qué:** el duplicado no era una copia inocente, era la causa de todos los fallos que se veían. El envío del coach no publicaba al canal en vivo (el móvil del atleta se enteraba al reabrir la pantalla), las consultas no leían las columnas de adjunto (la foto llegaba como burbuja vacía) y el tope de texto era distinto a cada lado del mismo hilo.

Lo del cursor es más sutil y salió probando contra una rama de Neon: **postgres.js recorta a milisegundos cualquier `timestamptz` que viaje como parámetro**, mientras que la columna guarda microsegundos. Un corte de `17:29:29.561668+00` llega a la base como `17:29:29.561+00`. Con el corte recortado hacia abajo, el propio mensaje del corte se quedaba fuera de un `created_at <= $1` — el mensaje más reciente del otro lado NUNCA llegaba a marcarse como leído — y paginar hacia atrás se saltaba en silencio todo lo que cayera entre el milisegundo y el microsegundo real. `id` es `bigint generated always as identity`: exacto, monótono y ya ordenado.

**En consecuencia, no hacer:** no volver a crear una capa de chat "para el dashboard" ni "para el coach": si una pantalla necesita algo distinto, es una proyección del mismo módulo, no un módulo nuevo. No pasar un `timestamptz` como parámetro para comparar contra una columna de fecha con precisión de microsegundos — ni aquí ni en ninguna otra parte del proyecto. No re-derivar quién escribió un mensaje del `sender_user_id`: miente en la cuenta donde el coach es también su propio atleta.

**Dónde vive:** `web/lib/chat/service.ts` (el módulo único), `web/lib/chat/pubsub.ts` (reparto por dueño del hilo, no por lista de hilos), `web/components/v2/chat/` (un componente `Conversation` para las dos pantallas), `infra/migrations/0136_chat_sender_role_not_null.sql`.

**Lo que se descartó por el camino:** una clave de idempotencia por mensaje (`client_msg_id`) que haría un reintento de envío incapaz de duplicar. Es lo correcto a largo plazo, pero adoptarla solo en web recrearía la asimetría que esta decisión elimina. Se hace cuando se toque el envío de iOS, y entonces en los dos sitios a la vez.

---

## 2026-07-27 · Marcas: tres puertas, un almacén — y el auto-test nunca recalibra

**Decidido:** el atleta puede probarse cuando quiera contra un catálogo CERRADO de 6 marcas que la app mide sola (1 km, Cooper 12 min y 5K por GPS/cinta FTMS; remo 500 m, remo 1.000 m y ski 1.000 m por PM5), y registrar a posteriori 3 distancias de carrera (10K, media, maratón) — a mano o eligiendo la actividad ya sincronizada del reloj. Todo cae en `athlete_benchmarks`, el mismo almacén que los tests del coach, con el origen en una columna tipada (`source`, mig 0139): `coach_test` recalibra el plan; `athlete_test` y `registered` registran y avisan, **nunca recalibran**.

**Por qué:** nadie sigue un plan al 100%. El día que el atleta se aburre o se lía, un catálogo a mano convierte el hueco de adherencia en un dato. Un solo almacén porque partirlo haría desaparecer al atleta auto-testeado de su propia progresión — y el que se auto-testea es el enganchado. La frontera de recalibrar existe porque la autoridad del plan es del coach: una marca mejor le llega como «marca nueva», no reescribe zonas en silencio.

**Reglas que no se negocian:** el catálogo es cerrado (identidad estable = analítica comparable, misma lección que la 0132 de ejercicios); en «Probarme» no se teclea nada — si la app no lo midió, no entra por esa puerta (para eso está Registrar); un abandono no guarda número; y **un 5K en cinta jamás bate al de calle** — el PR vive por contexto (`run_context`).

**En consecuencia, no hacer:** no añadir marcas de texto libre ni marcas que la app no pueda medir al menú de Probarme. No derivar zonas ni %1RM de un `athlete_test` sin confirmación del coach. No mezclar los PR de cinta y calle en ningún sitio.

**Dónde vive:** `shared/domain/athlete/marks.ts` (catálogo + validación + regla de PR, 11 tests), `web/lib/athlete/marks.ts`, `/api/athlete/marks{,/attempt,/register}`, `ios/FAHYBRIK/Marks/`, mig `0139_benchmark_source.sql`. Mockup: `docs/design/marcas-atleta-mockup.html`.

---

## 2026-07-26 · Pausar y darse de baja son autoservicio, y la pausa reserva la plaza

**Decidido:** el atleta pausa o se da de baja desde la app, sin que el coach confirme nada. La pausa **para el cobro** (`pause_collection` en Stripe, ya implementado) con un tope de **4 semanas en una ventana móvil de 12 meses**, contando días efectivamente pausados y no los solicitados. Mientras dura la pausa **la plaza se le reserva**: deja de liberarse a la lista de espera. La baja se aplica al final del periodo pagado y es reversible hasta ese día.

**Por qué:** se entra por entrevista y se paga por un link, así que la app nunca es el canal de compra — pero la salida no puede depender de que alguien devuelva una llamada. El dinero es del atleta y frenarlo no puede requerir permiso; en la UE, además, darse de baja no puede ser más difícil que contratar. El tope es lo único que justifica reservarle la plaza: sin límite, el cupo se llena de gente que no factura; sin reserva, pausar deja de tener valor y el atleta cancela en vez de pausar, que es la peor de las dos para el negocio.

**En consecuencia, no hacer:** no meter retención agresiva (descuentos, confirmaciones repetidas) en el camino de salida — el único dato que se le da es que no pierde lo que ya pagó. No dejar pausas sin fecha de vuelta: una pausa indefinida es una baja que nadie declara. No confundir baja con borrado de datos (RGPD, #19): son caminos distintos y el historial de un atleta de baja se conserva siempre.

**Contradice a propósito** el comentario de la migración 0104 (*"No cuenta para el cupo salvo activo"*) y a `releaseWaitlistToCapacity()` dentro de `pauseAthlete`: el pausado vuelve a contar para el cupo. `baja` sigue liberando plaza igual que hasta ahora.

**Dónde vive:** `docs/design/bajas-y-pausas-mockup.html` (pantallas y razonamiento), `shared/domain/coach/pause-budget.ts` (la aritmética), `web/lib/athlete/lifecycle-self-service.ts` (las transiciones del atleta), `web/lib/coach/athlete-lifecycle.ts` (las del coach), `infra/migrations/0137_baja_programada.sql`.

**Números concretos:** 28 días de pausa en una ventana móvil de 365. La ventana es móvil y no el año natural a propósito: por año natural, diciembre y enero encadenan un presupuesto doble.

---

## 2026-07-25 · La sim completa nunca va en fase Pico

**Decidido:** las dos ejecuciones de la sim completa van al principio y al final de la fase Ritmo. Pico queda limpio de esfuerzos máximos. La última sim, a catorce días de la prueba como mínimo.

**Por qué:** Pico son las dos últimas semanas y su función es llegar fresco. Un esfuerzo máximo de 60-70 minutos ahí contradice el único principio en el que coinciden todas las fuentes: el trabajo tiene que estar hecho dos semanas antes de competir.

**En consecuencia, no hacer:** no programar sim completa, tests máximos ni 1RM en Pico. Si el atleta llega con dudas sobre su ritmo, se resuelve con una sim parcial en Ritmo, no acercando el esfuerzo a la carrera.

---

## 2026-07-25 · El aeróbico manda en la semana

**Decidido:** la mayoría de los días de la semana tocan trabajo aeróbico, en todas las fases. La fuerza tiene dos huecos protegidos y el día de sled cuenta como uno de ellos.

**Por qué:** correr es casi la mitad del tiempo de carrera en atletas Pro y hasta el 59% en recreativos. La proporción del entrenamiento sigue a la proporción del evento. Sin esta regla, los topes por tipo permitían montar una semana mitad running mitad fuerza, que contradice tanto la aritmética del evento como el consenso del sector.

**En consecuencia, no hacer:** no construir semanas donde la fuerza y las estaciones igualen o superen a los días de aeróbico. Y no sumar los topes máximos de cada tipo: son techos teóricos, no un plan — suman 27 sesiones para 6 huecos reales.

---

## 2026-07-25 · Techo de 150 m de sled por sesión

**Decidido:** máximo 150 metros de sled por sesión, calentamiento incluido. Desde la fase Ritmo, el push y el pull van en sesiones distintas.

**Por qué:** por encima de ese volumen el trabajo degenera en pasar metros en vez de empujar con intención, que es justo lo que lo hace útil. A 3×50 m (la distancia de carrera) el presupuesto ya está agotado.

**En consecuencia, no hacer:** no calentar el sled con el propio sled en fases avanzadas — el calentamiento se hace con trabajo general.

---

## 2026-07-25 · Las fuentes externas se usan para contradecir, nunca para aportar contenido

**Decidido:** el material de terceros (vídeos, artículos, planes ajenos) se usa exclusivamente para buscar puntos ciegos y contrastar dónde nos separamos del consenso. Nunca como fuente de contenido del método.

**Por qué:** si el contenido ajeno moldea la metodología, derivamos hacia "lo que hace todo el mundo", que es exactamente lo que nos quita identidad. El método se deriva de las exigencias del evento, que no son de nadie.

**En consecuencia, no hacer:** no incorporar una sesión, un volumen o una regla porque lo diga una fuente externa. Si algo de fuera parece bueno, hay que poder derivarlo de una exigencia de la prueba — y si no se puede, no entra.

---

## 2026-07-25 · La metodología es contenido, no schema

**Decidido:** la metodología propia de FAHYBRID (reglas, fases, catálogo de sesiones, progresión, ajuste diario) se define como contenido documentado, no como entidades nuevas en base de datos.

**Por qué:** el sistema es agnóstico por diseño. Meter las fases o el catálogo como tablas volvería a acoplar el producto a una metodología concreta, que es justo lo que se deshizo en las migraciones 0064 y 0068.

**En consecuencia, no hacer:** no crear tablas de fases, de tipos de sesión ni de macrociclos. Si hace falta que el producto ejecute estas reglas, se implementan como lógica sobre las entidades que ya existen (`program_month_templates`, `program_sequences`, `methodology_groups`).

**Dónde vive:** `docs/methodology/` — la puerta de entrada es `manual.html`.

---

## 2026-07-25 · Todo el trabajo se commitea

**Decidido:** ninguna pieza de trabajo se queda fuera de git, y `FOCUS.md` se actualiza en el mismo commit.

**Por qué:** Alex usa mentalOS, que lee disco y git para servirle el estado al móvil. Lo que no está en git, para él no existe. Y el trabajo que no queda reflejado se pierde y se rehace.

**En consecuencia, no hacer:** no dejar trabajo terminado solo en el scratchpad ni solo como artefacto publicado. Los artefactos HTML se copian a `docs/` y se enlazan desde `FOCUS.md`.

---

## 2026-07-25 · La cadencia de tests la fija el sistema, no el coach

**Decidido:** la batería de calibración son cuatro pruebas (5K, remo 2K, batería de 1RM, media simulación de HYROX). Una prueba solo entra en la batería si su resultado se traduce en un número que después se usa para prescribir.

**Por qué:** medir por medir consume sesiones y fatiga sin cambiar ninguna prescripción.

**En consecuencia, no hacer:** no añadir pruebas sin declarar qué prescriben. Composición corporal y screening de movilidad quedan deliberadamente fuera por no tener ese camino.

**Dónde vive:** `shared/domain/coach/test-battery.ts` (ya en producción) y `docs/methodology/test-battery-reference.html`.

---

## Anteriores (reconstruidas del historial de migraciones)

Estas decisiones ya estaban tomadas y ejecutadas, pero no constaban en ningún sitio legible. Se documentan ahora para que nadie las rehaga.

### Migración 0064 · No existe la entidad "fase"

**Decidido:** se elimina el catálogo de fases creado en la 0052. El **orden de los microciclos ES la periodización**.

**En consecuencia, no hacer:** no reintroducir una tabla de fases. Una fase es el nombre y la duración de una plantilla mensual más su posición en la secuencia.

### Migración 0068 · ATR nunca es del sistema

**Decidido:** se retira el motor de macrociclo ATR. La periodización por bloques es contenido del coach, no una estructura del producto.

**En consecuencia, no hacer:** no hardcodear ATR ni ninguna otra escuela de periodización como enum o entidad. Efecto colateral conocido: `infra/scripts/seed_methodology_rules.ts` quedó muerto al desaparecer el motor.

### Migración 0053 · La modalidad es propiedad del ejercicio

**Decidido:** la modalidad (correr, ergo, fuerza, funcional) es intrínseca al ejercicio, no un campo de la prescripción.

**En consecuencia, no hacer:** no permitir que una prescripción declare una modalidad distinta a la de su ejercicio.

### Migración 0132 · Los ejercicios se forkean por voz, no por identidad

**Decidido:** cuando un coach modifica un ejercicio base, se forkea su *voz* (nombre, cues, descripción, vídeo), no su identidad. El slug es único global a propósito.

**En consecuencia, no hacer:** no duplicar la identidad del ejercicio al personalizarlo — rompería las analíticas comparables entre atletas.

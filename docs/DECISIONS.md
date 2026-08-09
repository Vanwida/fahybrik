# DECISIONES — FAHYBRID

Registro de decisiones estructurales del dominio y de la arquitectura.

**Para qué existe:** en julio de 2026 tuvimos que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y un par de migraciones que habían creado y luego eliminado una entidad, sin que en ningún sitio constara el porqué. Este fichero evita que vuelva a pasar.

**Cuándo se escribe aquí:** siempre que se tome una decisión que condicione el dominio o el modelo de datos, y muy especialmente cuando se **elimina o se descarta** algo. Lo que se borra sin dejar rastro es lo que alguien reconstruye seis meses después.

**Formato:** una entrada por decisión. Qué se decidió, por qué, y qué NO hacer en consecuencia.

---

## 2026-08-09 · El umbral de una señal es MÉTODO — `coach_signal_thresholds` es su sitio

**Decidido:** lo que el coach le publicó y el atleta no ha cerrado sube a **/hoy
como señal** (`coach_attention_items`), con tres tipos nuevos —
`communication_question_unanswered`, `communication_task_overdue`,
`communication_protocol_unopened`— y **los días que deciden cuándo saltan son
dato editable del coach**, no constantes. Nace la tabla
`coach_signal_thresholds` (mig 0161, una fila por coach, columnas explícitas) y
los defectos viven en `shared/domain/coach/signal-thresholds.ts`, **nunca como
`default` de columna**. El barrido resuelve los vigentes UNA vez por coach
(`web/lib/coach/signal-thresholds.ts → resolveEffectiveThresholds`) y se los pasa
a los evaluadores: para eso el tipo se llamaba ya `EffectiveThresholds`.

**Por qué:** que una pregunta sin responder reclame lo dice el modelo del
comunicado (se cierra respondiendo) y eso es mecanismo. Cuántos días de silencio
hacen falta antes de molestar al coach lo hace distinto cualquier otro entrenador
competente, así que es método (HARD RULE Nº0). Y sin la señal, un comunicado
publicado y nunca cerrado se queda esperando en la ficha de un atleta entre cien
— exactamente el «push perdido» que la entidad venía a resolver.

**Decisiones de modelo que tomó esta tanda:**
- **La severidad se deriva del modelo, no de otro umbral.** Una pregunta que
  `blocks` es crítica (deja el plan a medio cerrar); un protocolo cuyo evento es
  HOY es crítico (o lo abre hoy o no lo abre); una tarea vencida sube a crítica
  con el retraso que fija el coach. Ningún número mágico extra.
- **Una tarea vencida dispara sin umbral**: vencer ya es la señal. Lo editable es
  cuándo el retraso deja de ser un despiste.
- **Sin fecha resoluble, el protocolo no dispara.** La fecha del ancla se busca
  contra el evento del PROPIO atleta (su carrera planificada o su sesión de test
  ya puesta en el plan) y, si `anchor_ref` nombra uno concreto, se exige ese. Un
  ancla que no resuelve no es una señal con fecha aproximada: es no-señal.
- **Pasado el evento, la señal se resuelve sola:** un protocolo de día de carrera
  con la carrera detrás ya no puede hacerse.
- **Agregan por atleta** (la tarjeta de /hoy es una por atleta y señal): se cita
  al que manda —la pregunta más antigua, la tarea más atrasada, el evento más
  próximo— y se dice cuántos más hay. El `dedupe_key` lleva el id de ese
  comunicado, así que uno nuevo tras silenciar el anterior no queda tapado.

**En consecuencia, no hacer:** no volver a escribir un umbral de señal como
`const` — el sitio ya existe, se le añade columna. Y no leer las tres claves
desde `SIGNAL_THRESHOLDS` en una superficie: los vigentes se piden a
`resolveEffectiveThresholds`, o el /hoy del coach y su editor discreparán.

**Estado:** el resto de umbrales de `signal-config.ts` siguen siendo constantes
del sistema y se moverán columna a columna cuando dejen de ser aceptables.
**Falta la pantalla de ajustes**: hoy los umbrales se editan por
`GET|PUT /api/coach/signal-thresholds` y nada más — el mismo estado en que quedó
`coach_import_defaults` (0149), que tampoco tiene UI. La migración 0161 **no está
aplicada**; sin ella el resolutor sirve los defectos y nada se rompe.

---

## 2026-08-09 · La biblioteca de comunicados vive dentro de Biblioteca

**Decidido:** las plantillas y los borradores de comunicado son una pestaña más
de **Biblioteca** (`/biblioteca?tab=comunicados`), junto a ejercicios, bloques,
sesiones y microciclos — no una sección de raíl propia. Y el **compositor es uno
solo**: deja de recibir un atleta fijo para recibir `destinatarios[]` y un `modo`
(`publicar` | `plantilla`), así que la ficha del atleta (un destinatario) y la
Biblioteca (N destinatarios elegidos, o ninguno cuando se escribe un molde) usan
el MISMO componente.

**Por qué:** duplicar el compositor era garantizar que las dos copias se
separasen a la primera regla nueva de un tipo. Y una plantilla es contenido
reutilizable del coach, que es literalmente la definición de lo que vive en
Biblioteca.

**En consecuencia, no hacer:** no publicar nunca una plantilla. Publicar desde
una plantilla escribe una COPIA (`is_template:false`) y publica esa; un borrador
sí reusa su id. Lo impone además el CHECK `coach_communications_template_chk`, y
la UI no puede ser la que lo descubra.

---

## 2026-08-09 · El comunicado del coach: la comunicación estructurada es una entidad, no chat

**Decidido:** todo lo que el coach entrega al atleta fuera de una sesión se
modela como UNA entidad, el **comunicado**: **tipo** (protocolo con pasos
marcables | pregunta con opciones que bloquea | tarea con fecha límite |
nota-briefing por secciones | foco persistente) × **ancla** (plan | semana |
sesión | test | carrera | check-in | general; el ancla decide dónde aflora en
la app) × **ciclo de vida** (publicado → visto → hecho/respondido, no solo
`read_at`). La frontera con el chat: **el chat conversa; el comunicado se
publica y se rastrea.**

**Por qué:** hoy todo lo no-sesión viaja por `chat_messages.body` (texto plano,
sin tipo, sin estado, sin cumplimiento) y el repo acumula piezas a medio nacer
que son este mismo concepto sin nombre: `race_plans` (0008, tabla muerta sin un
solo lector), `WorkoutPlan.warmupChecklist` en iOS (renderer hecho, llega
siempre vacío), `coach_guidance` (consejos de primera clase pero solo 2
contextos de dobles), el `coach_note` por bloque que el coach escribe y
`assignment-detail` descarta, `recovery_suggestions` que el servidor emite y
iOS no decodifica — y ninguna bandeja del atleta: un push perdido es un mensaje
perdido.

**En consecuencia, no hacer:** no construir cinco features paralelas (una por
tipo) ni un segundo chat. Cuando se construya la entidad, **absorbe en vez de
sumar**: `race_plans` = nota+protocolo anclados a carrera (y la tabla muerta se
elimina); el protocolo de un test deja de viajar como texto copiado a
`templates.coach_notes`; `warmupChecklist` se alimenta de un protocolo; la
respuesta estructurada a un check-in o a un dolor es un comunicado anclado a
ese evento; `coach_guidance` se generaliza dentro del modelo o se absorbe.

**Dónde vive en el dashboard (corrección de Alex, mismo día):** NO hay pestaña
global de comunicados. Con 100 atletas, el coach piensa en EL atleta, no en la
feature: el seguimiento (qué le comunicó y qué hizo con ello) vive en la
**ficha del atleta**, el compositor se abre desde ahí (personalizando desde
plantilla o en blanco), la **biblioteca** de plantillas vive dentro de
Biblioteca como el resto de contenido reutilizable, y lo que reclama atención
(pregunta sin responder, tarea vencida, protocolo sin abrir) entra en **/hoy
como señal** de `coach_attention_items`, con umbrales como dato del coach.
**No hacer:** no añadir una sección de raíl que obligue a buscar un nombre
entre cincuenta; la vista global del mockup original queda descartada.

**Estado:** dirección validada por Alex sobre el doble (9-ago). **Cimiento
construido el mismo día** — migración `0160_coach_communications` aplicada
(cuatro tablas: comunicado · items · destinatarios · marcas de paso), vocabulario
y validadores en `shared/domain/coach-communications.ts`, servicios en
`web/lib/coach|athlete/communications.ts` y los endpoints de coach y atleta. La
página del dashboard (ficha del atleta + compositor de formulario puro, SIN
IA-redacta por decisión de Alex) y la app iOS siguen **por construir**.

**Decisiones que tomó el cimiento (mecanismo, no método):**
- **Una sola tabla hija** para pasos de protocolo, opciones de pregunta y
  secciones de nota: las tres son una lista ORDENADA de contenido del coach, y
  partirlas en tres sería el mismo modelo escrito tres veces.
- **`done_at` de un protocolo se DERIVA de sus pasos marcados** (hecho cuando no
  queda ninguno sin marcar; desmarcar uno lo reabre) y el «hecho» explícito marca
  todos los pasos. Un hecho declarado por un lado y unos pasos a medias por otro
  serían dos verdades del mismo hecho.
- **Una pregunta se cierra respondiendo**, nunca con «hecho»; una nota y un foco
  no se cierran (leerlos ERA el acto). Pedir «hecho» sobre ellos es un 409.
- **`blocks` es columna** (solo en preguntas): la pregunta que bloquea el plan ya
  la dibuja el doble y no puede vivir fuera del modelo.
- **Un comunicado del que no eres destinatario responde 404, no 403:** un 403
  confirmaría que ese id es de alguien.
- **Editar solo borradores y plantillas**, y siempre el comunicado entero:
  cambiarle el suelo a quien ya marcó tres pasos es corromper su historial.
  Borrar un borrador lo borra; borrar lo publicado lo ARCHIVA.
- **Publicar valida el roster entero o falla entero:** publicar «a casi todos» en
  silencio es peor que fallar.
- **La lectura de la FICHA es `GET /api/coach/communications?athlete_id=NN`** —
  lo comunicado a ESE atleta con su estado y los pasos que lleva marcados,
  archivados incluidos (la ficha es historial, no bandeja). Un atleta que no es
  del coach responde 404: una lista vacía diría «no le has comunicado nada».

**Dónde vive:** la tanda «Del coach» del doble — `web/components/design-twin/coach-com/`
+ `screens/coach-bandeja|coach-pregunta|coach-protocolo|coach-nota` — con el
caso real del plan rehecho a Singles Pro como escenario.

---

## 2026-08-09 · El payload de un aviso se guarda como OBJETO, no como cadena

**Decidido:** todo `notifications.payload_json` se escribe con `sql.json(objeto)`.
Nunca con `${JSON.stringify(objeto)}::jsonb`.

**Por qué:** con la segunda forma postgres.js tipa el parámetro como jsonb por el
cast y vuelve a serializar la cadena, así que la columna acaba guardando un jsonb
de **tipo string** (`"{\"kind\":…}"`). Consecuencia: `payload_json->>'clave'`
devuelve **NULL siempre**. Se descubrió construyendo el comunicado (el aviso se
escribía bien pero no se podía consultar por su `communication_id`) y dejaba
muertos dos anti-spam reales: `lib/citas/reviews.ts` reproponía la misma revisión
1:1 indefinidamente (su propio test estaba en rojo) y el de
`lib/notifications/triggers.ts` no deduplicaba el aviso de check-in saltado.
Además la bandeja del dashboard (`lib/dashboard/notifications/inbox.ts`) tipa
`payload_json` como objeto y recibía una cadena. Es la misma trampa ya anotada
para los adjuntos del chat.

**Hecho:** corregidos el embudo (`lib/notifications/dispatch.ts`, por donde pasa
todo aviso con push) y `lib/citas/reviews.ts`. Test de regresión en
`web/tests/notifications/payload-shape.db.test.ts`.

**Hecho también (mismo día):** los siete sitios restantes con la misma trampa
sobre `notifications.payload_json` — `lib/coach/intake.ts`,
`lib/coach/mass-adjustments.ts`, `lib/partner/cascade.ts`,
`lib/dashboard/coach/doubles-pairs.ts`,
`lib/dashboard/coach/monthly-block-proposal.ts`,
`lib/athlete/account-deletion.ts`, `lib/stripe/notifications.ts`. Las filas
ANTIGUAS siguen guardadas como cadena: ningún lector las recuperaba ya, así que
no hay backfill que hacer.

**Pendiente (auditoría aparte, lectores propios):** las DEMÁS columnas jsonb
escritas con `JSON.stringify(...)::jsonb` fuera de `notifications` —
`intake_notes_json` (lib/coach/intake.ts), `audit_log.diff_json` y las columnas
propias de `coach_mass_adjustments` (scope/payload/targets/prior). Ahí el
lector puede estar contando con la forma doblada: hay que verificar lectura y
escritura JUNTAS antes de tocar, o se repite el bug de los adjuntos al revés.

---

## 2026-08-09 · El bisel dibuja la ESTRUCTURA, y la fase manda sobre el rol

**Decidido (1) — el aro del reloj es la parte entera que se corre, no la cuenta
de series.** Un arco por tramo, en orden, con dos ejes y ninguna excepción: el
**hue** dice QUÉ ES el tramo (trabajo naranja, recuperación gris) y el **brillo**
dice DÓNDE ESTÁS (hecho / en curso / por venir). Hasta hoy el aro contaba sólo
las piernas de trabajo y, al entrar la recuperación, se cambiaba por un aro que
drena: la mitad del entreno no existía en el bisel y la referencia de por dónde
ibas desaparecía justo en el tramo en el que hay tiempo para mirarla.

**El ancho de cada arco, por orden de evidencia** (`FormaDelAro.pesos`): si se
saben los segundos de TODOS los tramos —escritos, o los metros a un ritmo
escrito, incluida la banda que el servidor ya resolvió contra el benchmark del
atleta— pesa por segundos; si no, y todos van por distancia, pesa por metros; si
no, todos pesan igual. **NO hacer:** inventar un ritmo para poder estimar. Un
arco promete «esto es esta parte de lo que queda» y estimarlo con un número que
nadie escribió es la pantalla que se inventa los datos.

**Por FASE y no por bloque:** un calentamiento de 10' junto a cinco de 800 m es
una sola cosa en marcha pegada a una estructura; mezclarlos en el mismo aro se
come la resolución de la serie, que es lo que de verdad se mira corriendo. Una
fase de un solo tramo no es una estructura: ahí sigue mandando el aro continuo.

**Una sola regla de reparto para las dos vías:** el móvil manda la forma por el
cable (`MirrorTramo.forma`) calculada con la MISMA función que usa el reloj en
solitario. Dos vías que dibujan el mismo entreno no pueden tener dos reglas.

**Decidido (2) — la FASE manda sobre el ROL también al contar series.** Un
calentamiento es una pierna de trabajo, así que contando por rol un «10' + 5×800»
anunciaba «Serie 1 / 6» mientras el atleta trotaba para entrar en calor.
`RunLegDisplay.serie` cuenta sólo la parte principal, y cada parte se llama por
su nombre («Calentamiento», «Vuelta a la calma») en vez de fingir un número. Es
la misma regla que ya gobernaba el constructor (`tramosDelEntreno()`): cuando un
fallo aparece dos veces en dos sitios, lo que está mal es la regla, no el sitio.

**Alcance, dicho explícito:** fuerza, ergo y el reloj de pared siguen con el aro
segmentado por repeticiones — ahí los trozos SÍ son iguales y el «off» es un
descanso que no se ejecuta, no un tramo con su zona y sus metros.

---

## 2026-08-09 · El constructor de correr habla la gramática, y el color es un dato

**Decidido (1) — un entreno de correr se MONTA, no se rellena.** El constructor
libre pasa de un formulario de bout («N × la misma dosis + descanso parado») a
la gramática que el motor ya ejecutaba: `FreeRunPlan` = calentamiento? · lista
de bloques (cada uno con su «repetir ×N» y sus tramos) · vuelta a la calma?, y
cada tramo con rol × medida × objetivo × modo de recuperación × cuesta.

**Por qué la lista de BLOQUES y no un solo grupo:** con un grupo entran la
serie, el fartlek, la pirámide y el progresivo, pero no «60' suave + 6×30"
fuerte», que son dos cosas distintas en el mismo entreno. Es exactamente la
profundidad 2 que la gramática permite, sin pedirle al atleta que maneje un
árbol.

**Correr no pasa por el paso «Formato»:** su esquema (rodaje o serie) lo deduce
el plan. Elegir antes una etiqueta que el plan puede desmentir es una pregunta
sin respuesta correcta.

**En consecuencia, NO hacer:** no preguntar por el rol para saber qué es el
entreno — un calentamiento también «se corre» y contarlo como trabajo hacía que
la card de un 4×1000 a Z4 anunciara «10 min · Z2», y dejaba empezar un plan que
era sólo calentamiento. La FASE manda (`tramosDelEntreno()`).

**Decidido (2) — la zona es un sujeto, y el color un dato.** Se añade el
mecanismo que faltaba para poder pintarlo: DÓNDE de tu banda estás
(`hrZonePosition` / `HRZoneProfile.posicion`), 0…1 más la zona hacia la que
subes. «Z3» a 152 y a 159 dice lo mismo y uno de los dos está a un latido de Z4.
El lienzo de la muñeca se llena del hue de tu zona hasta esa fracción y su borde
deriva hacia el de la siguiente.

**Es MECANISMO, no método:** las bandas las pone el coach y esto sólo dice en
qué punto de la suya está el atleta; cambiarlas no toca una línea. Y la regla de
honestidad no se toca: sin ancla de FC no hay zona, y sin zona no hay página ni
color. En la última zona el degradado se queda en su propio color en vez de
prometer una sexta.

---

## 2026-08-09 · Correr: una sola gramática de tramos, y la recuperación se MIDE

**Decidido (1) — el esquema no decide nada; la modalidad sí.** Una prescripción
de CORRER que describe más de un tramo se despliega a piernas
(`RunPiernasDerivadas.swift`, antes `RunSeriesDeSets.swift`), la haya escrito la
gramática nativa (`structure`), la tabla de `sets` del coach, o las rondas de
`intervals` del constructor libre. Hasta hoy la tercera no producía tramos y
caía al motor rotativo binario trabajo/descanso, que no tiene cursor: el mismo
entreno se ejecutaba de dos maneras según quién lo hubiera escrito.

**Dónde se para, y por qué ahí:** sólo `sets` (tabla de ≥2 filas) e `intervals`
(`rounds > 1` con UNA dosis). El EMOM lo gobierna su minuto y la tabata su
20/10 — los dos tienen motor propio y traducirlos los mataría, porque
`onEnterSegment` da precedencia al cursor de tramos. `rounds` (presentación
fija) tampoco: ahí la lista son ESTACIONES —la ruta de un HYROX sim, un
chipper— y no repeticiones de un mismo tramo.

**Decidido (2) — una recuperación de correr no es un descanso.** Sólo
`recoveryMode == .parado` para de verdad (`RunLeg.recuperaEnMovimiento`).
Cuando el modo NO SE SABE —que es lo que llega hoy de las dos fuentes
derivadas, porque ninguna lo escribe todavía— se MIDE lo que pase en vez de
suponerlo: el crono del tramo sigue corriendo (`WorkoutSession.tramoMide`), el
GPS sigue sumando y la muñeca pinta el ritmo del trote. Si el atleta se queda
quieto, el GPS dice cero y no se pinta ningún ritmo — no se afirma nada falso.

**Por qué NO el default contrario:** dar por hecho «parado» también es una
suposición, y encima es la que tira dato real. El diseño viejo la tenía
cableada («de pie, jadeando y mirando el reloj», `GuionSeries`): congelaba el
cronómetro del tramo y dejaba de pintar metros durante el trote de vuelta, que
en una serie de calle es la mitad del volumen de carrera y lo que distingue una
serie bien hecha de una mal hecha. Medir no inventa; suponer, sí.

**En consecuencia, NO hacer:** no repartir pantallas de correr por
`presentation` (el reparto por formato mandaba las series libres al RELOJ DE
PARED, el guion de burpees y planchas, sin metros ni ritmo y en modo ciego);
corriendo manda lo que el reloj MIDE. Y no volver a poner los metros en cubos
gruesos en el espejo: el emisor ya está capado a una trama por segundo, así que
el cubo de 10 m no ahorraba nada y a ritmo de carrera clavaba el numeral tres
segundos antes de pegar un salto de diez.

---

## 2026-08-09 · La gramática hablaba UN dialecto — y «verde» tenía que dejar de ser gratis

**El hallazgo.** Alex trajo su propio plan de 95 días y preguntó qué pasaría al
importarlo. Medido, no estimado: de 25 líneas reales, **4 entraban limpias**. Lo
grave no eran los fallos sino los aciertos a medias — la misma serie con el
descanso escrito de siete formas estándar, y sólo `c/2'30"` (la notación de un
coach concreto) lo capturaba; `rec 150s` y `(rec 2:30)` salían **verdes tirando
el descanso**, y `, rec 2:30` tumbaba la línea por culpa de una coma. Un
descanso no es adorno: separa un 6×800 de VO2max de uno de umbral.

**Por qué importa más allá del caso:** es la HARD RULE Nº0 filtrándose al
parser. La gramática daba por hecho que todo el mundo escribe como el coach
contra el que se escribió. Con miles de coaches, cada uno trae su dialecto.

**Decidido (1) — el disparador de la IA estaba mal puesto.** Escalaba cuando la
gramática FALLABA; ahora escala cuando la gramática **puede haber perdido
algo**. Si al terminar de tipar queda un número sin consumir (un `@160 kg`, un
`rec 2:30`), la línea no puede salir `detected`. Antes, una línea verde-con-
pérdida ni siquiera llegaba al modelo de segunda pasada que podría haberla
rescatado — la gramática ya había cantado victoria. Idea de Alex, y es la buena.

**Decidido (2) — un objetivo por REFERENCIA cuenta como pérdida.** El guardia
anterior compara números y «a split de carrera» no lleva ninguno, así que
`SkiErg 3x1000 m a split de carrera` salía verde como «3×1000 m» a secas: el
coach escribía el ritmo, el atleta recibía metros pelados. Estas frases
(«@race pace», «a umbral», «a peso de carrera», «all-out») son objetivos
DERIVADOS del test del atleta o de su división; hasta que se resuelvan de
verdad, lo honesto es revisar. **NO hacer:** un detector genérico de prosa —
ancla en la preposición («a split de»), nunca en la palabra suelta, o
«Bulgarian split squat» deja de tipar.

**Decidido (3) — dos formas nuevas en el modelo de prescripción, aditivas:**
`Target.kg.implement_count` (un farmers 2×32 son DOS implementos de 32; guardar
64 es mentira y guardar 32 a secas pierde información) y
`Measure.kind:'reps_to_failure'` (medida al fallo, sin campos: «4× máx»,
«máximo unbroken»). Las líneas de trineo/sandbag/farmers tipan con
`modality:'functional'`, no `'strength'`, porque `completeness.ts` exige medida
reps/duration para fuerza y éstas van por distancia o tiempo.

**Resultado medido:** 4 → **14 líneas limpias de 25**, y **cero pérdidas
silenciosas**: las 11 restantes son revisión honesta con el texto intacto.

**Deuda consciente:** `shared/domain/import/dose.ts` queda en 550 líneas (ya
estaba en 513 antes, por encima del techo de 500). Partirlo es un refactor
cross-cutting propio, no se hizo aquí. Y en iOS `reps_to_failure` decodifica a
`.unknown` sin crashear pero el renderer lo salta, e `implement_count` se
descarta — pendiente de pintarlos.

---

## 2026-08-09 · Las 8 estaciones HYROX tienen una fuente única — `shared/domain/hyrox/stations.ts`

**Decidido:** las distancias/repeticiones oficiales de las 8 estaciones vivían
retipeadas a mano en `test-catalog.ts` (familia `estaciones`), que además las
volvía a citar en su propio comentario de cabecera. Ahora hay un único dueño:
orden 1-8, el slug real de `exercises` (verificado contra el
`STATION_CATALOGUE` de `station-detail.ts`), la medida canónica de carrera, y
la carga por (división, género) — reusando `RaceDivision`/`RaceGender`
(`shared/schema/races.ts`) en vez de inventar un enum paralelo. Fuente:
`plan-95d-hyrox-singles-pro.md` §0 (pace-club.com + hycrew.com), rulebook
26/27, solo HOMBRES Open/Pro — toda celda sin fuente (mujeres, elite,
doubles/relay, grupos de edad) devuelve `null`, nunca el número de hombres.
La carga no se aplana a un escalar: `single` (un implemento), `per_implement`
(farmers carry: 2×24 kg, nunca "48 kg"), `sled` (masa total empujada/
arrastrada), `damper` (ajuste de máquina, no una masa — y no varía por
género porque la fuente no lo separa, no porque se asuma que sí).

**En consecuencia, no hacer:** no volver a escribir un número de estación
HYROX suelto en otro fichero — importar de `shared/domain/hyrox/stations.ts`.
No rellenar una celda sin fuente citada (ver el TODO en la cabecera del
fichero: pesos femeninos, división elite, doubles/relay, grupos de edad,
altura del target de wall ball por género).

**Encontrado de paso, NO tocado en este corte (fuera de lo pedido):**
`web/lib/dashboard/v2/hyrox-template.ts` (plantilla de simulación) y
`web/lib/templates/station-defaults.ts` (prefill del editor de bloques)
tienen cada uno su PROPIA copia independiente de estas mismas distancias/
cargas. `hyrox-template.ts` coincide con los números de aquí; `station-
defaults.ts` ya había derivado — una sola carga por estación sin partir
Open/Pro, y su wall ball de 9 kg es en realidad el valor PRO puesto donde se
espera un default Open. Ninguno de los dos se tocó; wirearlos a esta fuente
es follow-up, no incluido en este corte.

**Dónde vive:** `shared/domain/hyrox/stations.ts` (nuevo).
`shared/domain/coach/test-catalog.ts` lo consume vía `estacionMetros`/
`estacionReps` (mismos valores de antes, ahora con un solo origen). Tests:
`web/tests/hyrox/stations.test.ts`.

## 2026-08-08 · Circuito llega a la ruta Biblioteca/tests — `template_blocks`

**Decidido:** la decisión de Circuito (7-ago, siguiente entrada) dejó a propósito
sin auditar la ruta Biblioteca/tests (`template_segments`, distinta de
`slots_json`). Auditada: 20 bloques circuito reales del coach + 10 ya
materializados por atleta, con `rounds` metido en el título del bloque por
falta de columna ("A · Sled (6 rounds)") — el mismo síntoma. Se extiende el
mismo tipo `CircuitConfig` (`shared/schema/program-templates.ts`) a esta ruta
vía una tabla hija normalizada, `template_blocks` (migración 0159): una fila
por `(template_id, block_position)` con `rounds`/`pacing`/descansos separados
entre estaciones y entre rondas — nunca duplicado por fila como hacía
`block_title`/`block_format` en `template_segments`.

**Por qué esto y no un backfill:** parsear `rounds` del título es extraer un
hecho que el coach ya escribió; `pacing` no está escrito en ningún sitio —
inventarlo con un default, aunque parezca razonable ("por_tarea", el caso
HYROX típico), rompe la regla "no se sabe es un valor de primera clase"
(28-jul). Los 30 grupos reales se quedan sin fila (= sin config de circuito,
comportamiento legacy intacto) hasta que el coach los complete desde el editor.

**Cómo llega al atleta:** `assignment-detail.ts` (`loadAssignmentDetail`)
consulta `template_blocks` junto a los segmentos y `buildBlocks` sirve la
config real en `AssignmentDetailBlock.config_json` (antes: literalmente `{}`
siempre — comentario explícito de que "el studio aún no lo persiste"). Un
bloque circuito tiene por definición >1 segmento, así que nunca puede caer en
la fusión de fragmentos de un-solo-segmento que colapsa bloques — el
`block_position` que llega a `config_json` es siempre el autorado original.

**En consecuencia, no hacer:** no fusionar esto con el `weekDayPartConfigSchema`
genérico (EMOM/Tabata/intervalos) — Circuito es un tipo cerrado y objetivamente
correcto aparte, no otro cajón del blob. No asumir que `template_blocks` cubre
ya el editor de día ni el motor en vivo — son piezas separadas de este mismo
corte, en curso (ver FOCUS.md).

**Dónde vive:** `shared/schema/program-templates.ts` (`circuitConfigSchema`,
`circuitPacingSchema`), `infra/migrations/0159_template_blocks.sql`,
`web/lib/athlete/assignment-detail.ts` (`AssignmentDetailCircuitBlock`,
`circuitToConfigJson`, `buildBlocks`).

---

## 2026-08-08 · El motor FIXED no tiene fase de descanso — el cursor por estación queda aparte

**Decidido:** `conditioningFold` (`WorkoutModels.swift`) ya consume `pacing`/los
dos descansos/el target de cabecera del bloque Circuito (ver entrada de arriba
para el modelo). La generalización del **cursor por estación** a un circuito
real con rondas (`fixedListIsStations`/`Cursor.fixedStation`, `LiveTramo.swift`)
se investigó a fondo y se dejó **fuera, a propósito** — no es un ajuste de 3
líneas.

**Por qué:** dos hallazgos cambian el alcance real:
1. `StrikeList`, `ForTimeContextStrip` y `StationSubject`
   (`WorkoutFormatHUDs.swift`) asumen una lista PLANA de un solo paso —
   `StrikeList.rows` pinta exactamente M filas (las estaciones) sin repetición
   por ronda, y cada "de N" lee un total único. Sin reescribir esas tres piezas,
   un circuito de N rondas × M estaciones mostraría solo M filas y el total
   equivocado.
2. El motor `.fixed` (`tickFixed`/`markRoundDone`) **no tiene NINGÚN estado de
   fase de descanso hoy** — las estaciones avanzan sin pausa. Solo el motor
   `.rotating` (Tabata/Intervals/EMOM, `rotPhase`/`rotPhaseRemaining`) lo tiene.
   Aplicar los dos descansos del Circuito en vivo pide una máquina de estados
   nueva en el motor FIXED, no una extensión de 3 líneas.

**En consecuencia:** un bloque circuito con rondas hoy sigue cerrando las N
estaciones de una ronda con un solo tap (`closeConditioningAndAdvance()`) — más
literal de lo que la entrada anterior asumía ("ronda hecha cierra las N
estaciones de golpe" es, de hecho, exactamente lo que hace ahora mismo, no una
aproximación). Sin regresión: es el comportamiento de siempre, nada lo empeora.

**No hacer:** no intentar colar el cursor por estación como una extensión
menor de esto. Es una pieza propia — máquina de fases nueva en el motor FIXED +
reescribir las tres piezas de HUD — y por la regla de prioridad UX del
proyecto, necesita su propio pase de diseño antes de tocar código (cómo se ve
"ronda 2 de 4, estación 3 de 3", el HUD de descanso entre rondas).

**Dónde vive:** `ios/FAHYBRIK/Workout/WorkoutModels.swift` (`conditioningFold`),
`ios/FAHYBRIK/Plan/Prescription.swift` (`restBetweenRoundsS`),
`ios/FAHYBRIK/Devices/Treadmill/RunTargetResolver.swift` (el consumidor real
del target huérfano), `ios/FAHYBRIKTests/Workout/ConditioningFoldTests.swift`.
Lo pendiente vive en `ios/FAHYBRIK/Workout/LiveTramo.swift` y
`WorkoutFormatHUDs.swift` — sin tocar.

---

## 2026-08-07 · Asignar una semana deja de ser una copia de un solo instante

**Decidido:** un microciclo ya asignado a un atleta ahora sabe de qué `program_week_templates` se materializó (`microcycles.source_week_template_id`, migración 0158), y guardar un día en el editor **resincroniza automáticamente** los microciclos con ese linaje: cada asignación todavía `'scheduled'` recibe el contenido fresco; cualquier otra (`'completed'`/`'partial'`/`'skipped'`/`'missed'`) se deja intacta siempre, porque el atleta ya actuó sobre ella.

**Por qué:** verificado contra producción — Alex escribió una nota de coach para un ejercicio (Puente de glúteo) ya asignado a un atleta; la nota se guardó perfecto en la plantilla y **nunca llegó**, ni siquiera tras una re-materialización posterior no relacionada con su edición. La causa: `instantiateWeekIntoMicrocycle` copia la plantilla una vez y no deja ningún rastro de origen — no había forma de saber a qué microciclos avisar cuando la plantilla cambia. Es el comportamiento estándar de cualquier plataforma de coaching seria (TrainingPeaks, TrueCoach): editar un entreno no empezado se ve reflejado sin un paso de "republicar" aparte.

**Cómo:** `insertSlotAssignment` pasó de decidir por existencia («¿ya hay fila? no la toco») a decidir por `status` («¿sigue 'scheduled'? la reemplazo»); es la misma guarda que ya usa `markAssignmentDoneFromDevice` (lib/sync/assignment-status.ts) para no pisar una decisión que el atleta ya tomó. `resyncWeekTemplateAssignments` reusa el mismo motor de materialización, best-effort por microciclo.

**En consecuencia, no hacer:** no asumir que "ya está asignado" significa "protegido de ediciones futuras" en ningún flujo nuevo que toque `workout_assignments` — el resync corre automáticamente en cada guardado del día. No añadir un segundo mecanismo de "publicar/republicar" manual: el editor ya resincroniza solo.

**Fuera de alcance a propósito:** si el coach BORRA una sesión entera del día después de asignarla, la asignación ya materializada no se borra sola (podría destruir historial visible al atleta) — queda huérfana. No es el caso que motivó esto; se documenta para que no sorprenda.

**Dónde vive:** `infra/migrations/0158_microcycle_source_lineage.sql`, `web/lib/dashboard/coach/instantiate-program.ts` (`resolveOrCreateMicrocycle`, `insertSlotAssignment`, `resyncWeekTemplateAssignments`), `web/app/api/coach/program-weeks/[id]/day/route.ts`.

---

## 2026-08-07 · «Circuito» pasa a ser un tipo de bloque real — deja de ser N líneas sueltas que copian los mismos números

**Decidido:** un bloque de rondas con varias estaciones (el patrón HYROX/hybrid de "N rondas de M estaciones") deja de representarse como una lista plana de items que comparten `rounds`/`work_s`/`rest_s` copiados por convención de UI. Pasa a ser un tipo a nivel de BLOQUE: `rounds` (único), `pacing` (`por_tarea` — la ronda dura lo que tarde el atleta, sin reloj — o `por_reloj` con su `work_s`, un tope duro por estación) y descansos entre rondas / entre estaciones por separado. Las estaciones se quedan solo con su ejercicio y su objetivo, sin duplicar nada de bloque.

**Por qué:** auditado con 3 agentes en paralelo (iOS+watch, editor web, datos reales en Neon) antes de tocar nada. Los 22 bloques `circuit` multi-estación reales en producción son en verdad **3 patrones distintos bajo la misma etiqueta**: circuito por tarea (Sled Push+Lunge+Wallballs, 4 rounds, sin reloj — el caso HYROX real), circuito por reloj (Power Clean+Box Jump, 5 rounds, ventana 120s cada estación — EMOM con varios movimientos), y superserie mal etiquetada (Pull-up+Dip sin rounds ni reloj — ya existe el arquetipo correcto, solo hay que corregir la etiqueta). El mecanismo de "copiar por convención" (`applyHead` en `ComponentsForm.tsx`) ya se demostró roto en producción: **2 de los 22 grupos tienen el campo en una estación y no en la otra** — no son casos hipotéticos, son filas reales.

Esto es también la causa raíz de dos síntomas que Alex reportó por separado: el ritmo fantasma "3:45/km" en el atleta (un `target` de cabecera huérfano que sobrevive porque no hay dueño de bloque que lo limpie) y la confusión de "ventana trabajo" (hoy se pide siempre, aunque el formato no tenga reloj — con `pacing` solo se pide cuando aplica, y nunca se calcula solo desde el ritmo estimado, porque eso convertiría un tope real del coach en una suposición).

En el motor en vivo y en el reloj, el cursor por estación que YA EXISTE (`LiveTramo.Cursor.fixedStation`) estaba artificialmente restringido a la única pasada sin `rounds` (chipper/HYROX-sim). Se vuelve universal para cualquier bloque con `pacing`: el atleta siempre sabe ronda Y estación, nunca solo la ronda — hoy "ronda hecha" cierra las N estaciones de golpe con un solo tap, sin cursor interno.

**Naming:** NO se llama "Series" — ese nombre ya está ocupado en el dominio (`GuionSeries.swift`, `RunSeriesDeSets.swift`: repeticiones de carrera, 3×1000m). Se llama **Circuito**, que además coincide con el valor `circuit` que ya usa `block_format` en la DB.

**En consecuencia, no hacer:** no reintroducir `config_json: {}` como blob libre sin tipar — ya existía tipado en `WeekDayPartConfig` y estaba muerto (el editor v2 nunca lo leía ni escribía, `assignment-detail.ts` lo emitía siempre vacío con un comentario explícito de que "el studio aún no lo persiste"). No copiar `rounds`/`work_s`/`rest_s` en cada item nuevo — ese era el bug. No routear una superserie sin rounds/reloj hacia el arquetipo Circuito.

**Fuera de este corte, a propósito:** la ruta de sesiones-biblioteca (`template_segments`, la de "Screen 5" / instancias por-atleta, distinta del editor de día que usa `slots_json`) no tiene ningún sitio a nivel de bloque donde guardar esto — no hay `config_json` ahí, el agrupador de bloque son solo columnas de texto repetidas por fila. Se audita y decide aparte antes de tocar su esquema — no se improvisa una columna nueva sin ver antes cuánto contenido circuito real vive ahí.

**Dónde vive:** `shared/schema/program-templates.ts` (`weekDayPartConfigSchema`/`editorBlockInputSchema`), `web/components/v2/editor/archetype-forms/ComponentsForm.tsx`, `web/lib/athlete/assignment-detail.ts`, `ios/FAHYBRIK/Workout/WorkoutModels.swift` (`conditioningFold`), `ios/FAHYBRIK/Workout/LiveTramo.swift` (`Cursor.fixedStation`).

---

## 2026-08-07 · La app no puede decir lo que un coach hace. Ni cuándo, ni cada cuánto

**Decidido (Alex):** ninguna superficie del producto —copy de onboarding, estados vacíos, notificaciones— puede afirmar **qué hace un coach, cuándo lo hace o con qué cadencia**. Si la frase cambiaría según el coach, no puede estar cableada: o sale de un dato, o no se dice.

**Por qué:** es la HARD RULE Nº0 aplicada al copy, que es por donde se estaba colando. `Day1Flow.swift` (en producción) le promete al atleta dos cosas que son *la metodología de un coach concreto*, no hechos del producto:

- «**Tu coach te programará tus tests en la primera semana**» (+ el rótulo «SEMANA 1 · CALIBRACIÓN»). Un coach puede no usar tests, o ponerlos en la semana 4, o solo a quien vuelve de lesión.
- «**Cada domingo tienes tu plan listo en la app**». Eso es una cadencia semanal con día fijo. Otro coach publica por bloques, o mensual, o cuando le da la gana.

Lo revelador es que el mismo fichero YA razonaba bien en otro punto — *«WHICH tests and HOW MANY are the coach's call (data-driven), so we don't invent a canned 4-test set here»* — y aun así afirmaba el CUÁNDO. La disciplina se aplicó al catálogo y no al calendario.

**La prueba que decide, y es la misma que la de HARD RULE Nº0:** *«¿otro coach competente lo haría distinto?»* Si sí, es método → dato, o silencio. «Tu coach ve tus resultados al terminar» sí es del producto (es el mecanismo). «Cada domingo» no lo es.

**En consecuencia, no hacer:** no escribir copy que fije días, cadencias, número de sesiones, ni la existencia de tests. No prometer al atleta un comportamiento del coach que el producto no puede garantizar — cuando no se cumple, el atleta culpa a su coach de algo que dijo la app. Y no confundir *mecanismo* («tu coach recibe tus resultados») con *método* («cada domingo»): lo primero se puede afirmar, lo segundo nunca.

**Corolario — no mentir por omisión:** el estado vacío de iOS decía «Tu coach aún no ha publicado tu plan» a un atleta cuyo plan SÍ estaba publicado y solo empezaba más tarde (`PlanView.swift:499`, verificado contra las 9 semanas `published` del atleta 64). Un estado vacío tiene que distinguir *no hay nada* de *hay y empieza el lunes*, porque el atleta lee lo segundo como negligencia de su coach.

---

## 2026-08-07 · La biblioteca de bloques no tiene 3 bugs de importador — tiene un parser viejo

**El encargo original** («fase 2») pedía arreglar 3 bugs concretos del importador cazados leyendo `block_exercises` en crudo: %RM leído como reps (block 16), km/h leído como metros (block 43), descanso guardado como trabajo (block 37).

**Verificado ANTES de tocar código: los 3 no reproducen en la gramática de hoy.** Se corrieron los 3 verbatims reales por `parseNotationCell` (shared/domain/import) tal cual está en producción:
- `"4r every 2': 3 power clean 65-75% + 5 high box jump"` → `confidence:'review'`, verbatim conservado en `note`. La gramática se niega a inventar el reparto EMOM multi-movimiento en vez de leer «65» como reps.
- `"Threshold cinta: 4x2'30'' a 17km/h – 2' trote a 11km/h"` → `target:{kind:'pace', value_s:212}` (ritmo correcto, no metros).
- `"12 rounds x 400m run – 1' rest"` → `rest_s:60` (correcto), nunca `work_s`.

**Conclusión: `block_exercises` no se generó con esta gramática.** Es de UN SCRIPT DE UN SOLO USO anterior (`infra/scripts/retype_run/_erg/_strength/_core_mobility/_functional_blocks.ts`, `parse_blocks_lib/_structured.ts`), previo al contrato de honestidad actual (degradar a `review`, nunca inventar). Arreglar "3 bugs del parser" habría sido perseguir un fantasma — el parser de hoy ya está bien; lo que hay que reparar son los DATOS que quedaron atrás.

**Dry-run contra las 99 filas reales de coach 60** (`infra/scripts/repair_block_exercises_grammar.ts`, solo lectura): re-parsear el verbatim (`blocks.description`, Model A, fuente de verdad) y comparar contra `block_exercises` da 4 bloques enteramente vacíos + 18 filas vacías en bloques mixtos (22 rellenos limpios y seguros), ~53 bloques donde el fresco DIFIERE del guardado (mayoría: el fresco es estrictamente más completo, no contradictorio — necesita un diff por CAMPO, no una comparación JSON entera) y ~29 que ni la gramática de hoy resuelve (WODs/EMOMs multi-movimiento densos, correctamente a `review`).

**Por qué NO se aplicó nada esta sesión:** el primer intento de `--apply` reveló un fallo de clasificación real (`paramsHasContent()` contaba `{sets:4}` — un contador sin reps ni carga — como "contenido", lo que escondía filas genuinamente vacías dentro de bloques con alguna fila buena). Corregirlo bien, más sustituir el match de ejercicio por nombre exacto por el resolutor real (`resolveExercise()`, fuzzy, `web/lib/import/exercise-resolve.ts`) y construir un diff por campo (no por objeto entero) es más trabajo del que cabía en la sesión. Aplicar sobre la ÚNICA biblioteca real de producción con un heurístico que ya se demostró roto habría violado la regla de cero datos falsos en cuentas reales.

**En consecuencia, no hacer:** no reabrir esto como "arreglar 3 bugs" — el marco correcto es "re-tipar la biblioteca con la gramática actual". No aplicar `repair_block_exercises_grammar.ts` sin antes: (1) diff por campo, no por objeto entero serializado; (2) `resolveExercise()` real en vez de match de nombre exacto; (3) decidir qué hacer con los ~53 bloques "difieren" caso a caso o con una regla más fina que "estrictamente más completo = aplicar".

**Dónde vive:** `infra/scripts/repair_block_exercises_grammar.ts` (solo lectura, documentado, listo para retomar).

---

## 2026-08-06 · `plan-bloque` pasa a ser la pestaña Plan real — InicioView deja de duplicar «hoy»

**Decidido:** el mockup `plan-bloque` (doble, `propuesta` desde el 29-jul: hoy en grande + carril de la semana + entrada al bloque) se construye en Swift y **sustituye el contenido de `PlanView`**. `InicioView` deja de pintar su propia versión de «qué toca hoy» — pierde `heroSection`, el `pmSession` de la segunda sesión y `hechoHoySection` — porque esa pregunta pasa a responderla el Plan, una sola vez. `InicioView` conserva lo que NO es plan: readiness, carril hacia la carrera, tendencias, entreno libre, panel de pareja, pasos.

**Por qué:** auditado el código real (no el mockup) antes de tocar nada — `InicioView.swift` y `PlanView.swift` leen el MISMO `store.planWeek`, derivan el mismo `SessionMarkState` y navegan al MISMO destino (`WorkoutContainer`/`ExecutedWorkoutView`); son dos renderizados independientes de la misma pregunta, cada uno con su copy propio para «hoy no toca nada». Es la fricción exacta que motivó todo este hilo (el atleta ve el entreno sin el porqué, o el porqué sin el entreno).

**Cuatro huecos que el mockup no cubre y sí el dominio real, resueltos antes de construir:**
1. **Días con AM+PM (el caso «brick» que abrió este hilo).** El mockup solo modela `hoy.sesiones[0]`. El héroe sigue mostrando la primera sesión; una segunda sesión del mismo día se pinta como fila compacta debajo (el patrón que `InicioView.pmSession` ya validaba), no como un segundo héroe a toda altura.
2. **`estructural` (calentamiento/principal/vuelta) en `ParteSesion` — corregido a media construcción contra el dato real.** La hipótesis inicial (añadir `group` de `weekDayPartSchema` de punta a punta) se descartó al comprobar `template_segments`: ese campo vive solo en el editor del coach (`shared/schema/program-templates.ts`), nunca se persiste — no hay columna `group` en ningún sitio, y `assignment-detail.ts` construye los bloques desde `template_segments`, no desde `weekDayPartSchema`. Añadirlo de verdad habría exigido migración + tocar el guardado del editor, para un dato que en producción casi no existe: **0 segmentos con `block_format='warmup'` y solo 8 con `'cooldown'`** (de 133 plantillas). El calentamiento/la vuelta a la calma reales viven como **prosa libre** en `templates.warmup`/`templates.cooldown` (66/70 de 133 plantillas la tienen) — y `assignment-detail.ts` los lee de la BD y **nunca los expone** en la respuesta (gap real, ajeno a este build, anotado y no arreglado aquí). **Solución real, sin schema nuevo:** `AssignmentDetailBlock.format` ya viaja en el wire — `estructural` se deriva en la UI de `format ∈ {warmup, cooldown}`. Con los datos de hoy rara vez pintará algo (que es honesto: no hay bloque estructural que atenuar en casi ninguna sesión), y queda listo el día que se tipen.
3. **La sesión de hoy necesita su desglose real de bloques** (título, nº ejercicios, `estructural`, modalidad del primer ítem) para `ParteSesion` — el resumen de fila (`shortPrescription`, una frase) no basta. El Plan pasa a pedir `AssignmentDetail` de la sesión de hoy al cargar (solo hoy, no la semana entera, para no encarecer la carga).
4. **El botón de pie «El bloque» necesita un destino real.** `plan-ciclo` (la pantalla que cuenta hacia dónde va el bloque) tampoco existe en Swift, pero el dato que necesita (`GET /api/athlete/macro-progress` → `macroProgress.weeks`) YA se pide y hoy no lo pinta nadie. Se construye una v1 real en el mismo lote — un botón que no lleva a ningún sitio es peor que no tener botón.

**Fuera de alcance, a propósito:** `FreePlanView`/`FreeInicioView` (atleta sin coach) no se tocan — no tienen voz de coach ni concepto de bloque, así que la fusión no aplica igual.

**Gobierna todo lo visual:** `docs/CONTRATO-UI.md` — componentes compartidos de `Theme/`, `Formato.*`/`Vocab.*` para cada cifra, los cuatro estados, las cuatro estrategias de altura del §6.1 (el héroe es `llena`, el descanso es `centra`).

---

## 2026-08-06 · La prioridad de fuentes de FC gobierna el NÚMERO, no solo la etiqueta — y el pulso tiene su propia procedencia

**Decidido:** `WorkoutSession.injectLiveHR` (motor en vivo) ya tenía una jerarquía de prioridad entre fuentes de pulso simultáneas (correa BLE=3 > Apple Watch/HealthKit=2 > PM5=1, con ventana de silencio `hrSourceStaleSeconds`=10 s para el traspaso). El fallo real: esa jerarquía solo decidía la ETIQUETA de la tira de conexión — `liveHRBpm`, `lapHRSamples` (de donde salen `avg_hr`/`max_hr`), el pico del tramo y la cola de HRR se alimentaban de CUALQUIER lectura, sin mirar quién era la dueña. Con dos fuentes activas a la vez (reloj + correa, o reloj + PM5 remando — ambos escenarios normales, no un edge case), `avg_hr` promediaba la unión de dos streams y un artefacto de la fuente más débil podía convertirse en el `max_hr` guardado del tramo. Ahora la decisión de ownership se toma ANTES de tocar ningún acumulador: solo la fuente dueña del instante alimenta el número y los cuatro agregados; una lectura de prioridad menor mientras la dueña sigue viva no entra a NADA (antes sí entraba a todo salvo a la etiqueta).

**Y de forma aditiva:** `segment_executions` gana `hr_source` (migración **0153**, texto nullable, CHECK `strap|healthkit|pm5`) — de qué APARATO salió el pulso guardado, distinto de `source` (que describe el TRAMO: gps/pm5/treadmill/manual). `LapRecord.hrSource` / `SegmentExecutionDTO.hr_source` en Swift, `HR_SOURCES` en `shared/schema/workouts.ts` (mismo patrón que `REPS_STATUSES`/`RX_SCALED_VALUES`, no se reutiliza `biometricSource` porque es un vocabulario de marca/aparato a nivel de EJECUCIÓN entera, una pregunta distinta).

**En consecuencia, no hacer:** no volver a separar "quién tiene la etiqueta" de "quién alimenta el dato" en ningún stream concurrente del motor en vivo — son la MISMA decisión de ownership, tomada una vez, antes de tocar cualquier acumulador. Y no confundir `source` (procedencia del tramo) con `hr_source` (procedencia del pulso): un tramo de cinta puede tener su única FC medida por el Watch.

**Aplicada el mismo 6-ago, y en el orden que importa:** la migración 0153 fue a producción ANTES de integrar el código, porque el INSERT de `web/lib/sync/ingest-execution-segments.ts` referencia `hr_source` sin condicional — al revés habría roto TODO el ingest de segmentos, no solo el pulso. Verificado en producción con un ensayo en transacción revertida contra el esquema real: columna creada nullable, las 221 filas intactas, y el CHECK rechazando un valor fuera del vocabulario.

---

## 2026-08-06 · La velocidad de barra NO sustituye al RIR. Lo calibra — y el RIR tecleado es su etiqueta

**Decidido:** cuando se mida la velocidad de la repetición con el reloj (fase 3 del plan de sensor), **el RIR auto-reportado se queda donde está**. No se retira, no se oculta, no se sustituye. Lo que se enseña de la velocidad es la **comparación del atleta consigo mismo a igual carga y ejercicio**; lo que NO se enseña es el %1RM estimado.

**Por qué, contra la narrativa cómoda del sector.** El discurso habitual —"la velocidad es objetiva, el RIR es subjetivo, luego la velocidad es mejor"— **no está respaldado por la evidencia**, y en la primera redacción de la propuesta lo di por bueno antes de mirar los números:
- Un atleta entrenado estima su RIR cerca del fallo con **0,65-1 repetición de error medio** (JSCR 2023/2024). Es bastante preciso.
- Los modelos **generales** velocidad→RIR fallan por **más de 2 repeticiones al 70 % del 1RM**. Solo los **individualizados** por persona bajan de 2 (PMC10901726, 46 sujetos).
- La correlación velocidad↔RIR percibido varía de r=0,1 a r=0,9 entre personas (media 0,6, r²≈0,3). Los autores concluyen literalmente que son «perspectivas complementarias, no intercambiables» (PMC12360324, 2.972 mediciones).
- La validez de los acelerómetros de muñeca **se hunde con cargas pesadas**, que es donde más apetece usar esto: el wearable de VBT más estudiado cae a r=0,33 al 100 % del 1RM, mientras los encoders de cable mantienen precisión en todo el rango (PMC7900050).
- El %1RM desde perfil carga-velocidad **sobreestima 4,5 kg (3,7 %)** con error típico del 9,8 %, y **sin diferencia entre perfil individual y general** — meta-análisis de datos individuales, 641 participantes (PMC10432349). Los autores recomiendan el test directo cuando sea viable.

**El argumento propio que hubo que retirar.** Escribí que la pérdida de velocidad se salva por ser un cociente que cancela el sesgo. **Es falso.** El error del acelerómetro no es un factor constante: crece cuando la barra va lenta. Y las últimas repeticiones de una serie al fallo son justo las lentas, las que definen la pérdida. El cociente arrastra el error de la peor medida en vez de cancelarlo.

**Lo que sí sale de aquí, y es mejor:** el modelo velocidad→RIR **individualizado sí funciona**, y nadie lo tiene porque nadie recoge las dos señales a la vez durante meses. Nosotros vamos a tener, en la misma serie, el RIR que teclea el atleta **y** la velocidad que mide el reloj. **El RIR tecleado no es el rival de la velocidad: es su etiqueta de entrenamiento.** Con suficientes series de una persona se ajusta su curva propia. Por eso la migración de la fase 3 guarda los dos juntos.

**En consecuencia, no hacer:** no retirar el campo de RIR de la UI de fuerza cuando llegue la velocidad; no presentar el %1RM estimado desde velocidad como si fuera una marca; no validar la velocidad con un único número medio (va **por banda de carga**, porque el fallo está concentrado cerca del 1RM); y no extender a peso muerto ni press militar la validación publicada, que **solo existe para sentadilla** con reloj en muñeca.

**Documentos:** `docs/reconocer-el-movimiento.html` §05 y `docs/plan-reconocer-movimiento.html` fase 3.

---

## 2026-08-06 · Reconocer el movimiento es cosa de Apple Watch. Garmin queda descartado, y hay que saber por qué

**Decidido:** el reconocimiento de movimiento por sensor inercial (contar repeticiones, separar trabajo de descanso, clasificar la estación, medir la velocidad de la barra) se construye **solo para Apple Watch**. En Garmin se sigue empujando el entreno por Connect IQ y el atleta confirma a toque, como hoy.

**Por qué, y esto es lo que evita que alguien lo re-explore dentro de seis meses:** Connect IQ **no expone el acelerómetro en crudo a terceros**. Lo que una app recibe es un valor cacheado que se refresca entre 1 y 25 Hz según el modelo, y las tareas en segundo plano están limitadas a ~30 s de ejecución cada 5 minutos. Con eso no se cuenta una repetición ni se detecta una transición — la literatura entera trabaja entre 20 y 100 Hz de señal continua. Garmin **sí** cuenta repeticiones en su firmware nativo (bien en movimientos aislados, mal en compuestos), pero ese acceso privilegiado no lo publica. Por eso no existe ninguna app de Connect IQ de terceros con conteo reputado: no es que nadie lo haya intentado, es que la plataforma no lo permite.

**En Apple tampoco hay atajo, y eso también conviene saberlo:** `HKWorkoutEventType` es exhaustivo y **no tiene ningún evento de repetición ni de serie**; HealthKit no define un tipo de dato para reps; y el modo nativo de fuerza de watchOS no las cuenta. `motionPaused`/`motionResumed` son automáticos solo para *Running*. Todo el que hace esto se lo construye entero sobre Core Motion. Es mecanismo puro, que por la HARD RULE Nº0 es exactamente lo que nos toca poner en código.

**La vía que sí existe:** `CMBatchedSensorManager` (watchOS 10+, Series 8/Ultra en adelante) entrega acelerómetro hasta 800 Hz y movimiento hasta 200 Hz en lotes de un segundo, **y exige una `HKWorkoutSession` activa** — condición que el reloj ya cumple con `workout-processing`. Fallback a `CMMotionManager` a 100 Hz donde no esté.

**En consecuencia, no hacer:** no volver a plantear conteo de repeticiones ni detección de estación dentro de una app de Connect IQ; no buscar una API de Apple que devuelva reps (no existe); no diseñar el procesado en el teléfono (rompería el modo solo-reloj y duplicaría el camino); y no muestrear a 800 Hz para archivar — la literatura trabaja a 20-100 Hz y 800 Hz son 69 MB por hora que no se archivan.

**Documento:** `docs/reconocer-el-movimiento.html` (6-ago) — propuesta completa, sin construir.

---

## 2026-08-05 · Una vista por lo que estás haciendo (iOS + watchOS)

**Qué se decidió.** Cada tipo de entreno tiene SU pantalla, en los dos dispositivos.
Correr fuera ≠ correr en cinta ≠ serie ≠ continuo ≠ fuerza ≠ EMOM ≠ For Time. Una
vista genérica con `if`s dentro no es diseño: es una excepción disfrazada. El
reparto lo decide **qué mide el dispositivo** y **quién cierra el trabajo**, no cómo
se llama el formato — porque las dos fuentes de entreno no escriben lo mismo para la
misma cosa (el constructor libre emite `intervals`; el coach escribe `sets`).

**Por qué.** Correr lo pintaban SEIS superficies y dos estaban vivas a la vez: un
`fullScreenCover` tapaba un HUD que seguía montado debajo. De ahí salían tres cosas
que el atleta veía y no se explicaban: podía saltar entre pantallas del mismo tramo,
la Live Activity dependía de cuál tuviera abierta, y los tiempos no cuadraban.

**Qué se eliminó** (ninguna tenía diseño detrás; el mapa está en
`docs/entreno-vista-por-vista.html`): `RunLiveHUD` — la naranja genérica —,
`StructuredRunLiveHUD`, `IntervalsLiveHUD`, `TabataLiveHUD`, `SteadyLiveHUD`,
`DeathByLiveHUD`, sus piezas huérfanas y `ManualEntryControl`. Y
`TreadmillControlDebugSheet`, que se abría con pulsación larga **en producción**,
queda tras `#if DEBUG`.

**Qué NO hacer en consecuencia.** No volver a añadir una pantalla «genérica de
correr» ni un botón que abra una segunda vista del mismo tramo. Si un formato se
queda sin pantalla, se DISEÑA en el doble primero; no se resuelve con un `if` dentro
de otra. Tabata y Death By de burpees (ni correr ni ergo) se quedaron sin ventana
trabajo/descanso a propósito: tienen cero casos reales en la biblioteca y ningún
diseño. Caen al suelo honesto — dicen menos, no dicen nada falso.

---

## 2026-08-05 · Una auto-pausa no puede sobrevivir a quien la vigila

**Qué se decidió.** El invariante de la auto-pausa lo garantiza la SESIÓN, no la
vista: quien evalúa se registra, y al irse el último cualquier auto-pausa suya se
levanta sola. Sin vigilante no se puede auto-pausar, porque nadie podría deshacerlo.
Una pausa **manual** no la levanta nadie más que el atleta.

**Por qué.** `session.autoResume()` tenía un solo llamante en toda la app, dentro
del modelo de la pantalla de calle, y moría con ella. Parabas en un semáforo,
cerrabas esa pantalla, y la sesión quedaba **pausada para siempre** — el crono
detenido y el entreno guardándose con ese tiempo de menos.

**Qué NO hacer.** No volver a poner el ciclo de vida de un estado del motor en manos
de una vista. Si algo lo enciende, el motor tiene que saber apagarlo aunque quien lo
encendió desaparezca.

---

## 2026-08-05 · El cable del espejo lleva el TRAMO, no frases

**Qué se decidió.** `MirrorStateFrame` transporta `MirrorTramo` (formato, modalidad,
ronda n/m, dosis de AHORA, trabajo vs descanso, quién cierra la ventana, lo medido en
ESA ventana). Con eso, los MISMOS guiones sirven las dos vías: en solitario leen el
motor, en espejo leen la trama. Una pantalla por formato, no dos.

**Por qué.** El reloj corre en espejo la inmensa mayoría de las sesiones y el cable
sólo llevaba tres strings ya redactados por el móvil. Sin un campo que dijera el
formato, la muñeca no podía elegir pantalla: todo el diseño por formato vivía en el
10 % de los entrenos.

**Qué NO hacer.** No mandar por el cable un dato ya renderizado cuando existe el dato
en bruto, y no rellenar el hueco de un número con una excusa: la Live Activity
mandaba el estado del GPS en el sitio del ritmo y salía «RITMO · GPS fuerte /km».
Sin dato, cambia el sujeto — no se disfraza.


## 2026-08-05 · La superserie es un FORMATO de bloque, no un nivel nuevo de anidamiento

**Decidido:** `superset` entra en el catálogo canónico de formatos (`shared/domain/prescription/format.ts`) y en el enum PG `template_format`. Un bloque con formato `superset` **rota** sus ejercicios (A1→A2→A1→A2); uno con formato `sets` los ejecuta en **series rectas** (todas las de A, luego todas las de B). Ambos registran carga por serie.

**Por qué así.** Se planteó primero como una agrupación nueva dentro del bloque, y es un error: el nivel ya existe. Un coach que escribe `A1/A2/A3` y luego `B` está describiendo **dos bloques**, no un bloque con subgrupos. La estructura del repo ya lo modela — `WeekDayPart` es el bloque y sus `items[]` son sus ejercicios — así que la agrupación por letras se traduce a **fronteras de bloque + formato del bloque**, sin tocar el shape de los items ni añadir un nivel de anidamiento que todo lo de aguas abajo tendría que aprender.

**Lo que se verificó antes de decidirlo** (contra el código, no de memoria):

- **`block_position` NO servía.** Es el índice del bloque dentro de la sesión (`editor-serialize.ts:324`, `instantiate-program.ts:621`), no un mecanismo de sub-agrupación. Entre bloque e item no hay nada.
- **La rotación existe, pero cerrada.** `conditioningFold` (`ios/FAHYBRIK/Workout/WorkoutModels.swift:1680`) pliega los items de un bloque en una rotación real — pero solo para formatos que corren reloj (`runsConditioningTimer`), y `sets` no lo cumple. El comentario del propio motor lo dice: *«strength / warmup / cooldown stay one-segment-per-item»*.
- **Y aunque se reutilizara, no valdría:** el fold coge únicamente el PRIMER set de cada item (`:1689`). Una superserie de fuerza necesita N series por ejercicio alternando, cada una con su descanso. Por eso `superset` es un camino propio en el motor y no un alias de `rounds`.

**En consecuencia, no hacer:** no añadir un campo de grupo a `WeekDayPartItem` ni a `PrescriptionSet` — la letra del coach es notación de entrada, se consume al importar y muere ahí; no reutilizar `rounds`/`circuit` para una superserie de fuerza (arrancaría un reloj de acondicionamiento y perdería las series); y no dar por hecho que dos items en el mismo bloque rotan — hasta hoy nunca lo han hecho, así que todo bloque `sets` existente sigue siendo series rectas.

---

## 2026-08-05 · Una medida de trabajo puede ser un RANGO

**Decidido:** `Measure` gana un `max` opcional en sus cuatro formas (reps, distancia, duración, calorías). El campo base sigue siendo obligatorio y es el **suelo** del rango.

**Por qué:** «4 series de 12-15 repeticiones» es una banda dentro de la que el atleta autorregula. El importador la aplanaba en dos series, una de 12 y otra de 15 — que es otro entreno. El eje `Target` ya sabía expresar rangos (ritmo, zona, RPE, %RM) desde siempre; el eje `Measure` nunca los tuvo, y no había ningún apaño previo en el repo (`reps_scheme` es una **secuencia** de valores exactos, `"10/10/8/8/6"`, no un rango).

**Forma elegida y por qué:** un solo nombre, `max`, para las cuatro formas — el `kind` ya dice la unidad. Y el campo base **obligatorio** en vez de espejar el `value?|min?/max?` de `Target`: así todo lector existente (el prefill de reps del motor en vivo, `prescriptionToParams`, los `Codable` de iOS) sigue funcionando sin tocarlo y enseña el suelo. El cambio es aditivo, no una migración.

**En consecuencia, no hacer:** no confundir rango con secuencia al parsear; ante la ambigüedad, `review`. Y no volver opcional el campo base «por simetría con Target» — rompería en silencio a todos los consumidores.

---

## 2026-08-04 · SÍ al prior poblacional — agregado, ponderado por temporada, por división y formato

**Decidido (Alex):** se construye el prior poblacional de HYROX. Cierra la pregunta que la spec del 27-jul dejó abierta en su §10 y que llevaba desde entonces bloqueando tres cosas: las cinco estaciones de fuerza (sin marca posible en el catálogo), el arranque en frío de un atleta nuevo y la proyección sin objetivo del embudo free.

**Con tres condiciones que son parte de la decisión, no criterio de quien lo implemente:**

1. **Solo estadística agregada.** Cuantiles por casilla *(temporada · división · formato · sexo · grupo de edad) × segmento*. Nunca resultados de terceros identificables, nunca exhibidos, nunca consultables por persona. Lo que se guarda es una distribución, no un ranking.
2. **Ponderado por temporada.** Rappelt et al. 2026 mide −19 % en el top-100 PRO masculino entre S1 y S7 (ωp²=0,76). Un prior sin reponderar predice el nivel de 2022 con toda la confianza del mundo.
3. **Por división Y formato.** Consecuencia directa del stress-test: la curva de fatiga y el reparto del tiempo de dobles no son los de singles. Un promedio global no sirve para nada.

**Por qué:** es la única forma de darle un número a quien no ha medido nada — que es todo el mundo el día que se instala la app, y el 100 % del embudo free. Y la vía está validada en revisión por pares: el estudio de referencia del deporte (39.696 resultados PRO/ELITE) se construyó exactamente así, con scripts propios sobre los resultados públicos.

**En consecuencia, no hacer:** no exhibir ni almacenar resultados de terceros a nivel de persona; no usar el prior para nada que no sea encoger una estimación propia; y no bloquear el resto del trabajo esperándolo — 8 de las 9 piezas del plan de `docs/prediccion-hyrox-v2.html` §09 no dependen de él.

**Dónde vive:** decidido, sin construir. `docs/prediccion-hyrox-v2.html` §10.

---

## 2026-08-04 · La durabilidad es un parámetro del atleta Y DEL FORMATO — no una constante de fatiga

**Decidido:** el modelo de predicción v2 (`docs/prediccion-hyrox-v2.html`) deja de tratar la fatiga de la prueba como un escalar. Pasa a ser una **curva de ocho valores** indexada por *(atleta, formato)*, estimada de los datos con encogimiento hacia un prior de su bracket. El «factor de transferencia personal» de hoy —un número único que además solo existe si el atleta ya tiene una carrera— queda como caso degenerado de esa curva.

**Por qué:** se probó la curva poblacional de singles contra las 8 carreras-equipo reales de producción (todas dobles) y el error medio va de 22 a 85 s por vuelta; una de las ocho corre **más rápido al final que al principio en las siete vueltas**. Es física del formato, no ruido: en dobles se corren los 8 km enteros pero las estaciones se reparten, así que se llega a cada vuelta mucho menos fatigado. El mismo stress-test tumbó el reparto del tiempo: Rappelt da carrera 48,5 % / roxzone 7,3 % en singles PRO, y nuestras dobles dan carrera 49,6-60,6 % (media 54,6 %) y roxzone 6,8-11,1 %.

**En consecuencia, no hacer:** no usar una referencia de singles para presupuestar dobles — hoy `dobles-gap` cae, cuando falla el cohorte, a «la carrera de singles del atleta más rápido como referencia de forma», y esa forma en dobles no existe. Y si algún día se importa población, importarla **por división y formato**, nunca un promedio global.

**Dónde vive:** propuesta, sin código. El motor afectado sería `shared/domain/goal-gap/predict.ts` (`personalTransferFactor`) y `shared/domain/dobles-gap/compute.ts` (fuentes de presupuesto).

---

## 2026-08-04 · El ergómetro predice el resto de la carrera mejor que la propia carrera

**Decidido:** `next_inputs` («qué medir para estrechar el rango») se reordena por señal medida, no por intuición. El remo y el ski pasan por delante del 5K.

**Por qué:** dos conjuntos de datos independientes, con tres órdenes de magnitud de diferencia en tamaño, coinciden. Rappelt et al. 2026 (39.696 resultados PRO/ELITE, regresión cuantílica sobre «el resto del tiempo»): remo pseudo-R² 0,25-0,46 frente a carrera 0,14-0,35. Nuestras 8 carreras (n bajo, indicativo): ski 0,92 · remo 0,92 · carrera 0,45. Y el PM5 mide un remo de 1000 m con precisión de laboratorio y a coste cero para el atleta, mientras que un 5K le cuesta una sesión.

**En consecuencia, no hacer:** no seguir pidiendo primero la marca de carrera solo porque correr sea la mitad del tiempo de la prueba. Pesar mucho en el reloj no es lo mismo que informar mucho sobre el resultado.

**Dónde vive:** propuesta. Afectaría a `shared/domain/goal-gap/next-input.ts`.

---

## 2026-08-04 · El avance es del escalón más pequeño, y eso lo decide el MOTOR — nunca una pantalla

**Decidido:** `primaryAdvance()` es el único sitio donde se declara qué significa «siguiente» para cada formato, y ese significado es **el escalón más pequeño que el atleta tiene delante**: la fase en un EMOM, la ronda en un rotativo, la pierna en una carrera estructurada y **la SERIE en fuerza**. Ninguna vista puede tener una regla de avance propia.

**Por qué:** la fuerza era la excepción — su regla («con series pendientes no se cierra el ejercicio») vivía dentro de `FuerzaVivoView`, una vista SwiftUI del iPhone. El botón «Siguiente ▸» del reloj entra por `PhoneMirrorService.applyCommand` → `primaryAdvance()` sin pasar por ninguna pantalla, así que se la saltaba entera: en el gym del 4-ago, un toque en la muñeca durante la serie 1 de press de banca cerró el ejercicio de cuatro series y saltó al curl. Y el segundo fallo reportado ese día —«no respeta el descanso del primer ejercicio»— no era un bug aparte sino su consecuencia: los dos ejercicios comparten bloque, así que el salto fue mudo (sin preview intermedia), `primeSetsIfNeeded` ya había recargado las series del curl, y el 1:30 que sonó era el descanso por defecto del curl con el atleta todavía en banca.

La lección general, que es la que hay que recordar: **una regla de dominio metida en una vista es una regla que solo se cumple en esa vista.** Cada superficie nueva (el reloj, mañana un mando, una Live Activity con botones) la vuelve a romper.

**En consecuencia, no hacer:** no volver a poner condiciones de avance en una vista; si una pantalla necesita saber qué hará el toque, que se lo PREGUNTE al motor (`pendingSetIndex`) y lo rotule, sin decidirlo. Y no declarar «este toque termina la sesión» mirando solo si hay bloque después: en un entreno de fuerza libre todos los ejercicios van en UN bloque, así que era cierto desde la primera serie.

**Dónde vive:** `WorkoutSession.primaryAdvance` / `strengthPrimary` / `pendingSetIndex`, `PhoneMirrorService.buildFrame` (`isFinalStep`). Commit `d9b67424`.

---

## 2026-08-04 · El conteo de series es DOSIS: lo decide la prescripción, no el esquema

**Decidido:** el multiplicador de una prescripción («4 × 10») se lee de los propios sets y va **en el titular**, pegado a la medida. Se pone cuando los sets son **repeticiones de la misma dosis**, y NUNCA cuando son la **rotación** de un bloque plegado, donde cada set es un movimiento distinto (el fold siempre escribe el nombre en `note`) y «3 ×» delante de remo/ski/cinta significaría hacer cada uno tres veces.

**Por qué:** `summaryLine` solo ponía el «N ×» si el esquema era literalmente `.intervals`; para `.sets`, core y movilidad leía `sets.first` y tiraba el resto. Un 4×10 de fuerza llegaba a la pantalla de antes de empezar como «10 · Corporal · descanso 15s» — y «4 × 10» y «10» no son la misma prescripción con más o menos adorno, son dos entrenos distintos. La condición estaba escrita sobre el caso que se tenía delante (las series de correr) en vez de sobre el concepto.

**Y la segunda mitad, que es la misma enfermedad:** existían DOS formateadores de la cabecera de formato — `PrescriptionRenderer.wodHeader`, que solo conocía amrap/emom/for_time y es el que lee la previa, y `conditioningFormatLabel` escondido dentro de `ActiveWorkoutView`, que cubría Tabata, Death By, Series, Continuo, Chipper, Ladder, Rondas y sim de HYROX. Por eso un circuito llegaba a la previa sin cabecera y aparecía con ella al arrancar el entreno. Queda uno solo (§2 del contrato de UI), cubriendo todos los esquemas con reloj.

**En consecuencia, no hacer:** no condicionar un formateador por esquema cuando la pregunta la contesta el dato (¿son repeticiones o son movimientos?); no enrutar la tabla por series por MODALIDAD (un core de 3×20 tiene la misma forma que un 4×10 de banca); y no enseñar `PrescriptionScheme.displayName` al atleta — es el vocabulario del cable, en inglés.

**Dónde vive:** `PrescriptionRenderer.repetitionCount` / `summaryLine` / `wodHeader`, `PreWorkoutBriefView.itemView`. Commit `c8e5c156`.

---

## 2026-08-04 · Un entreno de fuerza es una lista de GRUPOS, y un grupo es N rondas × K estaciones

**Decidido:** la unidad del entreno de fuerza deja de ser el ejercicio suelto y pasa a ser el **grupo**: `N rondas × [estación₁…estaciónₖ]`, con **descanso entre estaciones** (dentro de la ronda) y **descanso entre rondas**. Un grupo de una sola estación son las series seguidas de toda la vida (`4 × 10, descanso 1:30`) y se comporta exactamente igual que hoy; un grupo de dos es una **biserie**; de tres o más, triserie y circuito de fuerza. Un mismo modelo, sin casos especiales.

**Por qué:** el 4-ago Alex montó dos ejercicios queriendo hacerlos intercalados y descubrió que no hay manera de decirlo — el constructor asume en silencio que todo va seguido. Y las dos formas son igual de normales en una sala de pesas, así que la que faltaba no es un extra: es la mitad del dominio. Además, con el modelo viejo el número de series vive en cada ejercicio, y en una biserie eso admite estados sin sentido (4 series de uno y 3 del otro): las rondas son del GRUPO porque la ronda es lo que se repite.

**Cómo se ejecuta, y por qué así:** un grupo es un **BLOQUE** (cada uno con su `blockPosition`), y cada estación sigue siendo **un tramo**. Eso mantiene los tramos 1:1 con los `items[]` del guardado —que mapea ejecución↔prescripción por posición—, así que el contrato con el servidor no se toca. El motor recorre el grupo por rondas y al cerrarlo emite K laps, uno por estación, cada uno con sus R series. El descanso no necesita campo nuevo: el `restS` de cada set ya lo expresa — las estaciones intermedias llevan el de cambio, la última la de la ronda.

**En consecuencia, no hacer:** no meter el número de rondas en la estación (queda contradecible); no plegar el grupo en un solo tramo para simplificar el motor, porque rompería la atribución por ejercicio que lee el coach; y no inventar un campo de descanso nuevo en el contrato compartido cuando `PrescriptionSet.rest_s` ya lo dice.

**Dónde vive:** `FreeStrengthBuilder`, `WorkoutSession`, `FuerzaVivoView`.

---

## 2026-08-04 · Resumen post-entreno: un lap por minuto EMOM + informe de sesión

**El fallo (Alex, gym):** tras un EMOM con PM5 el resumen solo pedía RPE; no había ritmo por estación ni totales útiles, pese a que el monitor manda cal/ritmo/W.

**Decidido:**
1. **EMOM graba un `LapRecord` por minuto de TRABAJO** (`recordEMOMIntervalBout`), con modalidad del tramo (row/ski/run/…), metros/cal/ritmo/W/HR de esa ventana. `runLegIndex` = ordinal del minuto.
2. **No hay lap blended del bloque** si ya hay bouts por minuto (misma regla que series erg 5×500). Las rondas EMOM X/Y se estampan en el último bout.
3. **Resumen final** pinta `ResumenSesionCard` (totales + por máquina) y `TablaDeTramos` con filas «1. Remo · 1:52/500m · 12 cal».
4. **Se guarda** vía `SegmentPayloadBuilder` → `SegmentExecutionDTO` (ritmo, cal, potencia, modality por tramo).

**En consecuencia, no hacer:** no volver a un solo lap "functional" para un EMOM multi-estación; no inventar ritmos sin medición; no pintar card de sesión vacía.

---

## 2026-08-04 · Multi-máquina en funcional: slots por rol + pool PM5

**El fallo (Alex, gym):** en un EMOM/AMRAP/For Time con remo + ski + run en cinta no se podía conectar ni ski ni remo (el remo ni salía), ni la cinta. El sistema tenía un solo chip «Remo» y un solo `PM5ConnectionStore`, y la elegibilidad miraba el `kind` del segmento (que en un funcional colapsa a `.reps` / `.strength`), no las modalidades de cada movimiento.

**Decidido (mecanismo, HARD RULE Nº0):**

1. **Slots por máquina, no un PM5 genérico.** La previa ofrece `Cinta` · `Remo` · `SkiErg` · `BikeErg` · `Banda` según lo que el session toque de verdad (`involvesRun` / `involvesErg` + modalidades de `sets[]` / `ergKind`). Caso extremo: EMOM 10 cal remo · 10 cal ski · wallballs · 200 m cinta → tres máquinas + banda a la vez.

2. **El atleta asigna cada PM5 a un rol.** El monitor no anuncia ski vs remo; el slot es la asignación. Un mismo peripheral no puede ocupar dos roles (`excludePeripheralIds`).

3. **`PM5Pool`:** un store por rol (cada uno con su `PM5Service` / CBCentralManager) + el unscoped `any` para mono-erg legacy. El tramo vivo resuelve `activeStore(for: modality)` → feed + program solo ese monitor.

4. **Contadores (ya decidido 2026-08-03):** EMOM ronda ergo = `perTramo` (reset a 0 al entrar en ski o remo). AMRAP / free-order acumulativo = `cumulativeSegment`. Al final del entreno se suma el trabajo medido de todos los monitores.

5. **Free functional:** cada set del fold lleva la modalidad del ejercicio (catálogo / categoría / slug). Sin eso el live tramo no sabe qué máquina es y no se ofrece slot.

**En consecuencia, no hacer:** no volver a un único chip «Remo» para todo ergo; no conectar el PM5 mirando solo `segment.kind`; no programar el piece en un monitor de otro rol; no exigir conectar (sigue siendo opcional).

**Código:** `ErgMachineRole` · `PreWorkoutDeviceEligibility` · `PM5Pool` · `DeviceConnectCard` multi-rol · routing en `ActiveWorkoutView` · fold de `FreeFunctionalBuilder`.

---

## 2026-08-03 · El doble mentía con autoridad: sellos fechados, re-verificables, y el índice por recencia

**El fallo (Alex: «no podemos fiarnos de eso»):** el índice del doble hacía afirmaciones que nadie re-verificaba. Auditado contra el Swift real: **los 5 espejos estaban desfasados** — congelados justo antes de la campaña iOS del 29-jul/3-ago («un guion no es un dato»: donde no hay medida se omite el elemento o se explica con palabras) — y uno (`devices`) nació ya incompleto (el banner de conexión perdida del PM5 existía desde el 20-jul y el espejo se declaró el 28 sin él). Peor: **24 de las 33 «propuestas» ya estaban construidas en Swift** (la tanda del 30-jul implementó las propuestas casi literalmente y nadie re-selló el doble), «Tests guiados» figuraba como pendiente teniendo doble (`tests-calibracion`), y `ranking-box` afirmaba un dato falso («los datos ya viajan en el GET de marcas» — el endpoint no lleva percentil ni cohorte).

**Decidido:**
- **Toda afirmación del doble lleva fecha.** `TwinMeta.actualizado` (YYYY-MM-DD) es obligatorio y se estampa **en el mismo commit** que el cambio de diseño. «Espejo» ya no significa «así está la app hoy» sino «réplica del Swift a esta fecha» — la fecha delata el desfase en vez de esconderlo.
- **Estado nuevo `construida`:** la propuesta se shipeó en Swift (`fuentes` = los ficheros que la construyeron) pero el doble no está re-verificado contra ese Swift. Es la antesala honesta de `espejo`. Re-sellados 12: tests-calibracion, perfil-rendimiento, analiticas-veredicto, chat-coach, entreno-vivo, gate-bloque, post-entreno, sesion-previa, plan-semana, vivo-fuerza, vivo-emom, vivo-fortime.
- **Campo `enApp`** en propuestas parciales: una frase con lo que el Swift actual ya tiene y lo que sigue siendo futuro (14 pantallas: vivo-erg/correr/amrap/dobles, watch-dobles/series/fuerza/rodaje/amrap/fortime/cinta/emom, plan-bloque, ranking-box).
- **Detector permanente:** `cd web && pnpm run twin:desfase` compara la fecha git de cada fuente Swift contra el `actualizado` de su espejo y lista los podridos (exit 1). Correr al tocar UI de iOS y al abrir sesión de diseño.
- **El índice contesta primero «¿qué es lo nuevo?»:** sección «Lo último» por fechas (cards para el día más fresco, pastillas para los lotes), fecha en cada card, zonas ordenadas por recencia y la tanda del entreno colapsada en una card-colección (21 pantallas dejaban ilegible el inventario).
- **PENDIENTES = pantallas que existen en la app sin doble** (semántica explícita): Hoy (InicioView), Entreno libre (FreeWorkoutBuilderView), Onboarding día 1. «Tests guiados» eliminado — su doble existe.

**En consecuencia, no hacer:** no declarar `espejo` sin `fuentes` + verificación contra el Swift de ese día; no dejar en `propuesta` algo que Swift ya construyó (→ `construida`, y a `espejo` solo tras re-verificar); no cambiar una pantalla del doble sin bump de su `actualizado`; no volver a un índice sin recencia.

---

## 2026-08-03 · Contadores PM5: la app es dueña del tramo

**Decidido:** en ergo (remo/ski/bike), la app y el PM5 miden **la misma unidad de trabajo (el tramo)**. La app **programa el piece al entrar en cada tramo de trabajo** y el contador de m/cal de esa ventana parte de cero. Libre y prescrito comparten `ErgCounterPolicy` + `PM5WorkoutProgrammer` + `WorkoutSession` — no hay camino especial.

| Scope | Cuándo |
|---|---|
| `perTramo` | Series m/cal, pirámide, EMOM ronda ergo, estación For Time, steady con goal |
| `cumulativeSegment` | AMRAP (window entero); formatos fixed free-order sin cursor de estación |

| Close | Cuándo |
|---|---|
| `machineGoal` | Cruce de m/cal (series, estaciones, steady) — test de CRUCE, no umbral estático |
| `formatClock` | EMOM (el minuto manda); AMRAP |
| `sessionClock` | Series por tiempo |
| `athleteTap` | reps / sin goal |

**App-dueña de series:** se abandona el default de intervalos nativos del PM5 (`distanceIntervals`/`calorieIntervals` que no tienen count de rondas). Cada bout se programa como **fixed** de esa medida; el key de ventana es el del tramo → el monitor vuelve a “row to begin” en cada serie.

**Count-in:** al GO se re-ancla la ventana (`reanchorTramoDeviceWindowAtGo`) — lo remado en el 3-2-1 no cuenta.

**UI:** goal de cal pinta `0 / N` sin esperar el primer sample; strip y rest usan ventana de tramo, no el acumulado crudo del PM5.

**Plan:** `docs/plan-sincronia-contadores-dispositivo.md`. Código: `ErgCounterPolicy`, programmer por tramo, auto-cierre series, strip.

**En consecuencia, no hacer:** no volver a programar series como intervalos nativos del PM5 por defecto; no auto-cerrar un EMOM por cruce de cal (el reloj del minuto manda); no resetear el contador en un AMRAP por “ronda mental”; no pintar `live.distanceMeters` crudo en superficies de tramo.

---

## 2026-08-02 · Los tests: TRES sistemas paralelos, y ninguno deja al coach escribir el test que quiere

**El hallazgo (no es una decisión todavía: es el diagnóstico que la precede).** Alex pidió algo elemental —«que el coach pueda montar un test de ergo de 2 × 2 min y que calibre zonas»— y el sistema no puede. Al abrirlo aparecen **tres vocabularios de test conviviendo**, sin hablarse:

1. **`shared/domain/methodology/test-types.ts`** — cinco tipos cerrados (`row_2k`, `ski_2k`, `run_3min`, `run_9min`, `run_30min`) con modalidad × medida × cantidad. **Sí modela tests por DURACIÓN** y sabe resolver un umbral con ellos.
2. **`coach_calibration_tests` (#34)** — lo que Pablo ve en `/tests`: nombre, formato, **protocolo en texto libre**, resultados y agenda.
3. **`methodology_tests`** — el catálogo del RAG.

**Los cinco huecos objetivos, con su fichero:**

- **El coach no puede definir QUÉ se hace.** El protocolo es prosa. El contenido se materializa como *un segmento por resultado* con `prescription_json = NULL` (`web/lib/coach/calibration-content.ts`: *«there is no coach-facing editor for a templates row today»*). Solo los cuatro protocolos sembrados traen tramos reales. Conclusión: **un test escrito por el coach no se puede ejecutar guiado en iOS** — ni cuenta intervalos, ni cierra tramos, ni sabe cuántas series hay.
- **El catálogo de calibración clava protocolo ↔ derivación.** `CALIBRATION_TARGETS` (`shared/domain/coach/test-battery.ts`) dice que «zonas de carrera» son *el tiempo de un 5K* y «zonas de remo» *el tiempo de un 2K*. No hay forma de calibrar con un 30′ (el estándar de umbral), ni con 3′/9′, ni con 2 × 2′ — aunque el sistema (1) ya sepa hacerlo.
- **Una medida de DISTANCIA no puede calibrar nunca.** `CALIBRATING_MEASURES = time | load | hr` (`shared/schema/test-battery.ts`). Todo test de tiempo fijo —Cooper 12′, 2 × 2′, cualquier MAS test— se guarda como baseline muerto. Es exactamente el caso que se pidió.
- **Falta la AGREGACIÓN.** Un `store_result` es un valor suelto: no existe «la media de los dos tramos» ni «el mejor de los seis». Sin eso, un test de N esfuerzos no tiene resultado.
- **El pulso se teclea.** La app mide sola el `hrr60` desde el stream de FC, pero el **umbral de pulso (`lthr_bpm`) lo escribe el atleta a mano**, teniendo nosotros la serie entera de un test máximo. Alex: *«es un test de cardio: tienen que calibrar zonas… con el pulso se ven las zonas, pero hay que saberlo».*

**La forma que tendría que tener un test, y que hay que decidir:** *protocolo estructurado* (la gramática de prescripción que YA existe: calentamiento + N esfuerzos + recuperaciones) × *qué mide cada tramo* (tiempo | distancia | potencia | FC | carga, leído del monitor/GPS/reloj) × *cómo se agregan los tramos* (media | mejor | suma | último) × *qué ancla produce* (ritmo umbral | FC umbral | 1RM | nada) **con el ajuste como dato del coach** — el estándar del deporte es mecanismo nuestro (un 30′ ES el umbral; un 2K va unos segundos por debajo), pero **el número exacto lo edita el coach**, HARD RULE Nº0.

**Lo que sí se decidió y ya está construido:** la superficie del atleta (`/es/design/test-comparativa`, pantalla `propuesta` del doble). Un test se lee **contra otro**, y el sujeto son **las zonas** (dirección de Alex, 2-ago: «las zonas son muy importantes en HYROX, tanto en running como en ergs»): la marca antes → ahora con delta y % · la referencia elegible (anterior · hace 3 meses · tu mejor · 1ª vez) · **la escalera de las seis zonas con la banda de cada una entonces y ahora** — como las bandas del coach son cortes fijos sobre el umbral, el test que lo mueve las mueve todas, y eso es lo que se ve — · el desglose por tramos con su pulso. La v1 (el umbral como un pin en una escala) queda sustituida.

**En consecuencia, no hacer:** no añadir un cuarto vocabulario de test; no comparar dos intentos de protocolos distintos aunque calibren lo mismo; no colorear el delta de pulso de un test máximo como si fuera un veredicto (solo dice algo junto al rendimiento); no pintar como mejora un delta que no mueve el umbral ni medio segundo; y no dejar que el coach cree un test que **parezca** calibrar y luego no calibre.

---

## 2026-07-29 · ATR sale del repo — y la lección es que se buscó por el nombre, no por el significado

**Decidido (Alex, orden directa):** desaparece del repo toda traza de la periodización ATR (Acumulación / Transformación / Realización). Migración **0148**: se borra `templates.target_block` y su enum `target_block`, el valor `atr_transition_suggested` de `notification_type`, y los enums huérfanos `block_status` / `macrocycle_status` que el motor ATR dejó atrás al morir en 0068. Fuera también del schema TypeScript, de las seis rutas que escribían `::target_block`, del prompt del LLM que compone la semana, de los scripts de seed, de los comentarios y de `docs/design/`.

**Por qué sobrevivió un mes a su propia retirada — esto es lo que hay que recordar:** las migraciones 0064 y 0068 borraron `atr_blocks`, `atr_macrocycles` y el enum `atr_block_type`, y dejaron aquí escrito el porqué. Pero **la columna viva no se llamaba `atr_` sino `target_block`**, así que aquella limpieza —que buscó por la cadena «atr»— la dejó entera. La lección operativa: **una retirada de metodología se barre por SEMÁNTICA (acumulación, transformación, realización, ACC/TRANS/REAL, «fase», «bloque», periodización), nunca por el nombre de la escuela.** Un catálogo de fases puede llamarse cualquier cosa.

**Los datos decían que no se perdía nada, y por eso se borró en vez de migrarse:** de 125 plantillas en producción, las 69 con valor ATR (ACC 64 · TRANS 4 · REAL 1) eran **todas del coach 4 («alexsole»), la cuenta de desarrollo**. Las 56 de los coaches reales (60/61/62) decían `any`, que no dice nada. Ningún coach de verdad clasificó nunca un entreno por fase ATR.

**Qué pasa con el prompt de composición semanal:** `compose-week.ts` metía `bloque=${target_block}` en la lista de plantillas que ve el modelo. Para el 100 % de las plantillas de coaches reales eso era literalmente `bloque=any` — ruido, no señal. Y el canal agnóstico que lo sustituye **ya existía y ya llegaba al modelo**: `focus`, texto libre del coach (2-400 caracteres), que viaja literal como «Foco de la semana (literal del coach): …». El coach dice con sus palabras qué toca esa semana; no se le ofrece el desplegable de la doctrina de otro.

**En consecuencia, no hacer:** no reintroducir un catálogo de fases bajo ningún nombre (`target_block`, `phase`, `block_type` como enum cerrado…) — el ORDEN de los microciclos ES la periodización y su NOMBRE lo pone el coach; no volver a barrer una metodología buscando su sigla; y no meter en un prompt un campo cuyo valor real es `any` en casi todas las filas, porque enseña al modelo una estructura que el coach nunca pidió.

**Queda pendiente de decisión (reportado, no tocado):** `methodology_blocks` + `methodology_rules` + `shared/domain/methodology/*` son un motor de reglas **muerto** (0 filas en producción, ningún lector en `web/`) cuya forma sigue siendo la de un catálogo de fases, y su seed se llama `PABLO_DEFAULT_RULES`. Se le quitó el ATR; la decisión de borrarlo entero o revivirlo agnóstico no está tomada.

---

## 2026-07-29 · La tanda inmersiva del entreno: una vista por QUIÉN GOBIERNA, no por pantalla genérica

**Decidido:** el entreno en vivo del atleta (iOS) no es una pantalla con variantes — son **vistas distintas con sujeto propio**, y lo que las separa son dos variables ya establecidas por el motor: *quién gobierna la transición* (el reloj en EMOM/AMRAP · el hito medido en series de calle/cinta/ergo · el atleta en fuerza · el suceso en For Time · el relevo en dobles) × *qué fuente mide* (GPS, monitor del ergo, cinta en lectura, reloj de pulso, o nadie y se toca). De ahí salen las diez familias `propuesta` del doble shipeadas hoy: `plan-bloque`, `sesion-previa` (con vídeo por ejercicio), `vivo-correr`, `vivo-erg`, `vivo-fuerza`, `vivo-emom`, `vivo-fortime`, `vivo-amrap`, `vivo-dobles` y `watch-vivo`. Cinco huecos de PENDIENTES quedan cubiertos y salen del índice (plan de la semana, detalle de sesión, HUD de fuerza/metcon, la ruta entera como lista, dobles en vivo).

**El lenguaje común que las une (y que la implementación Swift debe respetar):** un solo sujeto por estado, legible a 2 metros sudando; la zona de pulso tiñe el ambiente (no un chip perdido); el descanso es una pantalla con sujeto propio (cuenta atrás + pulso bajando + qué viene); las transiciones se ANUNCIAN (flash + cambio de sujeto); y la honestidad del §7 en vivo: una dosis null se pinta sin fabricar, un monitor parado no cierra un tramo (cierra el cruce o el toque), lo estimado viaja marcado y lo tachado enseña lo MEDIDO (1.014 no se redondea a 1.000).

**Ampliado el mismo día, validado por Alex — el giro con máquina:** «el tramo decide la cara; el formato nunca suelta la franja». En EMOM/For Time/AMRAP con ergo conectado, HORIZONTAL enseña la **cara de monitor del tramo activo** (no de la conexión: en el minuto de burpees no hay cara de remo) y el reloj del formato vive en una **franja fija** que no desaparece jamás, con los avisos (cambio de minuto, últimos segundos, cruce del hito) flasheando POR ENCIMA de la cara; un tramo a pulso en horizontal enseña el formato adaptado, nunca un monitor sin datos. Y la **cinta es caso aparte**: al conectar, la máquina se queda ciega, así que sus datos leídos (velocidad, inclinación) van **embebidos en el HUD vertical** — nuestra view pasa a ser LA pantalla de la máquina y en la cinta nadie gira el móvil.

**Hallazgo de raíz apuntado (no arreglado aquí):** `t-readout-label` lleva `text-transform: uppercase` y convierte «/500m» en «/500M» (eme de mega). La raíz está en `Theme.Typography.readoutLabel` de Theme.swift, que `twin.css` espeja — se arregla en los DOS en el mismo lote, no en cada pantalla (dos familias lo esquivaron con un átomo local mientras tanto).

**En consecuencia, no hacer:** no volver a diseñar «el HUD» como una pantalla única parametrizada; no darle reloj protagonista a un formato donde el reloj no gobierna (en fuerza el sujeto es la serie, en For Time es el trabajo); y no shipear en Swift ninguna de estas vistas sin actualizar su pantalla del doble a `espejo` en el mismo lote.

---

## 2026-07-28 · El doble: la app vive replicada en la web, y los mockups sueltos se acaban

**Decidido:** existe una réplica viva de la app del atleta dentro de la web del producto — «el doble» — en `app.fahybrid.com/<locale>/design` (grupo de rutas `(design)`, puerta **ADMIN-ONLY**: login Clerk en el middleware + rol `admin` de `user_roles` en el layout — hoy, solo Alex; un coach sin ese rol rebota a sign-in —, `noindex`). Es la herramienta interna de dirección de UX: cada pantalla se toca, gira (vertical/horizontal), cambia de apariencia (claro/oscuro) y SIMULA lo que en el mundo real es asíncrono — el monitor del remo que aparece al escanear, el GPS que tarda, la cuenta atrás del descanso. En el móvil, «pantalla completa» pinta el lienzo 1:1 y la orientación sigue al teléfono físico.

**El contrato de sinceridad:** cada pantalla lleva sello — **espejo** (réplica de Swift shipeado, con sus ficheros fuente listados en el panel), **propuesta** (mockup de algo aún no construido) o **pendiente** (hueco reconocido, card apagada en el índice). El desfase con la app se VE en el índice, no se sospecha.

**La regla de proceso desde hoy:** (1) los mockups nuevos de UX de la app NACEN como pantallas `propuesta` del doble — se acabaron los artifacts y HTML sueltos para UI de la app; (2) cuando un cambio de UX se shippea en Swift, su pantalla espejo se actualiza EN EL MISMO LOTE (y una propuesta construida pasa a espejo); (3) si Theme.swift cambia un token, `web/app/[locale]/(design)/design/twin.css` cambia en el mismo lote.

**Fuente de verdad visual:** `twin.css` transcribe Theme.swift + ZoneColors.swift (ambas apariencias, paleta de modalidades, voz readout mono). El `colors_and_type.css` de mayo se quedó atrás (sin modo claro, sin modalidades, `--accent-on` blanco cuando la app usa #511900) y queda como histórico de artefactos viejos — no usarlo para nada nuevo. Tipografía del doble: pila del sistema (`-apple-system`), no Archivo — en un dispositivo Apple renderiza SF real, idéntico a la app; Archivo sigue siendo el sustituto para artefactos fuera de Apple.

**Qué NO es el doble:** no es QA físico. El BLE real, las físicas de scroll y los caprichos de firmware (el PM5 con una pieza a medias de verdad) solo se prueban en el iPhone. El doble decide UX; el dispositivo decide verdad.

**En consecuencia, no hacer:** no crear mockups de pantallas de la app fuera del doble; no editar `colors_and_type.css` esperando que la app lo lea (la app lee Theme.swift); no enlazar `/design` desde ninguna nav de producto; y no rebajar la puerta a sesión de coach — es la mesa de trabajo de Alex y un coach (Pablo incluido) no debe ver propuestas a medias.

---

## 2026-07-28 · La app LEE las máquinas, no las conduce

**Decidido:** `TreadmillControlPolicy.appDrivesMachines = false`. La app no envía comandos de velocidad ni de inclinación a ninguna máquina: **lee lo que la máquina reporta**. Y por separado: un Control Point BLE **no declara nada por sí solo** — `declaresSpeedTarget` / `declaresInclineTarget` valen `false` por defecto, porque *la ausencia no es un sí*.

**Por qué:** la BH i.Concept **no admite control de velocidad por BLE** (ver la memoria del proyecto). Prometer que la app conduce la cinta es prometer algo que el hardware no cumple.

**La capa de comandos NO se borra:** sigue shipeada y vuelve el día que haya una cinta que obedezca. La política es un campo de `TreadmillControlCapability` cuyo **default ES la política**, así que el comportamiento en producción no depende de que nadie se acuerde.

**Escrito el 29-jul, y esa demora tuvo un coste medible:** la decisión vivía **solo en un comentario** de `TreadmillControlPolicy`. Cinco tests de `TreadmillControlModelTests` llevaban un día en rojo clavando el comportamiento retirado —uno afirmaba literalmente que un comando de velocidad llega a la cinta— y **nadie sabía por qué**, así que los 15 fallos se convirtieron en «la línea base» y seis agentes verificaron su trabajo contra ellos. **Esta entrada existe para eso: lo que se retira sin dejar constancia es lo que alguien reconstruye seis meses después.**

**En consecuencia, no hacer:** no volver a escribir un test que dé por hecho que la app conduce una máquina; no interpretar la presencia de un Control Point como capacidad; y no retirar un comportamiento sin escribirlo aquí.

---

## 2026-07-29 · Un lead es del coach por cuyo ENLACE entró, y eso se graba al captar

**Decidido (Alex):** el dueño de un lead es **el coach** — «de momento», así que se modela para que mañana pueda pasar a ser el club sin reescribirlo, pero hoy es una persona. Y la atribución **se graba en el momento de la captura**; no se deduce después mirando quién hay en la base.

**El mecanismo, y lo bueno es que ya funciona así sin saberlo:** un lead entra por un **enlace** («la web que dice habla con nosotros»), y ese enlace tiene dueño. Nuestro embudo de FAHYBRID **es simplemente el enlace de Pablo**; el día que entre otro coach, el suyo apunta a su panel. Mismo camino, cero casos especiales, y no hace falta un modo «nuestro» y otro «de ellos».

**Por qué al captar y no después:** es la misma regla que ya rige la procedencia de una marca (`declarado` vs `medido`) y el `recorded_via` de una ejecución — **quien no lo grabó en su momento, ya no lo sabe**. Resolver el dueño a posteriori significa adivinarlo, y adivinar aquí es mandarle a un coach el lead de otro.

**Los leads existentes se rellenan hacia atrás con Pablo**, porque es la verdad: llegaron por su enlace.

**Y el caso sin enlace atribuible** (alguien escribe al correo genérico) **no se adivina**: el lead se queda **sin asignar** y alguien lo asigna a mano. Ese estado tiene que existir explícitamente aunque hoy no ocurra — es lo que impide que mañana un lead ajeno caiga en el panel de Pablo por defecto.

**En consecuencia, no hacer:** no resolver el dueño de un lead consultando la base en el momento de leerlo; no poner un coach por defecto cuando falta la atribución; y no tratar nuestro embudo como un caso especial del producto.

---

## 2026-07-29 · MÉTODO es dato del coach; MECANISMO es código. El censo, y lo que destapa

**Contexto que cambia el listón:** este código se venderá como **FLEXR** a otros entrenadores. Pablo es **nuestro coach de pruebas**, no el destinatario. Queda como **regla Nº0** en `CLAUDE.md`. La pregunta que decide cada caso: ***¿otro entrenador competente lo haría distinto?*** Si sí, es método y nace como **dato con valor por defecto**, nunca como `const`.

**Lo que el censo del 29-jul destapa, y es la quinta vez hoy que aparece el mismo patrón:**

**`coach_methodology` (migración 0048) tiene 37 columnas que son EXACTAMENTE los ajustes de este censo — anclas de zona, gates de HRV/sueño/agujetas, taper, freshness, tono de voz — y tiene CERO filas y se lee UNA sola columna** (`one_rm_estimation`). La capa multi-coach está construida, migrada y desconectada. Igual que `methodology_rules` (0 lectores, sin evaluador), `coach_guidance` (0 uso) y otras seis tablas de la misma migración.

**Tres hallazgos estructurales que no se arreglan con un dato:**

1. **El `sub_score` del check-in lo calcula el iPhone** (`CheckinModel.swift`) y el servidor lo guarda verbatim. Es el componente con más peso del readiness (0,35) y **cambiarlo exige una release de App Store** — y dos versiones de la app escriben números incomparables en la misma columna. Las 5 respuestas crudas ya están en `daily_checkins`, así que **el cálculo se mueve al servidor** (y de paso cierra que hoy se guarda un número del cliente sin validar).
2. **Hay CUATRO respuestas a «¿cuántas zonas hay?»** — 5 en `prescription/types.ts`, 6 en `methodology-system.ts`, 7 en `workouts.ts` y `templates.ts`, y 3..7 en `coach_methodology.hr_zone_count`. Ningún coach puede cambiar su modelo de zonas sin tocar cinco ficheros.
3. **Las zonas de FC están clavadas mientras las de RITMO ya son dato por coach** (`methodology_zones`, 36 filas, cableada de punta a punta). Mismo concepto, dos tratamientos opuestos en el mismo repo — y `hr-zones.ts` se autodenomina «la única fuente» mientras `coach_methodology.hr_anchor` existe y se ignora.

**Y hay identidad cementada en producto vendible:** **«Pablo ha publicado tu plan» en 7 push a atletas** (con el `join coaches` ya existiendo en `chat/notify.ts`), `Europe/Madrid` como «hoy» de todo el mundo, el onboarding geo-bloqueado a España, y **ATR vivo en el schema** (`['ACC','TRANS','REAL']`, enum `atr_block_type`) contradiciendo a las migraciones 0064/0068 que borraron las fases.

**Orden decidido, y el orden importa:** no se puede hacer editable algo que vive en cinco sitios.
1. **Capa 0 — desduplicar**: un registro en código (`shared/domain/methodology/profile.ts`) con todos los ajustes y **su valor de hoy como default**. Es refactor puro, cero cambio de comportamiento.
2. **Capa 1 — overrides por coach**: reutilizar `coach_methodology`, con el patrón que YA funciona en `loadCoachOneRmMethod` y `loadCoachZonesForUnit`. **La migración no puede cambiarle el comportamiento a nadie, y no es promesa sino aritmética: la tabla tiene 0 filas, así que todo resolver devuelve el default de código.**
3. **Capa 2 — editor en `/ajustes`**, incluido el de zonas, que hoy no existe.

**Versionado:** no inventar un «perfil versionado» — reusar el patrón de `athlete_zone_profiles` y **snapshotear el perfil resuelto sobre lo que se persista como evidencia**, para que un veredicto de marzo no se reinterprete con los umbrales de julio.

**En consecuencia, no hacer:** no escribir una constante que huela a metodología sin hacerse la pregunta; no volver a crear un catálogo de fases (0064 lo borró a propósito: **el orden de los microciclos ES la periodización**); y no dar por buena una capa configurable sin comprobar que **alguien la lee**.

---

## 2026-07-29 · Lo que el atleta declara es SU dato: puebla la app desde el minuto uno

**Decidido (Alex):** todo lo que el atleta responde en el onboarding **se guarda y se enseña** — en su app y en el dashboard del coach — desde que descarga la app, **siempre editable y borrable por él**. Si nos dijo su marca de 10 km, Marcas enseña su 10 km. Y así con todo.

**Por qué:** el onboarding tiene ~19 pasos que preguntan marcas, objetivo, estaciones de HYROX, umbral, hábitos, días de entreno y lesiones. Y las auditorías de composición del 29-jul encontraron las pantallas del atleta **vacías**: el hub de tests sin nada que enseñar, Marcas con 12 filas de «—», «Mis zonas» diciendo que no hay zonas. Si el atleta declara algo y luego abre la pantalla que debería enseñarlo y ve un guion, **el dato se perdió por el camino** y encima le pedimos dos veces lo mismo.

**La distinción que hace esto legítimo, y que NO se puede difuminar:** lo declarado por el atleta **no es un dato fabricado** — es suyo, y por eso puebla la app sin violar la ley de honestidad. Un valor por defecto nuestro sí lo sería. La diferencia se sostiene sobre tres condiciones: **(1)** se marca su procedencia (declarado ≠ medido por la app ≠ estimado por nosotros), **(2)** el atleta puede editarlo y borrarlo en un toque, y **(3)** una marca declarada **no compite con una medida**: cuando llega el dato real, manda el real.

**En consecuencia, no hacer:** no volver a preguntar algo que el atleta ya declaró; no enseñar un vacío en una pantalla cuyo dato está en la respuesta de onboarding; y no dejar que un dato declarado se confunda con uno medido en las analíticas.

**Pendiente:** el mapa campo por campo (qué se pregunta → si se envía → si se guarda → si lo lee el atleta → si lo lee el coach) está en curso. Las tres patologías a cazar: **huérfano** (se pregunta y no se guarda), **enterrado** (se guarda y no lo lee nadie) y **mudo** (se lee y la pantalla no lo pinta — el caso conocido de Perfil).

---

## 2026-07-29 · Sin zonas medidas, se generalizan por población — marcadas, y sin puntuar

**Decidido (Alex):** cuando un atleta no tiene zonas de FC derivables de su propia evidencia, **se le dan zonas generalizadas por población** mientras llegan los números reales de los tests. Nadie se queda sin zonas.

**La condición que las hace legítimas:** la zona por población **se marca como estimada y NO puntúa como medida**. Se pinta, se entrena con ella y empuja al test; pero **no alimenta un veredicto** como si fuera un dato del atleta. Estimar y decirlo es honesto; estimar y callarlo es fabricar. Ver la entrada «"No se sabe" es un valor de primera clase».

**Por qué hacía falta:** la escalera de evidencia del 28-jul (umbral medido → 0,88 × FCmáx medida → 0,88 × Tanaka) **solo habla en pulsaciones**, y eso la dejó invertida en producción: los atletas **66 y 67 tienen umbral MEDIDO** de carrera (`run_threshold_s_per_km`) y de remo (`row_threshold_s_per_500m`) **y no tienen zonas**, mientras que el **63, que no tiene ni un test y solo una fecha de nacimiento, tiene las cinco bandas completas**. Un cumpleaños puntuaba por encima de un test real, y **5 de 8 atletas se quedaban sin zonas** por no tener `dob`. Un vacío no ayuda a nadie.

**Trampa de tipos detectada y que hay que cerrar al construir esto:** `TssInput.lthr` es un `number | null` pelado mientras `resolveThresholdHr` devuelve `{lthr_bpm, estimated, source}`. En cuanto llegue la FC por sesión, **la marca `estimated` se cae en el límite de tipos** y el motor de carga contará como «intensidad conocida» un TSS construido desde una fecha de nacimiento, reportando 100 % de cobertura sobre algo inventado. **El tipo tiene que poder expresar la diferencia**, o esta decisión y la de la cobertura chocan en silencio.

**En consecuencia, no hacer:** no dejar a un atleta sin zonas por falta de un dato que podemos generalizar; no dejar que lo generalizado emita veredictos; y no pasar un umbral por un tipo que no distinga medido de estimado.

---

## 2026-07-28 · Una sola race readiness, y «no puntuable» deja de ser un número

**Decidido:** existe **una sola** `estimateRaceReadiness`, en `shared/domain/coach/race-readiness.ts`. Si falta una señal, **no hay nota** — no hay crédito neutro por la señal ausente.

**Por qué (escrito el 29-jul, tarde: esta decisión se tomó el 28 y no se documentó, y esa omisión es exactamente lo que permitió que se contradijera consigo misma).** Había **tres** implementaciones, no dos: la del roster, la de la ficha, y una tercera en `deep-dive-performance.ts` que era **la única que se renderizaba**. Las dos que se unificaron no las pinta ningún `.tsx`.

Los defectos medidos contra producción: la tercera fórmula daba `tsbPts = 20` si faltaba el TSB, **`hrvPts = 12` SIEMPRE** (la variabilidad ni se consultaba: se regalaba) y `sesPts = 5` — **32 puntos de piso fabricados**, que eran el **100 % del índice en 3 de 6 atletas**. Y su consulta pedía la tabla `training_load`, **que no existe en la base**: el error se tragaba en silencio y la casilla enseñaba «—» a todo el mundo desde siempre.

Peor aún, el módulo unificado **reintrodujo el mismo pecado con otro nombre**: `COMPLIANCE_UNKNOWN_PTS = 20` (de 30) y `HRV_UNKNOWN_PTS = 10` (de 20). **El 50 no había muerto: se había repartido en componentes.** La prueba, con datos reales: el atleta **72, con 74 segundos de trabajo en toda su historia, puntuaba 63**; el **66, con 0 minutos y 0 % de adherencia, puntuaba 29** de los cuales 28,8 eran fabricados; y el **64, el mejor instrumentado de todos, era el único con `null`**. El que tiene datos era el único sin nota.

**En consecuencia, no hacer:** no dar crédito neutro a una señal ausente; no dejar que una consulta rota devuelva silencio en vez de error; y **no unificar dos copias sin comprobar antes cuál es la que se renderiza** — fue lo que dejó viva la tercera.

---

## 2026-07-28 · El «suelo» de la carga: número sí, sentencia no

**Decidido:** CTL, ATL y volumen se enseñan como **suelo** (solo pueden subir con lo que falte) y **el veredicto se retira** cuando la cobertura de intensidad baja de `LOAD_COVERAGE_MIN = 0,9`. «Fresco», «cargado», «ACR alto» dejan de emitirse; la cifra se queda.

**Por qué (escrito el 29-jul: esta decisión también se tomó el 28 sin documentar, y su umbral no estaba escrito en ningún sitio fuera del código).** Un hueco de carga **no sesga el TSB en una sola dirección**: las curvas de decaimiento de CTL y ATL se cruzan a **~14 días**, así que una sesión que falte de la última quincena hace leer *más fresco* y una más vieja *más cargado*. Nadie puede corregir eso, así que la asimetría es la regla: **lo que AÑADE carga exige cobertura** (subir volumen, avanzar de microciclo) y **lo que la QUITA sobrevive al hueco** (sobreesfuerzo, semana de descarga), porque el trabajo sin valorar solo empuja más hacia lo que ya detectan.

**Contradicción abierta que esto destapa:** `progress-readiness.ts` deja pasar el veredicto **más caro** por la puerta que esta decisión cerró — emite `overreaching → regress` con confianza `high` sin mirar la cobertura, justificándose en que «el trabajo sin medir solo puede sumar». Eso es falso por construcción y lo dice el fichero de al lado: ACR = agudo/crónico, y un hueco en los días 8-28 sube el denominador y **baja** el ACR. Hoy está latente porque ningún atleta tiene microciclo activo. **O el hueco retira los veredictos, o no retira ninguno.**

**En consecuencia, no hacer:** no emitir una etiqueta de forma sobre una serie con agujeros; no tratar un hueco como si sesgara en una sola dirección; y no dar por cerrada una decisión de honestidad hasta comprobar que **se pinta**, no solo que se computa.

---

## 2026-07-28 · Las zonas de pulso se anclan en el UMBRAL, nunca en la frecuencia máxima — y el móvil deja de calcularlas

**Decidido:** existe **un solo modelo de zonas de FC**, `shared/domain/methodology/hr-zones.ts`, y es fracción del **umbral** (Z1 ≤0,81 · Z2 0,82-0,88 · Z3 0,89-0,94 · Z4 0,95-1,02 · Z5 ≥1,03). **Las resuelve el servidor en ppm absolutas y el iOS solo las pinta** — deja de tener su propia clasificación. El ancla se busca por orden de evidencia: **umbral medido → 0,88 × FC máxima medida → 0,88 × Tanaka**. Sin ninguna de las tres **no hay zonas**, y no se inventa un ancla: la pantalla lo dice y ofrece la salida.

**Por qué:** había **TRES** modelos, no dos. Fracción del umbral en el servidor, fracción de la FC máxima en el iOS, y fracción de un **200 clavado a pelo en el SQL** del panel del coach. Con el atleta 64 la Z2 salía **128-137** por un lado y **106-124** por el otro: bandas disjuntas. A 130 ppm el atleta estaba donde el coach quería y su móvil le decía Z3 y que apretaba de más. Y el servidor mandaba SUS zonas al reloj como alerta, así que la contradicción llegaba a la muñeca.

**Muere `PersonalHRMax`.** Su `resolve(nil,nil,nil)` **nunca devolvía nil**: siempre 184. Y era la única vía de construir una sesión, así que **todos** los `zone_seconds` que ha visto Pablo salían de una máxima que nadie midió — **0 de 8 atletas tienen máxima medida**. Lo estimado, cuando existe, viaja **marcado** hasta el coach.

**Cooper y Daniels no eran una fórmula de más.** Miden magnitudes distintas: Cooper estima VO₂máx directo, Daniels estima VDOT. Lo que sobraba eran **dos criterios distintos para elegir qué fila del mismo test coger** (uno el mejor, otro el menos extrapolado y luego el más fresco), y un filtro de `source` que faltaba en uno de los dos. Queda una sola regla de evidencia.

**En consecuencia, no hacer:** no volver a clasificar zonas en el cliente; no anclar zonas en la FC máxima cuando hay umbral; no fabricar un ancla cuando faltan las tres evidencias; y no promediar ni mezclar VO₂máx con VDOT en la misma cifra.

**PENDIENTE, y es una decisión de producto:** **ninguna pantalla escribe hoy un `lthr_bpm` medido.** La cadena lo prefiere y el servidor lo lee, pero no hay UI que lo registre, así que **todo umbral es estimado**. No hay que inventar nada: el test `lthr_30min` ya existe en el seed con ese `output_field` — es conectarlo. También queda abierta una asimetría en `assignment-detail.ts:961`: un objetivo `hr_zone` llega a iOS sin banda mientras al Garmin sí.

**Dónde vive:** `shared/domain/methodology/hr-zones.ts`, `web/lib/athlete/hr-zones.ts`, `ios/FAHYBRIK/Profile/MyZonesView.swift`. La sección 40 del manual vivo (`/guia`) queda reescrita con el modelo bueno.

---

## 2026-07-28 · La FC en reposo se modela una vez — es un agregado del día LOCAL, revisable y tardío

**Decidido:** existe **un solo resolutor** de FC en reposo, `shared/domain/biometrics/resting-hr.ts`, y ningún otro sitio consulta `hr_resting`. La pieza modela **qué ES** el dato, no cómo se consulta, y de ahí salen sus tres propiedades:

1. **Es un agregado del día LOCAL DEL ATLETA.** Se agrupa con `athletes.timezone` de cada uno, no con el huso del box ni con UTC. Verificado contra producción: con el bucket en UTC, **64 de 81 filas caían en el día equivocado**, y el atleta 64 tenía **40 días locales aplastados en 31** — dos jornadas promediadas en una.
2. **Se revisa en sitio.** Apple reescribe la FC del día (51 → 50 → 52 con el mismo `recorded_at`): **gana la última escrita**, no la media. En 5 días de producción la media mentía.
3. **Llega tarde y falta días.** `resolveRestingHrOn` devuelve siempre `age_days` / `is_for_day`, **nunca un número pelado**: se enseña la última con su edad, y **solo la del propio día puntúa**.

Se retira la cláusula heredada «+ la tarde anterior»: era del **sueño** (para que una siesta no cuente como la noche) y no tiene sentido en un agregado diario. Cero lecturas de producción se sellan entre las 18:00 y las 24:00, así que quitarla mueve 0 filas.

**Resultado:** siete lectores que daban **tres valores y dos fechas** distintos del mismo dato ahora dan uno (atleta 64, 28-jul: 52 ppm del 27-jul en los siete).

**Suelo del check-in subjetivo: 7 días** (un microciclo). Llevaba el peso más alto del readiness (0,35) y no caducaba nunca, así que un check-in de marzo seguía diciendo «Recuperado y listo» en julio. Al caducar, el peso se redistribuye por la renormalización que ya existía; si no queda ninguna señal, el compute devuelve `null` y sale el vacío honesto.

> **Corregido el 29-jul:** la calibración original de esta línea medía la magnitud equivocada. Decía «el hueco máximo entre dos check-ins consecutivos es de 2 días, así que a quien lo usa no le caduca nunca» — pero el estadístico que importa para un suelo de caducidad es **el tiempo desde el ÚLTIMO** check-in, no el hueco entre dos. Medido el 29-jul: los atletas 66 y 67 tienen su último check-in del 22-jul, o sea **exactamente 7 días**. Les caduca hoy. El suelo de 7 días se mantiene porque un microciclo sigue siendo el argumento correcto, pero **la frase que decía que no afectaba a nadie era falsa al escribirla**.
>
> **Segundo número de caducidad, que esta entrada no declaraba:** `RESTING_HR_SHOWABLE_DAYS = 14`. La FC en reposo se **enseña** hasta 14 días con su edad, pero **solo puntúa si es del propio día**. Son dos reglas distintas a propósito (mostrar ≠ puntuar), pero conviven con el check-in, que puntúa con **peso completo 0,35 hasta los 7 días sin descuento por edad**. Un check-in de hace 6 días entra con el peso más alto del modelo y una FC en reposo de ayer no entra en absoluto. **Esa asimetría no está justificada y queda abierta.**

**La procedencia (`recorded_via`) la escriben los cuatro escritores**, no uno: las ingestas de HealthKit, Garmin y Polar escriben `'imported'`. En el upsert **manda lo que ya hubiera** (`coalesce(workout_executions.recorded_via, excluded.recorded_via)`): una sesión `live` **no se degrada** porque el reloj la sincronice después. `reconcile.ts` no participa — mueve `source` entre garmin y healthkit, y eso cambia el QUÉ midió, no el CÓMO se registró. Las filas viejas se quedan en NULL a propósito (57 de seed): es la respuesta honesta, y por eso no hizo falta migración.

**En consecuencia, no hacer:** no volver a escribir una consulta de `hr_resting` fuera del resolutor; no agrupar biometría diaria por UTC ni por el huso del box; no promediar revisiones del mismo día; no devolver una FC en reposo sin su edad; y no dejar que una sincronización posterior degrade la procedencia de una sesión vivida.

**Dónde vive:** `shared/domain/biometrics/resting-hr.ts`, `shared/domain/db/athlete-timezone.ts` (que además mata dos copias de la búsqueda de huso), `web/lib/biometrics/resting-hr-series.ts`.

---

## 2026-07-28 · «No se sabe» es un valor de primera clase — tres conceptos dejan de tener defecto plausible

**Decidido:** tres magnitudes que el coach usa para decidir entrenamiento dejan de tener un valor por defecto y pasan a poder ser **nulas**, con el hueco declarado. El patrón que se retira es siempre el mismo: *un defecto plausible ocupa el sitio de «no se sabe», y como es plausible nadie lo detecta*.

**1 · La adherencia sobre cero sesiones programadas es NULA, no 1.** Devolvía adherencia perfecta, y eso subía por la cadena hasta «súbele la carga, confianza alta» en la cola de Pablo sobre alguien que no había entrenado. La verdad ya vivía en `shared/domain/adherence/completion.ts` (`adherencePct`, que ya devolvía null); `progress-readiness.ts` pasa a usarla en vez de tener su propia fórmula. Nulo emite la bandera `compliance_unknown` y el veredicto cae a `hold`/`low` con la razón escrita. Efecto lateral bueno: el redondeo pasa a ser el mismo que el del roster y el de `/hoy`, así que ya no pueden discrepar.

**2 · Una sesión sin intensidad conocida no emite TSS.** El defecto de 0,65 daba ~42 TSS/hora falsos a TODA sesión sin valorar. Y no había nada que enchufar en su lugar: verificado contra el esquema, **`workout_executions` no tiene columna de FC ni de potencia, y no existe LTHR ni FTP en ningún sitio** (`athletes.max_hr_bpm` está a null en los 8). `computeTss` devuelve null y el agregador lleva `unknown_seconds` / `unknown_seconds_28d` y expone `loadIntensityCoverage()`. **El hueco no se interpola.** Segundo defecto encontrado en el mismo sitio: la serie se valoraba con el `avg(RPE)` **del día**, así que una sesión sin valorar heredaba el esfuerzo de la de al lado; ahora se valora por sesión. Sobre el atleta 64: 79,2 → 60,0 TSS en 28 días, un 24 % era fabricado y solo un tercio de eso venía del 0,65.

**3 · Sin rango no hay barra ni veredicto.** La comparación por estación fabricaba un `0.5` con severidad cuando faltaba el rango o el tamaño del campo. Como **`field_size` es NULL en las 33 carreras de producción**, el 100 % de esas barras eran inventadas. `stationFieldReading()` entrega barra **y** veredicto juntos o ninguno. El tiempo y el delta personal se quedan: esos sí son reales.

**Por qué las tres juntas:** son la misma ley (§7 del `docs/CONTRATO-UI.md`) aplicada a los tres sitios donde el dato fabricado llegaba hasta una decisión de entrenamiento.

**En consecuencia, no hacer:** no volver a poner un defecto «razonable» donde falta el dato — ni 1, ni 0,65, ni 0,5; no tapar con interpolación los huecos que ahora aparecen en las curvas de carga; y no calcular adherencia, TSS ni comparación de estación fuera de sus módulos dueños (fue tener dos fórmulas lo que creó las tres divergencias).

**Consecuencia conocida y ACEPTADA:** la tarjeta «Listo para progresar» de `/hoy` enseña a menos gente, y las curvas de carga del coach tienen huecos donde antes había línea continua. Es correcto: esa tarjeta dice literalmente «súbele la carga».

**Pendiente derivado — actualizado el 29-jul:** `athlete-deep-dive.ts` y `cohort.ts` **ya computan la cobertura y ya bloquean las etiquetas**. Pero el pendiente real sigue abierto un piso más arriba: **ningún componente `.tsx` pinta `load_coverage`, `badge_es`, `note_es`, `action_es`, `tsb_label` ni `acr_label`** (verificado por grep sobre todo `web/**/*.tsx`: cero renders). La decisión vive entera en el DTO y no llega a un solo píxel de Pablo. **La lección: «lo computa el módulo» no es «lo ve el coach», y esta entrada daba lo primero por lo segundo.**

**Dónde vive:** `progress-readiness.ts`, `shared/domain/training-load/{tss,banister,index}.ts`, `web/lib/athlete/race-context.ts`.

---

## 2026-07-28 · El TRAMO es la unidad del entreno en vivo — y la salida sigue la MEDIDA, no el movimiento

**Decidido:** la unidad de la sesión en vivo no es el bloque, es el **tramo**: la ventana activa, con su modalidad, su medida y su objetivo tipados (`ios/FAHYBRIK/Workout/LiveTramo.swift`). El tramo decide tres cosas a la vez — qué superficie de dispositivo se pone delante, qué reloj corre y qué se pinta —, y por eso deja de hacer falta una regla por caso.

**Cuándo una lista de movimientos ES una ruta de tramos:** cuando la biblioteca manda N segmentos hermanos sin `rounds` escritas y con más de un movimiento (`fixedStation`), como en la simulación de HYROX (plantillas 446 y 489). Entonces **la estación es el tramo**. Un EMOM, un AMRAP, un For Time con rondas, «100 burpees for time» y un 5×500 **no** son rutas y no auto-avanzan: verificado con banco standalone de 52 asserts sobre prescripciones de producción.

**La regla de salida — es una regla, no una lista de casos:**

- **Metros o calorías** → lo sabe la máquina. Sale al **cruzar** el objetivo (el cruce, no «la lectura está por encima»: así una reconexión a mitad de pieza no da la estación por hecha).
- **Segundos** → lo sabe el reloj de la app, sin emparejar nada.
- **Repeticiones** → **no lo sabe nadie**. Ahí se toca, y no se simula un contador.

**Un monitor parado NUNCA saca del tramo**: es alguien recuperando el aliento.

**Por qué:** la app ya sabía por dónde ibas — el cursor de tachado por estación existía y nunca estuvo enchufado al tramo. No había que inventar detección, había que conectar lo que ya estaba. Y `involvesErg` (¿hay que conectar el aparato?) se separa de `tramoIsErg` (¿se enseña ahora?) porque son preguntas distintas: se conecta al empezar la sesión, se enseña solo mientras se rema.

**En consecuencia, no hacer:** no añadir reglas de salida por movimiento («el ski sale cuando…»), que es justo lo que esta regla sustituye; no inventar contadores de repeticiones ni de rondas que la app no puede medir (ley 7 del `docs/CONTRATO-UI.md`); no redondear el parcial de una estación al objetivo — 1.014 m se guardan 1.014; y no leer el título del bloque plegado donde va el tramo (el espejo del reloj lo hacía y enseñaba todos los movimientos unidos por puntos, congelados veinte minutos).

**Dónde vive:** `LiveTramo.swift`, `WorkoutSession+Tramo.swift`, `RestSurface.swift`. Commits `a6d81fd` y `ce96bd4`.

---

## 2026-07-27 (noche) · En dobles, correr y roxzone son suyos; las estaciones NO. Y el correr es un SUELO, no una medida

**Decidido:** una carrera de equipo (`doubles` / `relay`) aporta como evidencia del atleta individual **solo** su tiempo de carrera a pie (`races.run_total_seconds`, `run_splits_json`) y su roxzone (`races.roxzone_seconds`). Los splits de estación (`station_splits_json`) **no se le atribuyen jamás**. El tiempo final (`result_time_seconds`) es suyo, pero solo se enseña con el formato nombrado al lado. Todo número de correr que salga de una carrera de equipo viaja marcado `partner_bounded` y se presenta como un **suelo** («más lento no vas»), nunca como una medición. Consecuencia directa: **no se emite tendencia de correr sobre carreras de equipo**, ni con veinte carreras.

**Por qué:** en dobles los dos atletas corren los ocho kilómetros y hacen juntos todas las transiciones, pero las estaciones se las reparten — así que un split de estación es de uno de los dos y no sabemos de cuál. Y como corren juntos, el ritmo lo marca el más lento de la pareja. Esto no es teoría: el atleta 72 corrió **dos dobles el mismo día** (14-may-2026), 8 km en **2137 s** con un compañero y en **3162 s** con otro. Diecisiete minutos de diferencia en la misma distancia y el mismo día. Atribuirle cualquiera de los dos como «su ritmo» habría sido mentir; quedarse con el mejor y llamarlo suelo es lo único cierto. Por lo mismo, una «evolución» a través de carreras de equipo mide con quién se apuntó, no cómo está.

**No hacer:** rellenar las estaciones de un free con los splits de su carrera de dobles; usar `result_time_seconds` de dobles sin decir que es de la pareja; calcular tendencias, medias o percentiles de correr mezclando carreras individuales y de equipo.

**Dónde vive:** `shared/domain/free-plan/race-evidence.ts` (puro, con las 6 carreras reales del 72 como fixture en `web/tests/free-plan/race-evidence.test.ts`).

---

## 2026-07-27 (noche) · La semana bloqueada del free: estructura NUESTRA, números SUYOS, y si no hay número no hay fila

**Decidido:** el bloque «Cómo se arregla» de la pestaña Plan del free se construye con una estructura semanal **genérica y propia**, definida en `shared/domain/free-plan/week.ts`: cinco arquetipos (correr con calidad, fuerza, ergo, híbrido/comprometido, tirada larga) que son la anatomía de la prueba —8 km de correr, dos ergos, cinco estaciones de fuerza, todo en fatiga—. **Nunca** se leen `blocks`, `templates`, `microcycles` ni ninguna tabla de contenido del coach. Cada sesión solo aparece si se puede personalizar con datos del atleta: ritmos por Daniels (`shared/domain/running/vdot.ts`) desde su mejor marca, o desde los 8 km de su mejor HYROX, o desde el VO₂ máx del reloj; ergos por Riegel desde su marca de ski/remo; fuerza como porcentaje de su 1RM guardado. **Si un tipo de sesión no se puede personalizar, esa fila no existe** — no se rellena con un valor plausible. Con menos de **2** sesiones personalizables no se manda semana y el cliente no pinta nada.

**Por qué:** la biblioteca de bloques es contenido de Pablo y es justo lo que se está vendiendo; regalarla mataría el tier de pago. Pero el esqueleto de una semana de HYROX no lo posee nadie: es la lista de cosas que la prueba te obliga a entrenar. El valor no está en el esqueleto, está en que los números sean del atleta. Y el relleno es lo único que puede hundir el bloque entero: el día que dos cuentas comparen su «semana» y vean lo mismo, se acabó la credibilidad de la pantalla que sostiene el embudo. Por eso lo difuminado son sesiones REALES desenfocadas, no texto de ejemplo.

**Coeficientes declarados** (ninguno anónimo, ley 4 de `docs/race-projection-spec.html`): 5×1 km a ritmo umbral con 2:00; el híbrido lleva el volumen exacto de la prueba (4 rondas × 25 wall balls + 20 burpees = los 100 y los 80 reales) a ritmo maratón de Daniels; tirada de 60 min a ritmo fácil; ergo 6×500 al split que su marca proyecta para los 1000 de carrera; fuerza 4×6 al 75 % del 1RM (≈ RIR 2 en las tablas de repeticiones máximas), redondeado a 2,5 kg.

**No hacer:** subir el suelo de 2 sesiones sin decidir qué se enseña en su lugar; añadir una sesión «de relleno» para que la semana parezca más llena; mover el castellano de la prescripción al dominio (vive en `FreePlanWeekCopy`, en el cliente, en un solo sitio).

---

## 2026-07-27 · Un EMOM es un ciclo de TRABAJO + CAMBIO. Y un formato sin movimientos es un cronómetro válido

**Decidido, dos cosas que se sostienen la una a la otra.**

### 1. EMOM e INTERVAL son la misma forma, no dos tipos

Un ciclo es **trabajo + transición**, repetido N veces. Lo único que cambia es si la transición es explícita:

- **EMOM llano («al minuto»)** → `work_s` 60, sin `rest_s`. El ciclo es 60 y el descanso es lo que te sobre dentro del minuto. Nada avisa de cuándo parar, porque no hay un "parar" definido.
- **Interval de box (Rogue)** → `work_s` 45, `rest_s` 15. El ciclo sigue siendo 60, pero ahora hay un final del trabajo, y el reloj **tiene que avisarlo**.
- **Tabata** → `work_s` 20, `rest_s` 10, `rounds` 8. La misma estructura con otros números: es un **preajuste**, no un formato aparte.

Esto no se inventó aquí: es la forma que el servidor ya tenía en `shared/domain/prescription/types.ts` (`work_s` = "emom/interval/tabata work window", `rest_s` = "round/interval/tabata rest"), la que usa `block-helpers.ts` para estimar duración (`(work_s + rest_s) * rounds`, para todos los esquemas incluido emom), y la que el editor legacy ya rotulaba «Trabajo (s)» / «Descanso (s)». **iOS era el que iba por libre**, leyendo `work_s` como "la cadencia" y descartando `rest_s`.

`EmomPlan` adopta la forma del servidor: `workSeconds` + `restSeconds`, y `intervalSeconds` pasa a ser el ciclo (su suma).

**Por qué era seguro cambiarlo:** verificado contra producción — CERO filas `emom` con `rest_s` en `template_segments`, `block_exercises` o `segment_executions`. Las únicas dos que existen son `work_s: 60, rounds: 10` sin `rest_s`, así que `60 + 0 = 60` y el ciclo no se mueve ni un segundo. Tampoco existe ninguna fila `tabata`, así que el preajuste no tiene legado que respetar. Donde SÍ vive dato real de trabajo+descanso es en el esquema legacy `interval` (41 filas, 22 con ambos), y ahí ya significaba trabajo+descanso.

**Tabata se guarda como `emom`**, no como `tabata`, y tiene que ser así: `FUNCTIONAL_SCHEMES` del contrato de entreno libre acepta `for_time`, `amrap`, `emom` y `rounds` — no `tabata`. Como la estructura es idéntica, no se pierde nada: 20/10 × 8 en `work_s`/`rest_s`/`rounds` ES un Tabata.

**En consecuencia, no hacer:** no crear un tipo paralelo para los intervalos, ni un esquema `interval` nuevo en iOS. Y no volver a leer `work_s` como "cada cuánto": es la ventana de trabajo, y el "cada cuánto" se deriva sumándole la transición.

### 2. Los movimientos son opcionales para arrancar. Un formato ya es un reloj

Un EMOM de 10 minutos, un AMRAP de 10:00, un For Time y unas Rondas son estructuras **completas y sin ambigüedad por sí solas**. Exigir el contenido antes de dejarte empezar era lo único que nos hacía más lentos que una app de cronómetro, y no compraba nada: el contenido se sabe igual de bien al terminar, y entonces el atleta no tiene prisa.

Los cuatro formatos funcionales admiten arranque vacío. Lo que se declara después se mapea con la MISMA estructura que la sesión corrió, así que un WOD nombrado a posteriori es idéntico en el cable a uno nombrado antes.

**Consecuencia en el HUD:** un segmento sin contenido declarado no es lo mismo que uno descrito con params escalares. `WorkoutSegment.components` no podía distinguirlos (su fallback siempre devuelve una fila), así que se añade `hasDeclaredWork` / `declaredComponents`: un cronómetro pelado no pinta una ronda fantasma de guiones.

### PENDIENTE Y BLOQUEADO: el servidor NO acepta un funcional sin ítems

`web/lib/athlete/free-workout-validate.ts` exige `MIN_ITEMS = 1` y responde `items_required` (422) antes de tocar la base de datos. Un 422 no es reintentable (`RequestQueue.isRetriable` solo reintenta ≥500), así que el cliente lo descarta en silencio: **mandarlo igual le enseñaría al atleta una sesión guardada que nunca existió.** Por eso, de momento, si no declara nada NO se envía nada y el copy lo dice en claro.

Auditado qué haría falta para admitirlo, porque la decisión es de Alex, no mía:

- **Nada se rompe técnicamente.** `record-workout-execution.ts` no cuenta segmentos para nada (el estado sale de `completeness`, que lo declara el cliente), `segments` ya es opcional sin mínimo, y no hay CHECK ni trigger que exija segmentos. Las plantillas de 0 segmentos ya existen y están contempladas: `assignment-detail.ts` las colapsa a `workout: null` a propósito, con test.
- **Sería la primera asignación con plantilla sin segmentos.** Todos los caminos del coach evitan crearla (`instantiate-program.ts` devuelve null sin ejercicios).
- **Tres sitios informarían mal, y habría que tocarlos en el mismo movimiento:** (a) `week-plan.ts` mandaría el *formato* en el campo `modality`, dejando el punto del día sin color y la duración a null; (b) el cajón del coach diría «Este entreno no tiene plantilla asociada», que es falso — sí la tiene; (c) los INNER JOIN de `deep-dive-performance.ts` y `athlete-deep-dive.ts` excluirían la sesión de las analíticas por ejercicio (defendible: no hay ejercicio).
- **Cambio mínimo:** `MIN_ITEMS` y su rama en `free-workout-validate.ts`, más los dos tests que hoy afirman lo contrario (`free-workout-validate.test.ts:95`, `free-workout-route.test.ts:126`). Nada de base de datos, nada de migración.

**En consecuencia, no hacer:** no colar un movimiento fantasma para que pase la validación, y no mandar un payload que sabemos que el servidor rechaza.

---

## 2026-07-27 · Un benchmark solo tiene un objetivo: tu propio récord. Sin récord, NINGUNO

**Decidido:** un benchmark («Probarme») es un esfuerzo a tope, no una prescripción de intensidad. Nadie le dice al atleta a qué ritmo ir: va a lo que pueda y manda el cronómetro. Por tanto:

1. **Con récord** → el objetivo es su propia marca, dicha como tal: el bloque se titula «Benchmark · a batir 3:52» (en la unidad de la marca — tiempo para los contrarrelojes, metros para el Cooper). Los contrarrelojes llevan además el ritmo derivado de ese récord para que el HUD pueda decir en vivo si va por encima o por debajo (correr s/km, ergo s/500 m).
2. **Sin récord comparable** → **no hay objetivo**. Ni por defecto, ni estimado, ni «a modo orientativo». La prescripción viaja con `target` nulo y ninguna pantalla pinta ritmo.
3. **El Cooper nunca lleva ritmo**, tenga récord o no: son 12 minutos fijos y la puntuación es la distancia. Su récord sí se enseña («a batir 2800 m»).

**Por qué:** el borrador libre nacía con `paceSeconds = 112` (el ritmo por defecto del REMO, 1:52/500 m) y `BenchmarkLaunch` asignaba `draft.modality` a pelo, saltándose `selectModality()`, que es quien siembra los valores de cada disciplina. Resultado: **todos** los benchmarks sin récord comparable arrancaban con ese 112, y el Cooper lo hacía SIEMPRE (su unidad es metros, así que nunca se calculaba objetivo). En correr se pintaba como **«@ 1:52 /km»** — más rápido que el récord del mundo de 1 km. Además ese ritmo falso se guardaba en la prescripción que ve el coach.

**Cómo queda blindado:** `FreeWorkoutDraft.modality` pasa a `private(set)`. `selectModality()` es la única entrada y siembra el ritmo de la disciplina, así que el arrastre deja de ser posible en cualquier lanzador presente o futuro — lo caza el compilador, no una revisión. Y `FreeWorkoutDraft.targetKind` pasa a opcional: nil = sin objetivo. No hizo falta tocar el contrato con el servidor, `target` ya era opcional en los dos niveles (`shared/domain/prescription/types.ts`) y `validateFreeWorkout` nunca lo exigió.

**En consecuencia, no hacer:** no volver a poner un ritmo «por defecto» en un lanzamiento. Si el dato no existe, la pantalla se calla. Y no asignar `.modality` sobre un borrador: se selecciona, no se asigna.

---

## 2026-07-27 · El Plan del free enseña EVIDENCIA, no una proyección — y lo que falta se dice

**Decidido:** la pestaña Plan de un atleta sin coach (`ios/FAHYBRIK/Plan/FreePlanView.swift`) se construye con lo que HOY es real y nada más: su carrera objetivo con cuenta atrás (`target_race` de `/api/athlete/plan/week`), lo que tiene medido y lo que le falta del catálogo (`/api/athlete/marks`), su historial de HYROX importado (`/api/athlete/races`) y su VO₂ máx del reloj (`/api/athlete/biometrics/trend`, clave `vo2max`). El orden es: primero lo que le damos, después lo que le pedimos. Con CERO evidencia no se ofrece nada de pago.

**Por qué:** el mockup aprobado (`docs/design/free-plan-conversion-mockup.html`) lleva tres bloques que dependen de un modelo que aún no existe — tiempo proyectado, diagnóstico por estación contra su división, y la semana propuesta bloqueada. El predictor actual **no lee `athlete_benchmarks`** (`docs/race-projection-spec.html`, §01 fallo 1) y no hay dataset de referencia por división (§01 fallo 5), así que cualquiera de los tres habría sido un número inventado en la pantalla que sostiene el embudo. Un atleta lo nota a la primera y pierde la confianza en todo lo demás.

**En su sitio:** la tarjeta de carrera dice qué falta para poder proyectar («aún nos faltan tus marcas: …»), nombrando las marcas que él no tiene, con las tres de arranque delante. Y lleva marcado el **punto de extensión** donde entra la proyección cuando el modelo la sirva.

**Se descarta:** pintar el tiempo proyectado con el motor de `goal-gap` actual. Con una carrera reciente devuelve exactamente el tiempo de esa carrera y con huecos los rellena a valor del objetivo — es decir, le diría a un principiante que va justo a su meta.

**En consecuencia, no hacer:** no hardcodear el nombre del coach en el cierre (viene de `coach_name` del payload; para un atleta free es null y la tarjeta queda genérica), y no meter en esta pantalla ningún número que no venga de un endpoint de atleta ya existente — si el dato no está expuesto, se reporta, no se inventa el endpoint.

> **SUPERADO EN PARTE el 27-jul por la noche** (ver las dos entradas de arriba). La **semana bloqueada YA está construida**, pero no como la describía el mockup: no sale de una proyección ni de un cohorte por división, sino de los ritmos que da el VDOT sobre la evidencia real del atleta, y solo pinta las filas que puede personalizar. Siguen fuera, y por las razones originales, **el tiempo proyectado** y **el diagnóstico por estación contra su división**. El «punto de extensión» de la tarjeta de carrera lo ocupa ahora la comparación objetivo-vs-realidad; la proyección, cuando llegue, entra ahí al lado.
## 2026-07-27 · Las marcas alimentan la predicción, y ningún hueco se rellena con el objetivo

**Decidido:** cuatro cambios en el motor de proyección, todos en `shared/domain` (puro, sin I/O), más el cable que faltaba en el cargador.

1. **`athlete_benchmarks` entra en la predicción.** «Probarme» llevaba escribiéndose desde que salió #Marcas y **ninguna ruta de predicción leía una fila**: un atleta podía cronometrarse un SkiErg 1000 y ver su proyección sin moverse. La jerarquía del lado entrenado queda declarada en un solo sitio (`shared/domain/race-transfer/compute.ts` → `trainedEvidence`): **marca medida > VO₂max del reloj > umbral de zona > ejecuciones**. Se respetan `run_context` (una marca de cinta se usa, pero ensancha la banda) y `source` (`onboarding` y `unknown` se rechazan — la 0139 ya dice que la autodeclarada «nunca cuenta como test real»).

2. **La evidencia envejece de forma continua.** `RECENT_RACE_DAYS` deja de ser un escalón y pasa a ser la **vida media** de una decaída suave (`shared/domain/evidence.ts`). Antes, con una carrera de menos de 180 días los diez tramos salían crudos y el predicho era, al segundo, esa carrera: cinco meses de entreno no lo movían, y luego se movía de golpe. El número que se conserva es el mismo (180) y significa lo mismo (ahí la carrera deja de mandar), así que el chip `observado` de la app instalada no cambia de sentido.

3. **Ningún hueco se cobra al objetivo.** El total era `Σ (predicho ?? PRESUPUESTO)`, y el presupuesto es la meta del atleta repartida en diez. Cuanto menos veíamos, más se acercaba la «predicción» a la meta: a un principiante sin datos de estaciones se le decía que iba bien. Ahora un tramo sin evidencia **no aporta nada y se nombra**; `predicted_total_s` y `gap_s` son **nulos** mientras falte cualquier tramo. Lo mismo en dobles: la fila sigue enseñando el presupuesto (la app la etiqueta «sin datos suficientes» y una barra necesita largo), pero queda fuera del total. Se retira también el respaldo de roxzone al presupuesto, que era la misma trampa con otro nombre.

4. **El factor de competición se pondera por tiempo.** Era una media aritmética de cocientes, así que ocho kilómetros de carrera pesaban lo mismo que una estación de tres minutos y una sola estación rara arrastraba toda la predicción. Ahora cada cociente pesa los segundos que ese tramo cuesta en carrera.

Y, transversal a todo, **cada tramo emite banda y el total un rango** (ley 1 de la spec), más `coverage` (qué parte se desconoce) y `next_inputs` (qué medir para estrecharlo, orden por retorno).

**Constantes nuevas, todas con origen:** el exponente de resistencia de Riegel `k = 1.06` (Riegel, *American Scientist*, 1981) para pasar 500 → 1000 m en ergo, en vez del ×2 que prometía sostener el ritmo de sprint al doble de distancia — se comprueba en test contra la regla publicada de Concept2 (+~5 s/500 m por cada duplicación). Para correr **no hace falta constante nueva**: se reutiliza el Daniels-Gilbert que ya vivía en `shared/domain/running/vdot.ts`, que además hace que el 5K y el Cooper manden sobre el 1 km **sin ninguna tabla de prioridades escrita a mano** — gana la marca menos extrapolada. Las tres anchuras de banda (±3 / ±7 / ±15 %) **no son nuevas**: son la escala de error que el producto ya publicaba en `accuracyLabel` (clavado / muy afinado / afinando), ahora leída desde un único sitio.

**Se descarta / no se hace:** no se inventa una penalización de «carrera comprometida» para quien no tiene carrera previa — no hay dato con el que calibrarla, así que se declara desconocida y **la banda paga por ello**. La composición del rango asume **independencia entre tramos** (suma en cuadratura); es un supuesto declarado, y la métrica de cobertura del bucle predicho-vs-real es justo lo que lo mide (ley 5).

**En consecuencia, no hacer:** no volver a sumar un presupuesto dentro de una predicción — presupuesto significa «lo que pide la meta» y meterlo en el total es dejar que el deseo del atleta prediga su tiempo. No añadir una segunda escala de error ni una segunda curva de envejecimiento: viven en `shared/domain/evidence.ts` y las demás las importan. Y no congelar un snapshot parcial en `race_predictions`: el bucle de calibración lo compararía contra una carrera entera y se mentiría a sí mismo.

**Pendiente de decisión de Alex (bloqueado por datos, no por código):** las cinco estaciones de fuerza y el perfil siguen sin fuente. Comprobado contra producción el 27-jul: **hay 0 carreras `singles` reales con splits** (las 2 que existen son sintéticas); las 8 reales con splits son todas de **dobles**, donde las estaciones se reparten entre dos atletas y por tanto no describen una forma de singles. Además `athletes.weight_kg`, `height_cm` y `body_fat_pct` están **vacías en los 8 atletas**. Con eso no se puede derivar ni un prior por estación ni el signo del peso por estación que pide la spec §05, así que **no se ha fabricado ninguno**. Es la decisión abierta de §10: datos de población, o esperar a las primeras importaciones reales de singles.

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

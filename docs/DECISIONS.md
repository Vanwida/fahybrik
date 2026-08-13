# DECISIONES — FAHYBRID

Registro de decisiones estructurales del dominio y de la arquitectura.

**Para qué existe:** en julio de 2026 tuvimos que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y un par de migraciones que habían creado y luego eliminado una entidad, sin que en ningún sitio constara el porqué. Este fichero evita que vuelva a pasar.

**Cuándo se escribe aquí:** siempre que se tome una decisión que condicione el dominio o el modelo de datos, y muy especialmente cuando se **elimina o se descarta** algo. Lo que se borra sin dejar rastro es lo que alguien reconstruye seis meses después.

**Formato:** una entrada por decisión. Qué se decidió, por qué, y qué NO hacer en consecuencia.

---

## 2026-08-13 · Un entreno de Apple Salud es una sesión aunque nadie lo prescribiera

**El hueco:** conectar Apple Salud subía el pasado a `biometric_streams` (1.996 entrenos de Alex desde 2019, 94k pulsos desde 2022) y las comparativas no lo veían. `workout_executions.assignment_id` era NOT NULL + UNIQUE: el ingest solo rellenaba actuals si había un hueco del plan ese día. Sin plan, el histórico era un marcador muerto. La carga, las zonas y el antes/después leen ejecuciones.

**Decidido:** una sesión importada no necesita assignment. `assignment_id` pasa a nullable (migración **0191**); el 1:1 del plan se conserva con un índice parcial. El ingest de HealthKit, si no hay assignment del día ni solape con una sesión ya registrada, nace la ejecución (`recorded_via='imported'`) y un tramo resumen. El plan no se toca. El histórico que ya estaba en `training_load` se materializa con la misma función. No hay unique en `source_workout_ref`: en producción ya hay UUIDs de Salud repetidos en varias ejecuciones live (el mismo HKWorkout aterrizó en dos assignments).

**Qué se elimina:** cualquier segundo control de Apple Salud en Perfil. El toggle es el único. Ni «Abrir Salud», ni «Importar histórico», ni «Continuar importación», ni «Detener». El barrido del pasado corre en silencio al conectar. El techo es 10 años; un import ya cerrado con el techo viejo se reabre solo, sin pintar un CTA.

**NO hacer en consecuencia:** no inventar assignments para el pasado. No volver a poner un segundo botón de Salud. No tratar `biometric_streams.training_load` como si las comparativas lo leyeran.

---

## 2026-08-13 · Cuatro tarjetas de analíticas que no podían enseñar dato nunca: tres se conectan, una se retira

**El hueco:** en `web/lib/athlete/analytics/` había cuatro tarjetas con `availability` fija y sin ninguna consulta detrás — placeholders que el atleta leía como «esto no lo tenéis» aunque el dato ya existiera. Dos comentarios eran directamente falsos: `sleep` decía que iOS no observaba `sleepAnalysis` (sí lo hace desde `HealthKitSyncService.swift`, y ese dato ya alimentaba la disposición diaria y `biometric-trend.ts`) y `hr_zones` decía que hacía falta una API de socio (el reparto ya se computa en `segment_zone_seconds`, el mismo motor que pinta la ficha del coach).

**Decidido — se conectan tres:**
- `sleep` (recovery.ts): entra en el mismo motor de tendencia que HRV/FC reposo/VO₂máx (`buildMetricTrendCard`), leyendo `metric_type='sleep_duration'` de `biometric_streams` (segundos → horas). Verificado: 202 muestras / 3 atletas en producción; 2 atletas superan el mínimo de 4 días.
- `hr_zones` (recovery.ts): reutiliza `loadZoneWindow` (`lib/zones/weekly.ts`) sin filtro de modalidad, sumando z1..z5 (nunca `no_hr_s`, que no es una zona). Un ancla ESTIMADA (FCmáx/edad) se muestra igualmente, etiquetada con su `source_label` — a diferencia de `running-progress.ts`, que exige ancla medida/declarada porque cruza FC con ritmo (un umbral adivinado desalinearía el ritmo-al-mismo-pulso). Aquí solo se describe el reparto, no se compara contra nada, así que la misma honestidad de "Mis zonas" en iOS (`HRZoneProfile.sourceLabel`) es suficiente.
- `finish_projection` (hyrox.ts): reutiliza `buildGoalGap` (`web/lib/athlete/goal-gap.ts`), el motor que ya sirve `/api/athlete/goal-gap` («Camino al objetivo») y que `running-progress.ts` ya reutilizaba (`loadPredictedSeconds`). El comentario anterior («el modelo no existe aún») era falso.

**Qué se elimina:** `weak_link` («Tu eslabón débil», hyrox.ts). Su modelo documentado —percentil por estación + decay de fatiga + fuerza— necesita el dataset HYROX licenciado (mikatiming) que no tenemos, igual que `field_percentile`; no existe ningún motor de "decay" de percentil en el repo (grep en `shared/domain` y `web/lib` solo encuentra el decay de evidencia por antigüedad de `shared/domain/evidence.ts`, un concepto distinto). Su titular real — la estación donde el atleta pierde más tiempo vs lo entrenado — ya lo enseña la tarjeta `race_transfer` («Entreno → carrera») como `primary`: mantener las dos habría sido un duplicado sin dato nuevo.

**NO hacer en consecuencia:** no reintroducir «Tu eslabón débil» hasta tener el dataset del campo licenciado. No copiar el filtro estricto de ancla medida/declarada de `running-progress.ts` a `hr_zones` sin la misma razón — esa tarjeta cruza FC con ritmo, esta solo reparte tiempo entrenado.

---

## 2026-08-12 · El esqueleto del plan nace al planificar, no se inventa en el alta

**El hueco:** el paso «Estructura del bloque» del alta pedía marcar microciclos en los
dos modos. En periodización los tramos no mandaban nada (el alta materializa el primer
microciclo de la biblioteca) y ajustar semanas era mentir. En personalizado se exigía
un esqueleto —«Microciclo 1 / 2 / 3» con semanas inventadas— aunque el coach aún no
hubiera planificado.

**Decidido:** el alta solo pregunta de qué nace el plan (`shared` | `personal`). El
esqueleto es consecuencia de planificar, no un input del alta.
- `shared`: igual que siempre — primer microciclo de la biblioteca, en borrador.
- `personal`: no se crea ningún contenedor. El atleta queda marcado y el coach
  escribe los microciclos desde su ficha. Si el cliente manda tramos de verdad
  (los escribió él), se materializan; vacío no se rellena con placeholders.
- `athletes.plan_mode` es columna viva (migración **0188**), no solo snapshot JSON:
  existe ANTES de que haya microciclos. Hoy no le propone asignar secuencia a
  quien eligió personal. Personalizar / volver a la periodización / asignar
  secuencia actualizan la columna.

**Qué se elimina:** la lista de microciclos del alta y la obligación de `block_specs`.
Eso no era un esqueleto: era una mentira previa a planificar.

**NO hacer en consecuencia:** no volver a proponer «Microciclo N» en el alta. No
tratar el JSON del intake como bandera viva del modo.

---

## 2026-08-12 · El nombre que teclea el coach vive en `name_es`, y `name_en` se queda vacío

**El hecho que lo forzó.** La migración 0172 puso `check (name_es is not null or name_en is not null)` en `exercises`, y `createExercise` (`web/lib/dashboard/exercises/create-exercise.ts`) no escribía ninguna de las dos: **crear un ejercicio desde el panel del coach llevaba roto en producción desde entonces**, con un 500 contra la constraint. Salió al descubierto de rebote, porque tres tests de `web/tests/exercises/ownership.db.test.ts` fallaban contra una rama recién migrada — nadie lo había reportado, y el camino no tenía cobertura contra el esquema real.

**Decidido:** lo que el coach teclea va a `name_es` (su panel es español) y `name_en` se queda **NULL**. Es la verdad —«no hay nombre inglés curado todavía»— en vez de escribir el mismo texto en las dos columnas y afirmar una traducción que nadie ha hecho. `name` sigue siendo el nombre base, el que resuelve cualquier lectura que aún no distingue idioma, que hoy son todas (`name_es` de `exercises` no lo lee nadie en `web/lib`).

**Qué NO hacer en consecuencia:** no rellenar `name_en` copiando `name_es` para «tener las dos». No dar por hecho que un `name_es` no nulo significa que alguien escribió español a conciencia: hoy significa «lo que el coach escribió, en el idioma en que lo escribiera». Cuando el panel deje de ser solo español —FLEXR, otros entrenadores— la lengua del texto pasa a ser DATO del coach (una preferencia suya), no una suposición del insert; ese es el momento de tocar esto, y no antes.

**Sigue pendiente y es lo que hace que esto importe:** iOS todavía no resuelve nombres por `athletes.preferred_language`, así que el atleta ve `name` pase lo que pase.

---

## 2026-08-12 · El chat aprende SOBRE QUÉ va el mensaje — y no gasta un icono en cada cosa

**El encargo, con su restricción dentro.** Que el atleta pueda escribir sobre algo (el entreno de hoy, tal ejercicio) con un clic. Y textual de Alex: *«la parte difícil que te pongo no es el código en sí, sino que no haya un iconito extra que moleste en cada cosa que se pueda contextualizar. Si es así, prefiero no ensuciar la UI y no hacerlo.»* Eso convierte el coste en pantalla en el criterio de aceptación, no en un detalle de acabado.

**El estado de partida (leído, no supuesto).** El chat es UN hilo por atleta, con adjunto tipado de pleno derecho (`attachment_url`/`kind`/`meta`) y CERO noción de sujeto: ni `about`, ni `reply_to`, ni `subject` en `ChatMessageDTO` (`ios/FAHYBRIK/Chat/ChatService.swift:33`) ni en `sendMessageSchema` (`web/lib/chat/schema.ts`). Y no hay ninguna puerta al chat desde dentro del detalle de un entreno, de un ejercicio, de un test ni de una carrera: el chat vive en cuatro cromos de raíz y en dos estados vacíos. El coste real de eso es un turno entero de conversación gastado en «¿de qué bloque me hablas?».

**Decidido — el contexto es un ADJUNTO, no un control nuevo.** Alex eligió (selector) la variante de **cero pixeles nuevos**, así que:
- **Puerta descubrible: el «+» del compositor**, que ya era la única entrada a «qué le añado a este mensaje» (voz, foto, vídeo, archivo). Gana una fila, **al final** para no mover la memoria muscular, y el título del diálogo pasa de «Adjuntar» a «Añadir al mensaje», que es lo que ahora cubre.
- **Atajo: los menús de pulsación larga que YA existen** — la sesión del día (`PlanView.swift:315`), el carril de días (`PlanHoyAtoms.swift:98`) y la tarjeta de carrera (`CarrerasView.swift:475`). Una fila más, «Preguntar al coach», cero alto.
- **Las filas de ejercicio de la ficha previa** estrenan `contextMenu` (hoy no tienen ninguno): un menú de pulsación larga no ocupa pantalla. Es ATAJO, nunca la vía principal, porque una pulsación larga a secas no se descubre — el propio código de carreras ya documenta por qué hace falta doble discoverability.
- **La única superficie nueva** es la hoja «¿sobre qué entreno?», y solo se ve si el atleta la pide.

**Decidido — la referencia es TIPADA y la etiqueta la escribe el servidor.** En `chat_messages`, columnas planas y nullables (migración **0186**): `context_kind` ∈ ('session','exercise','race') + `context_ref` (el ancla navegable) + `context_sub` (solo con kind='session': el ejercicio DENTRO de ese entreno) + `context_label` (sello legible congelado). Semántica sin ambigüedad: `session` = assignment (con `sub`, «el back squat DE ese entreno»; sin `sub`, el entreno entero), `exercise` = el ejercicio del catálogo en abstracto, `race` = la carrera. Reglas que son mecanismo, no gusto: **la etiqueta la deriva el servidor** (que ya carga la entidad para validar la propiedad) con UN solo rotulador para la burbuja de iOS, la del dashboard y el push; **la propiedad se valida siempre** y lo inexistente y lo ajeno devuelven la MISMA respuesta; y **una referencia sin pregunta es ruido** — un mensaje con contexto exige body o adjunto. La tarjeta viaja DENTRO de la burbuja, no como mensaje aparte: suelta, el hilo se llena de tarjetas huérfanas que el coach tiene que emparejar a ojo con la pregunta de al lado.

**Por qué no texto libre en el `body`.** Falla los tres filtros de un campo bien puesto: el coach no puede abrir la cosa desde la burbuja, la IA no sabe de qué se habla, y las analíticas no pueden contar qué entrenos generan preguntas. Y por qué el servidor y no el cliente: si la etiqueta la manda el móvil, hay dos redactores del mismo texto y divergen el día que uno se toca.

**En consecuencia, no hacer:** no añadir un icono de «preguntar» por elemento contextualizable — es exactamente lo que se descartó, y a plena vista. No crear un segundo hilo, ni sub-hilos, ni un filtro «solo lo de este entreno»: sigue habiendo UN chat (2026-07-26, «El chat es UNO»). No dejar que el cliente escriba `context_label`. No permitir `context_sub` con kind ≠ 'session'. No abrir una segunda vía de respuesta para un comunicado tipo *pregunta*: ese ya se responde en su sitio (`ComunicadoPreguntaView`), y dos caminos para la misma respuesta es peor que uno.

**AMPLIACIÓN (mismo día, tras verlo funcionando): la tarjeta trae el dato y se abre.** Directiva de Alex: *«el coach recibe ese chat, pero al hacer click desde el chat debe viajar a eso y también previsualizar»*.

- **La etiqueta sigue CONGELADA (columna); la previsualización va VIVA (se resuelve al LEER, nunca se guarda).** Es la decisión que sostiene el resto: la etiqueta es IDENTIDAD («Fuerza A · mar 12» no cambia de significado nunca) y la previsualización es el ESTADO de la cosa ahora. Quien lee está a punto de contestar o de corregirla; una previsualización congelada haría que un coach que ya cambió el descanso contestara sobre un fantasma. Por eso no hay columna nueva ni migración.
- **La línea es la RESPUESTA, no un resumen.** Con `sub`, la prescripción de esa línea (`4×5 · 80% · descanso 90 s`) — literalmente lo que se discute. Sin `sub`, la prescripción corta de la sesión y su reloj. Una carrera, su fecha, la cuenta atrás y el objetivo.
- **En LOTE, cinco consultas por página de mensajes** sea cual sea N (`web/lib/chat/context-preview.ts`). Un N+1 aquí es inaceptable: el hilo pagina de 30 en 30. Probado contando viajes reales con el hook `debug` de postgres, no llamadas de la etiqueta —que sobrecontarían fragmentos anidados.
- **Cero formateadores nuevos.** Reutiliza `loadTemplateSummaries` (`web/lib/athlete/week-plan.ts`, el mismo cálculo que sirve `/api/athlete/plan/week`), `prescriptionToText` (`shared/domain/prescription/to-text.ts`), `raceDayLabel` y los rótulos de categoría del catálogo. Duplicar la clasificación de bloques habría creado la segunda gramática de dosis del repo.
- **El destino, y por qué cada uno:** en el panel, `?tab=plan&sesion=<assignment_id>` (nuevo, y de paso hace la sesión enlazable para cualquiera). En iOS, lo **hecho se mira** (la lectura de lo que pasó) y lo **pendiente se estudia** (el índice de técnica): abrir el contenedor de entreno desde una conversación invitaría a empezar a entrenar por accidente, que no es lo que pide quien está preguntando algo.
- **`exists` y `state` existen para no mentir.** Sin `exists` confirmado por el servidor (fila optimista, mensaje anterior a esto) y sin `state` (no sabríamos en qué modo abrirlo) no se ofrece toque, ni galón, ni cursor de mano. Una carrera y un ejercicio de catálogo enseñan su dato y no navegan. La etiqueta congelada sobrevive siempre, aunque la cosa se borre.
- **Hallazgo del camino, que vale más que la feature:** `loadTemplateSummaries` se escapaba al pool de producción ignorando el cliente que se le pasara. Se detectó porque un test contra una rama de Neon intentó conectar a producción y falló. Ahora acepta el cliente por parámetro (con defecto, cero cambio para su llamador de siempre). **Cualquier función que consulte y no acepte su cliente es un test que miente o una escritura en la base equivocada.**
- **En el panel, la URL no se toca con `router.replace`** sino con `history.replaceState`: la ruta es dinámica y lee `searchParams` en servidor, así que un replace disparaba un fetch RSC y recargaba la ficha entera solo por abrir un cajón.

**Lo que se acepta como coste, declarado:** el resumen post-entreno, el detalle de carrera, el detalle de ejercicio y un comunicado no tienen menú ni puerta al chat, así que desde ahí son TRES toques (salir → «+» → elegir) en vez de uno. Con cero controles nuevos no hay arreglo posible. Si algún día se ve que ahí duele, el arreglo correcto es llevar la puerta del chat al cromo de esas pantallas (una vez por pantalla, el mismo icono que ya vive en cuatro cromos) y NO un icono por cosa.

**Dónde vive:** propuesta en el doble `web/components/design-twin/screens/chat-contexto/` (7 guiones), con el chip y la tarjeta en las piezas COMUNES del chat (`screens/chat-coach/piezas.tsx`) porque la burbuja es compartida. Dato y validación: `infra/migrations/0186_*`, `web/lib/chat/`. iOS (aprobado y construido el mismo día): `ios/FAHYBRIK/Chat/{ChatContext,ChatContextViews}.swift` (modelo, chip, tarjeta y selector), con las puertas en `Chat/ChatHeaderButton.swift` (`\.openChat` con carga), `Plan/PlanAcciones.swift`, `Plan/SessionExercisesSheet.swift` y `Carreras/CarrerasView.swift`.

**Un detalle de iOS que no es de acabado:** `ChatContextRef.kind` se decodifica como String y no como enum. Los mensajes llegan dentro de un `@LossyArray`, así que un `kind` nuevo servido a un binario viejo no daría un icono raro — haría DESAPARECER ese mensaje del historial del atleta. Se pinta con su etiqueta, que es lo único que la pantalla necesita, y no se reenvía a ciegas si hay que reintentar.

---

## 2026-08-12 (madrugada) · El mapa de la ruta SÍ sale limpio — el puente tiempo↔posición es la distancia, no un reloj

**Declarado fuera de alcance dos veces antes de esta.** Primero por un campo que faltaba (`route_polyline` no llegaba a `CoachSessionDetail`, ya resuelto esta misma noche). Después por dos huecos reales que parecían más serios: (a) no existía decodificador de polilínea en el repo, solo un contador de puntos (`polylinePointCount`); (b) el mapa del mockup (`carrera-en-el-panel.html` §09) colorea por la zona de ritmo del atleta, y esas bandas no viajaban en ningún payload. La instrucción explícita, la tercera vez: si al mirarlo de verdad no salía limpio, decirlo y cerrarlo con Alex — nunca construir un mapa que enseñe menos que el que el atleta ya tiene en el móvil.

**Sale limpio. La razón por la que se puede afirmar sin datos reales que lo validen** (`workout_routes`/`workout_traces` están a 0 filas en producción hoy): la polilínea no lleva marcas de tiempo, pero en iOS (`WorkoutLiveDataSources.swift`, `RunLocationProvider.locationManager(_:didUpdateLocations:)`) `onCoordinate` (alimenta la polilínea) y `onDistanceDelta` (alimenta la traza de `distance`) disparan desde el MISMO `.accept(let meters)`, con la MISMA llamada `loc.distance(from: prev)`. No son dos aproximaciones de lo mismo — son dos lecturas del mismo cálculo. Eso hace que "cuánto se ha andado según la polilínea" y "cuánto marca la traza de distancia" sean la misma magnitud, y una sirve para localizar la otra en el tiempo. Verificado por construcción (lectura de fuente), no por dato empírico — si algún día `RunLocationProvider` deja de derivar los dos callbacks del mismo fix, esta garantía hay que releerla.

**CORRECCIÓN (misma madrugada, antes de commitear).** La primera versión de esta pieza traía un decodificador de polilínea Y un haversine escritos a mano — puerto fiel del `PolylineCodec` de iOS, matemáticamente verificado, pero rueda reinventada de todos modos: un formato de codificación público y fijo, y una fórmula geodésica cerrada, no son código nuestro. team-lead lo paró antes de commitear y fijó la regla para lo que queda de sesión: **antes de escribir código de bajo nivel (parsear, medir, formatear, protocolos, geo, unidades) se busca de verdad si ya existe — no de memoria — y si existe, se usa.** Investigado (no de memoria): `@mapbox/polyline` — licencia BSD-3-Clause real (el "Proprietary" de `npm view` es solo un `package.json` sin campo SPDX, verificado contra el LICENSE del repo), algoritmo matemáticamente equivalente al propio pero con aritmética normal en vez de bitwise de 32 bits (sin techo de magnitud). `haversine-distance` — MIT, cero dependencias, tipos propios con la MISMA forma `{lat, lon}`, fórmula con `atan2` (evita el caso límite que el propio código defendía a mano con un `Math.min`). Los dos sustituyen al código propio.

**Decidido — la arquitectura:**
- **El decode vive en `web/lib/sync/polyline.ts`**, junto a `polylinePointCount`, no en `shared/domain/`: es un formato de codificación fijo (Google Encoded Polyline, precisión 5), sin variación posible por metodología de coach — infraestructura, no dominio. Envuelve `@mapbox/polyline` (`decode`), con UN guardia propio: el paquete no descarta una cola truncada (un sync interrumpido) — reconstruye un punto final con datos parciales en vez de omitirlo, verificado empíricamente contra el vector de referencia de Google sin su último carácter. `polylinePointCount` (que sigue sin depender de ningún paquete — no hay uno que cuente sin decodificar) ya sabe cuántos puntos están de verdad completos, así que `decodePolyline` recorta la salida del paquete a esa longitud. El servidor nunca codifica — solo decodifica lo que el dispositivo ya codificó — así que no existe `encodePolyline` de producción; el espejo de test también pasó a envolver el mismo paquete (`encode`), no un segundo codificador a mano.
- **La clasificación por zona vive en `shared/domain/running/route-zones.ts`**: `paceZoneForSecPerKm` es el espejo exacto de `zoneForBpm` (`hr-zones.ts`) con el eje invertido (menos segundos = más duro, no más pulso). El puente en sí (`buildRouteZonePoints`) recorre la polilínea decodificada, acumula distancia geodésica real vía `haversine-distance` (gran círculo, nunca una aproximación plana — aunque SIN afirmar que coincide bit a bit con la fórmula interna de CoreLocation, que Apple no publica; solo que las dos miden distancia esférica real), localiza el instante de cada punto invirtiendo la traza de distancia, y clasifica la velocidad en ese instante contra las bandas YA RESUELTAS del atleta — nunca las recalcula.
- **Honestidad en TRES capas, no una.** `route.available` (¿hay polilínea decodificable de al menos 2 puntos?) es independiente de si hay traza punto a punto — una ruta puede existir sin trazar velocidad (se sirve sin colorear) y una traza puede existir sin ruta (cinta). `route.pace_zones` es `null` cuando el atleta no tiene test de zonas — un mapa sin color es honesto, uno con color inventado no. Y cada `RouteZonePoint.zone_code` puede caer a `null` POR SU CUENTA cuando esa fracción concreta del recorrido no tiene cobertura de velocidad (hueco de GPS), aunque el resto del mapa sí esté coloreado.
- **`shared/domain/running/timed-series.ts` (nuevo).** Tercera aparición del mismo cálculo — "serie (t,v) ordenada + valor en un instante" — tras la copia privada de `km-splits.ts` y la que `gradient.ts` escribió esta misma noche. Se extrajo (más `timeAtValue`, la dirección inversa: en qué instante una señal acumulativa cruza un valor, que `route-zones.ts` necesita para el puente) y `gradient.ts` se retroalimentó de ella — sus 15 tests re-verificados sin cambio de comportamiento. `km-splits.ts` se deja SIN retocar a propósito: es más antiguo, con más dependientes, y el beneficio marginal de tocarlo hoy no compensa ensanchar el frente.

**El primer punto de la ruta es un caso especial, y hay que saberlo.** `onDistanceDelta` no dispara para el primer fix GPS (no hay punto anterior del que medir un delta) — así que la traza de distancia no tiene, ni puede tener, una muestra "en el punto 0" de la que interpolar. Su instante es 0 por definición (es el ancla del recorrido), nunca una búsqueda en la traza.

**Qué NO hacer en consecuencia:** no derivar el color de la ruta en el cliente (segundo motor sobre la misma traza — el mismo pecado ya evitado con el veredicto de cumplimiento y la pendiente del tramo). No escribir un segundo decodificador de polilínea, ni un segundo haversine, en ningún sitio del repo — los únicos viven envolviendo `@mapbox/polyline` y `haversine-distance`. No añadir una dependencia para un problema de bajo nivel (parsear, medir, formatear, protocolos, geo, unidades) sin buscar antes de verdad si ya existe una — y si se concluye que ninguna sirve, la razón concreta (licencia/tamaño/tipos/diferencia de comportamiento real) va en el commit, no la inercia de escribirlo. No inventar un color de zona cuando `pace_zones` es `null`. No dar por definitivamente verificado el puente tiempo↔posición contra datos reales hasta que existan filas reales en `workout_routes`/`workout_traces` — hoy está verificado por construcción del código fuente de iOS, que es distinto (y sigue siendo válido, pero conviene releerlo si `RunLocationProvider` cambia).

**Dónde vive:** `web/lib/sync/polyline.ts` (`decodePolyline`, sobre `@mapbox/polyline`), `shared/domain/running/{route-zones,timed-series}.ts` (`haversineDistanceM` sobre `haversine-distance`), `web/lib/execution/session-trace.ts` (`AssignmentDetailRoute`, wiring), `web/lib/athlete/assignment-detail.ts` (resuelve `pace_zones` vía el mismo `buildZoneLookup` que el resto del detalle). Dependencias nuevas: `@mapbox/polyline` + `@types/mapbox__polyline` (`web/package.json`), `haversine-distance` (`shared/package.json`).

---

## 2026-08-12 (madrugada) · Deuda declarada: la precedencia de la banda vive en dos sitios, y debería vivir en uno

**El hecho.** `segmentBand()` (`web/lib/dashboard/coach/run-compliance.ts`) resuelve, para un tramo, CONTRA QUÉ banda se juzga: un objetivo explícito (ritmo/RPE) gana en solitario; si no, la zona ya resuelta PARA ESE TRAMO (`seg.resolved`); si no, la zona resuelta del bloque (`item.resolved_intensity`). Es la misma precedencia que ya cazó un bug real esta noche (`segmentBand()` ignoraba `seg.resolved` — entrada de arriba, "El veredicto de carrera empieza a juzgar la recuperación"). "El doble" (la lectura de carrera del atleta, `web/components/design-twin/`) necesita la MISMA respuesta para pintar su franja, y hoy la resuelve por su cuenta, del lado del cliente.

**Por qué es un problema, no una curiosidad.** Es la MISMA clase de divergencia que ya ha costado dos modelos de zonas y un fork de `SEG_MODALITY_SQL` (ver cabecera de `segment-work.ts`): dos sitios que prometen calcular lo mismo acaban divergiendo el día que uno se toca y el otro no. Ahora que `RunComplianceTramo.band` expone el resultado YA resuelto por el servidor (esta misma tarde, a petición del panel), la pregunta correcta ya no es "¿cómo resuelvo la banda aquí también?" sino "¿por qué la resuelvo dos veces?".

**Decidido:** NO se colapsa esta tarde. Con tres agentes en vuelo sobre el mismo dominio (servidor, panel, doble), mover la lógica de `segmentBand()` a un módulo neutro de `shared/domain/running/` — con un tipo de entrada que no dependa de `AssignmentDetailItem`/`Segment` tal cual los conoce el servidor — es un refactor real, no una extracción de cinco minutos, y ensancha el frente en el peor momento.

**Qué NO hacer en consecuencia:** no añadir una TERCERA copia de esta precedencia en ningún sitio nuevo — cualquier superficie que necesite "¿contra qué banda se juzga esto?" debe leer `RunComplianceTramo.band`/`RecoveryComplianceTramo.band` (ya expuestos) en vez de re-derivarla. Cuando se aborde el colapso: el módulo neutro vive en `shared/domain/running/`, lo importan `run-compliance.ts` (servidor) y "el doble" (cliente) por igual, y el primer indicio de que hace falta es el día que alguien tenga que arreglar la precedencia en un sitio y se le olvide el otro.

---

## 2026-08-12 (madrugada) · "Carrera comprometida" SE CONSTRUYE — pendiente de validar contra carreras reales

**Decisión anterior, y por qué estaba mal razonada.** La primera versión de esta entrada decía "no se construye: sólo hay 1 ejecución con trabajo previo a una serie de carrera, y esa fila ni tiene ritmo medio". El hecho era cierto; la conclusión no se seguía de él. La base de hoy es de **demostración** — no hay atletas reales, no hay historial real — así que "cuántas parejas hay hoy" mide el tamaño del seed, no si la métrica es posible ni si valdrá. El filtro correcto para cualquier conclusión de este tipo: **«si el seed fuera otro, ¿cambiaría mi conclusión?»**. Aquí sí, radicalmente: en HYROX casi ningún kilómetro se corre fresco, así que con atletas reales entrenando esta comparación va a ser de las más frecuentes que existan. La pregunta que había que hacerse no era "¿hay parejas hoy?" sino "¿el esquema permite responder si este kilómetro fue después de una estación?" — y esa se contesta sola.

**El mecanismo YA EXISTÍA.** `shared/domain/race-transfer/compute.ts` (el cruce carrera×entreno, ya en producción) resuelve exactamente "fresco vs fatigado" desde `segment_executions.context_format`/`prior_work_s` (migración 0120) con `classifyEffort` — pura, exportada, ya probada. "Carrera comprometida" reutiliza esa función tal cual (nunca una segunda clasificación que pudiera divergir de la que ya usan las 8 estaciones + la carrera del cruce) y añade lo que race-transfer no necesita: **emparejar por la MISMA banda prescrita** (no agregar todo el histórico a un único fresco/fatigado) y **trocear por semana** (una curva, no un snapshot).

**Construido:** `shared/domain/running/compromised-pace.ts` — `buildCompromisedPaceTrend`, puro. Por cada semana, para cada banda de ritmo con al menos una observación fatigada ESA semana y al menos una fresca HASTA esa semana (nunca del futuro — un punto de la curva no puede explicarse con un dato que todavía no había pasado), el coste es `media(fatigado) − media(fresco)`, **en s/km** (no en % — a diferencia de `decoupling_pct`, aquí las dos partes ya son ritmos en la misma unidad: restarlas no inventa nada). El punto semanal es la media entre bandas activas esa semana. `min_pairs_for_compromised_trend` (defecto 4, migración `0184`, columna nueva sobre `coach_running_thresholds` porque la `0183` ya estaba aplicada) gatea cuándo la tarjeta se atreve a decir que la curva es de fiar — los puntos siguen ahí por debajo del mínimo, sólo se retira la promesa, misma ley que el resto de este encargo.

**Los casos de prueba están FABRICADOS, no esperan al seed** (11 tests, `web/tests/running/compromised-pace.test.ts`): una serie de carrera dentro de un bloque multiestación (fatigado) contra la misma serie en fresco, objetivos distintos que no se emparejan, ausencia de referencia fresca, el fresco del futuro que no puede explicar una semana pasada, una simulación completa que siempre es fatigada aunque el trabajo previo sea poco, un tramo sin clasificar que se descarta en vez de adivinarse, y la reproducción exacta de la curva "de 9 a 4 s/km en seis semanas" del mockup.

**SIN VALIDAR TODAVÍA CONTRA CARRERAS REALES.** Verificado contra la ejecución del cargador real (`buildRunningAnalytics`, rama Neon efímera): no rompe con los datos escasos de hoy, declara el hueco honestamente (`has_enough_data: false`, puntos igual de completos). Eso es lo único que hoy se puede afirmar. Cuando existan atletas reales entrenando HYROX, hay que releer esta lectura contra sus carreras antes de darla por buena — puede que el emparejar por banda EXACTA sea demasiado estricto en la práctica (¿debería tolerar una banda "parecida"?), o que la ventana de 12 semanas no sea la que hace falta. Es una hipótesis de diseño bien fundada, no un hecho verificado contra atletas reales — y las dos cosas son distintas.

**Qué NO hacer en consecuencia:** no reintroducir una segunda clasificación fresco/fatigado en ningún sitio — todo lo que necesite esa pregunta importa `classifyEffort` de `shared/domain/race-transfer`. No tratar la falta de parejas en una base de demostración como evidencia de que una métrica no vale — el filtro es si el ESQUEMA permite responder la pregunta, no si el SEED ya trae la respuesta. No dar esta lectura por definitivamente calibrada hasta releerla contra carreras reales.

**Dónde vive:** `shared/domain/running/compromised-pace.ts`, `web/lib/coach/running-analytics.ts` (`loadCompromisedPaceObservations`), `infra/migrations/0184_coach_running_thresholds_compromised.sql`.

---

## 2026-08-12 (madrugada) · Los agregados del entrenador: calibración, huella, volumen y carga — el veredicto delante, los umbrales del coach detrás

**Decidido:** cuatro lecturas nuevas para el panel de carrera del coach (mockup `carrera-en-el-panel.html` §05/§06), todas server-side, todas honestas sobre su propio hueco:

- **Calibración** (`shared/domain/running/calibration.ts`) — hacia dónde falla (`rapido`/`dentro`/`lento`) + dónde se rompe DENTRO de la serie (desglose por posición 1ª, 2ª, 3ª…). Entra por **tramos de RITMO únicamente** (`RunComplianceTramo.band_axis === 'pace'`, campo nuevo) de sesiones de series con objetivo explícito — nunca rodajes ni RPE, porque mezclarlos taparía justo lo que se está midiendo. Los veredictos de recuperación y de duración (los dos encargos anteriores de este mismo bloque) **no entran aquí a propósito**: son preguntas distintas («¿aguantó el descanso?», «¿corrió el tiempo entero?») y meterlas en el mismo porcentaje repetiría el error que ese bloque acababa de arreglar.
- **Huella** (`shared/domain/running/pacing-shape.ts`) — «cómo reparte el esfuerzo», agregado de sesiones. Es un **port fiel** de `aguanteDe`/`ritmoDe` (`web/components/design-twin/tramos.ts`, la misma aritmética que ya corre en `FormaDeCarrera.swift` en el reloj del atleta). Sus dos constantes (mínimo 4 tramos, margen 2%) **NO se hacen editables por el coach** — deliberado, no un olvido: tienen que leer exactamente igual que lo que el atleta ya ve al terminar ("son las mismas tres palabras que la app le enseña a él"), y divergir aquí abriría la misma clase de bug de "dos números que no cuadran" que este proyecto ya ha pagado más de una vez.
- **Volumen semanal en km** (`web/lib/coach/running-volume.ts`) — funciona hacia atrás (la distancia siempre se guardó), zero-fill por semana (una semana sin carrera es un cero real, no un hueco — a diferencia del tiempo en zonas), semana en curso marcada y excluida de la tendencia. Usa `SEG_COUNTS_AS_VOLUME` (recuperación incluida), el MISMO predicado que ya usa `athlete-deep-dive.ts#loadModality` — dos lectores preguntando lo mismo con el mismo predicado, a propósito.
- **Carga con el veredicto delante** (`shared/domain/training-load/load-verdict.ts`) — fondo/reciente/frescura de `banister.ts`, con un veredicto ("está apretando") gateado por DOS puertas independientes: cobertura (`readLoadCoverage`, ya existente) y un arranque en frío nuevo (`checkColdStart` — días de historial reales contra la ventana crónica). Los números NUNCA se esconden, sólo el veredicto — misma ley que ya regía `readLoadCoverage`.

**Método del coach, nueva tabla** (`coach_running_thresholds`, migración 0183, mismo patrón que `coach_signal_thresholds`/0161 — una fila por coach, reemplazo entero, defectos en `shared/domain/`, nunca `default` de columna): `min_reps_per_position` (3), `min_series_for_calibration` (20), `freshness_alert_tsb` (−8).

**Deuda declarada, no colada — dos piezas que el mockup pide método pero NO se tocan este lote:**
- Los días de fondo/reciente de la carga (42/7, los τ de la EWMA de `banister.ts`) — hacerlos editables movería el NÚMERO (no sólo su etiqueta) en cada pantalla que ya lee CTL/ATL/TSB (forma del atleta, ficha general del coach, race-readiness). Cambiarlo sólo para este panel divergiría del resto; cambiarlo en todas partes es un refactor de mucho más alcance que este encargo.
- La cobertura mínima para dar veredicto (90%, `LOAD_COVERAGE_MIN` en `coverage.ts`) — mismo argumento: la usan "progress readiness, roster, deep-dive" por su propio comentario.

**Qué NO hacer en consecuencia:** no tocar `MIN_LEGS_FOR_PACING_SHAPE`/`PACING_SHAPE_MARGIN` sin tocar `FormaDeCarrera.swift` a la vez. No mezclar los veredictos de recuperación/duración en el porcentaje de calibración. No hacer editables `ctl_window_days`/`atl_window_days`/`LOAD_COVERAGE_MIN` sin antes localizar y actualizar TODOS sus consumidores existentes — hacerlo sólo para este panel crearía el número divergiendo entre pantallas para el mismo atleta, que es peor que no ofrecer la edición.

**Dónde vive:** `shared/domain/running/{calibration,pacing-shape,weekly-volume}.ts`, `shared/domain/training-load/load-verdict.ts`, `shared/domain/coach/running-thresholds.ts`, `web/lib/coach/{running-analytics,running-volume,running-thresholds}.ts`, `infra/migrations/0183_coach_running_thresholds.sql`. `RunComplianceTramo` gana `rep_ordinal`/`band_axis` (`web/lib/dashboard/coach/run-compliance.ts`).

---

## 2026-08-12 (noche) · La duración es la SEGUNDA pregunta de un tramo — el agujero que el colapso de recuperación dejaba abierto

**El agujero.** El motor de cumplimiento juzga tres ejes — ritmo, pulso, RPE — y ninguno es duración. Combinado con el colapso de recuperación de esta misma tarde (donde ir lento nunca es un fallo), un "6×1000 con 60 s de trote" corrido al ritmo pedido pero con 3 min de descanso leía "6 de 6 dentro · recuperación controlada": el sistema no tenía forma de decir que esa NO fue la sesión prescrita. No es un caso de laboratorio — en series a umbral la recuperación INCOMPLETA es el estímulo; doblar el descanso cambia la sesión entera.

**No es un cuarto axis.** `ComplianceBand`/`evaluateRunSegment` comparan INTENSIDAD; esto compara CUÁNTO DURÓ un tramo contra `Segment.measure`, cuando esa medida es tiempo. Son dos preguntas independientes sobre el MISMO tramo — un `rec(dur(90),'trote',paceZone(1))` tiene target de ritmo Y duración prescrita a la vez — así que cada tramo lleva `verdict` (intensidad) y `duration_verdict` (duración) en la misma fila, nunca colapsados en un número. Solo se juzga cuando `measure.type === 'duration'`: medido por distancia, no hay nada contra qué comparar.

**La dirección se invierte otra vez, y al revés que en recuperación-intensidad:**
- Recuperación: el fallo es PASARSE de tiempo (más descanso cambia el estímulo). Quedarse corto es, si acaso, un mérito.
- Trabajo: el fallo es QUEDARSE CORTO (menos dosis de la pedida). Pasarse de tiempo no reduce el estímulo — es la imagen especular exacta.

Por eso hay dos vocabularios (`WorkDurationVerdict`/`RecoveryDurationVerdict`), no un veredicto con un parámetro de rol: que cada uno sea autoexplicativo evita leer "corta"/"larga" sueltos sin saber a qué tramo tocaban.

**La tolerancia no se inventó — se reusó.** `shared/domain/adherence/bands.ts` ya declaraba `duration` en `MEASURE_BAND_OVERRIDES` desde antes (comentario propio: "declared empty so future edits land here"), con el 10% relativo de `DEFAULT_BAND_RULE`. Este lote es su primer consumidor real. Sigue siendo MÉTODO del coach — cuánto margen se da a un descanso no es un hecho físico — así que vive en ese default centralizado, no en una constante muda aquí, y hoy no hay UI que la edite: deuda declarada, igual que el default de recuperación de los arquetipos (entrada de esta tarde).

**El trabajo también estaba sin juzgar en tiempo, en las dos rutas.** Comprobado al hacer el encargo: ni el camino nativo (leg_index) ni el heredado (zip posicional) comparaban duración de trabajo contra lo prescrito. Las dos rutas lo hacen ahora.

**Qué NO hacer en consecuencia:** no colapsar `duration_verdict` dentro de `verdict` — son preguntas distintas y conviven; no tratar "se pasó de tiempo" como un fallo en el trabajo, ni "se quedó corto" como un fallo en la recuperación — es la imagen especular exacta, invertirla revienta la lectura; no inventar una duración prescrita para un tramo medido por distancia.

---

## 2026-08-12 · El veredicto de carrera empieza a juzgar la recuperación — y con dirección invertida

**El bug.** El motor de cumplimiento (`web/lib/dashboard/coach/run-compliance.ts`) saltaba TODO tramo de recuperación (`leg_role==='recovery' || seg.kind==='recovery'`), pero la gramática ya permite prescribirle un objetivo (`rec(dur(60),'trote',rpe(3))`, arquetipo fartlek) y `segment_executions` ya lo mide desde la 0146. Un coach podía escribir "recupera a RPE 3" o "en Z1" y el sistema nunca lo comprobaba — la decisión del 9-ago ("una recuperación de correr no es un descanso… se MIDE") estaba bien tomada; lo que se construyó encima no la siguió.

**La regla:** una recuperación SIN objetivo no se juzga (se omite, igual que antes — no se le inventa uno). Una recuperación CON objetivo se juzga, pero con veredicto propio: `evaluateRecoverySegment` (shared/domain/adherence) colapsa el eje de 4 vías del trabajo (`dentro`/`fuera_rapido`/`fuera_lento`/`sin_dato`) a 3 (`controlada`/`demasiado_rapida`/`sin_dato`) porque **solo irse RÁPIDO en recuperación es un fallo real** — es la fatiga acumulada la que explica que la serie 5 se caiga. Irse lento, o pararse cuando se pidió trotar, es `controlada`: nadie falla por descansar de más.

**Separación estructural, no un campo `kind`.** `RunComplianceResult` gana `recovery_summary`/`recovery_tramos`, arrays y tipos DISTINTOS de `summary`/`tramos` — nunca un discriminador dentro del mismo array. Un "6 de 6 en el trabajo, 2 de 6 en la recuperación" tiene que dar DOS números, no un porcentaje mezclado que no dice nada.

**Bug lateral encontrado al arreglar esto: `segmentBand()` ignoraba `seg.resolved`.** Cada tramo con objetivo de zona ya lleva su propia banda resuelta por atleta (`assignment-detail.ts`, `runWireStructure`/`enrichSeg`), pero `segmentBand()` usaba SIEMPRE `item.resolved_intensity` (la banda del bloque). Era inofensivo mientras todo el trabajo de un bloque compartía zona y la recuperación nunca se juzgaba; en cuanto una recuperación en Z1 conviva con trabajo en Z4, juzgarla contra la banda del bloque falla cualquier recuperación honesta. Arreglado: `segmentBand()` prefiere `seg.resolved` y solo cae al del ítem cuando el tramo no trae el suyo — cero cambio observable para el trabajo (mismo test de regresión lo prueba).

**Los arquetipos traían el caso raro por defecto.** `series` y `pirámide` sembraban `rec(dur(90),'parado')` sin objetivo; solo fartlek traía trote. Cambiado a trote en Z1 (coherente con que su trabajo ya hable en zonas) para `series`/`pirámide`. `cuestas` se queda en `caminar` sin objetivo — reps cortas y casi máximas (200-400 m) es donde parar/andar sigue siendo honesto, y así lo dijo Alex explícitamente.

**Deuda declarada, no colada (regla Nº0):** qué recuperación trae un arquetipo por defecto es MÉTODO del coach, no mecanismo nuestro — candidato a dato editable. No se implementó así en esta tanda: exigiría esquema nuevo + UI de ajustes, un refactor real y no una extracción limpia de cinco minutos. El default vive en código (`archetype-prefills.ts`) a propósito, con el caso habitual como valor por defecto, hasta que alguien decida construir esa pieza.

**Qué NO hacer en consecuencia:** no juzgar una recuperación sin objetivo con la banda del bloque "por si acaso"; no mezclar `recovery_tramos` en `tramos` ni sus dos summaries en uno; no tratar `fuera_lento`/parar-cuando-tocaba-trotar como un aviso en recuperación — es la lectura correcta para el trabajo, no para esto.

---

## 2026-08-12 · El foco de la semana vive en la SEMANA DEL ATLETA; la plantilla solo pone el defecto

**Contexto:** «Foco de la semana» solo existía en `program_week_templates.focus`.
Una semana sin cadena —creada directa por el coach en la ficha, o dictada por el
conector MCP (`weekly_plans.microcycle_id` NULL, el caso real de Alex)— no venía de
ninguna plantilla y NO PODÍA llevar foco. La cabecera del atleta salía vacía y no
había dónde escribirla.

**Decidido (migración 0182):** `weekly_plans.focus`, anulable, sin default. Al
servir: `weekly_plans.focus ?? focoDePlantilla` — la semana real del atleta manda,
la plantilla es el defecto heredado. Un coach que no toca nada se comporta igual
que ayer.

- **UN solo escritor** (`web/lib/coach/week-focus.ts`), usado por el PATCH del
  panel y por la tool MCP **`set_week_focus`**. Ni un segundo camino de escritura.
- **El gotcha que ese escritor evita y no hay que reintroducir:** `weekly_plans.status`
  nace `'draft'` por DEFAULT (0021). Un upsert ingenuo de foco sobre una semana SIN
  fila la habría convertido en OCULTA («sin fila SE VE», 10-ago). El INSERT fija
  `status='published'` explícito (el equivalente exacto de «sin fila»); el UPDATE
  toca `focus` en solitario. **Escribir el foco jamás publica ni esconde nada.**
- **Un borrador no adelanta su foco:** el portón que esconde las sesiones de una
  semana `draft` esconde también su foco propio, aplicado en el lector del atleta
  (`resolveAthleteFacingFocus`). El coach sí ve su borrador en panel y conector.

**Qué NO hacer:** no escribir `weekly_plans` desde otro sitio para el foco; no
«arreglar» el INSERT quitándole el status explícito; no fundir foco de semana y de
plantilla en la DB (el merge es de LECTURA — borrar el override debe devolver el
defecto de plantilla, y eso solo funciona si son columnas distintas).

---

## 2026-08-12 · Al terminar de correr manda el VEREDICTO, no el ritmo medio

**Decidido (Alex, viendo las dos montadas):** cuando una carrera tenía objetivo
medible, el sujeto de la lectura al terminar es **si el atleta clavó lo que le
pidieron** («5 de 6 dentro»), con el matiz de hacia dónde falló lo que se salió.
El ritmo medio baja a apoyo.

**La alternativa descartada** (se conserva montada en el doble, escenario ① B,
para que la decisión no haya que volver a tomarla a ciegas): el número grande era
el ritmo medio de las series y el veredicto iba debajo — enseñar sin juzgar.

**Por qué:** el ritmo medio de unas series lo da cualquier reloj de 200 euros. El
veredicto contra la banda del entrenador **no lo puede dar nadie más**, porque
ningún reloj sabe qué te pidieron. Poner de sujeto lo que cualquiera tiene y
esconder lo único propio era regalar la ventaja. Y es además la pregunta que el
atleta trae en la cabeza cuando para el reloj: no «a cuánto he ido», sino «¿las
he hecho?».

**La jerarquía completa del sujeto**, por precedencia, que es lo que hay que
respetar al portarlo a Swift:

1. Hubo objetivo medible → el veredicto.
2. Hubo contraste sin objetivo (fartlek por sensaciones) → el contraste, fuerte
   contra suave.
3. Uniforme con objetivo de zona → el tiempo dentro de esa zona.
4. Uniforme sin objetivo → el ritmo medio.
5. Sin cobertura → los totales, **declarando por qué** no hay más.

**Consecuencias que no son negociables al construir:**

- **El troceado depende de la forma: por repetición O por kilómetro, nunca los
  dos.** Los kilómetros de un 6×800 no dicen nada y las repeticiones de un rodaje
  no existen.
- **En pendiente el veredicto de ritmo se retira** y el troceado se lee en tiempo:
  un ritmo bruto al 8% no significa nada.
- **Con un solo tramo no hay veredicto que dar.** «1 de 1 dentro» no es una
  lectura: ahí manda la media.
- **La banda del coach se DIBUJA sobre la curva**, para que se vea entrar y salir
  de ella en vez de tener que creerse un número. Y con una regla que hay que
  respetar al portarlo: **la franja va sobre el eje donde vive su objetivo, y solo
  donde ese objetivo aplicaba.** Un objetivo de ritmo se dibuja sobre el ritmo y
  **solo dentro de los tramos de trabajo** — una franja continua por encima de los
  trotes diría que el coach pidió ese ritmo también en la recuperación, y no lo
  pidió. Un objetivo de zona se dibuja sobre el **pulso**, que es la señal que lo
  mide; dibujarle una banda de ritmo sería enseñar una comparación que nadie hizo.
  En un esfuerzo continuo sí abarca todo el ancho, porque todo el rato aplicaba.
- **El eje de la curva lo fija LO QUE SE CORRIÓ. Andar y parar no es correr.**
  Parado no tiene ritmo y ya era un hueco. Andar es otra forma de moverse: 11:40
  al lado de subidas a 4:30 no es un ritmo lento, es otra actividad — se dibuja
  igual, a puntos y pegada al suelo, con la leyenda diciendo que se sale de
  escala, pero no ensancha el eje. Trotar **sí** es correr: un trote a 6:10 entre
  series a 3:30 entra en el eje, con su franja y su veredicto, porque además suele
  ser LA explicación de que la quinta repetición se caiga. Suelo: si no se corrió
  nada, el eje lo fija lo que haya.
  Sale de `modo`, que ya está en el modelo, así que **no hay ningún umbral que
  ajustar nunca**.

  **Esta regla se afinó tres veces y las dos primeras versiones suenan
  razonables, así que alguien las reintroducirá. Quedan anotadas como erróneas:**
  1. «El eje se escala al rango del trabajo» — mal: en una serie el calentamiento
     va mucho más lento que las repeticiones, así que ceñirlo al trabajo convierte
     «seis picos que nacen de un rodaje» en «seis mesetas flotando». Rompía las
     gráficas buenas para arreglar la mala.
  2. «El trabajo y lo continuo; la recuperación entra solo si cabe» — mejor, pero
     apuntaba al PAPEL del tramo, que era una correlación, no la causa. Medido: el
     escenario estrella se salvaba **por dos segundos** y el de cinta ya salía
     roto, con el trote punteado en el suelo. Cualquier atleta que trote un poco
     más suave lo tiraba fuera.
- **Ninguna casilla vacía y ningún guion de relleno.** Si falta cobertura se dice
  por qué. Una sesión anterior al archivo enseña sus totales y una frase que lo
  explica, no una pantalla con huecos.
- **La otra mitad de esa regla: un hueco se declara cuando el atleta podría hacer
  algo al respecto; cuando en esa superficie sencillamente no existe, la app se
  calla.** Una sesión sin traza declara que no la tiene, porque las nuevas sí la
  tendrán. Una sesión en cinta NO declara que le falta el mapa: no hay nada que
  hacer para tenerlo, y anunciarlo convierte una propiedad de la superficie en una
  carencia. Igual con el desnivel de una cinta sin inclinación: no es un dato que
  falte, es uno que no existe.
- **La escala es propiedad del DATO; el suavizado, solo del DIBUJO.** El eje se
  calcula sobre la señal cruda, nunca sobre la suavizada. La media móvil cruza la
  frontera del tramo, así que la última muestra de una subida ya lleva dentro el
  ritmo del paseo siguiente: filtrando sobre la suavizada, la recuperación se cuela
  por la puerta de atrás y el eje sigue estirado. Medido: 4:02-8:32 en vez de
  4:16-5:54.
- **El color es dato.** Una sesión sin zonas no se pinta de ningún color.
- **LA TRAZA NO MANDA SOBRE LOS TRAMOS.** El archivo sirve la curva y los
  kilómetros; los tramos y sus veredictos salen de `segment_executions` y existen
  desde MUCHO ANTES de que existiera el archivo. Atar el troceado a
  `trace.available` hace que toda sesión ya guardada esconda la mitad de su
  lectura y enseñe «sin archivo» teniendo seis series medidas y juzgadas.
  El error nació de portar la regla desde la app del atleta, donde SÍ es cierta
  (si el móvil no archivó, el atleta no tiene nada). **La suposición que sostiene
  una regla no viaja con la regla cuando se porta a otra superficie**, y el sitio
  donde eso se ve es la forma de los datos reales, no la del mockup: unos tests
  escritos con la misma suposición que el código no lo cazan nunca.

**Y las dos superficies nacen a la vez.** El panel del coach se diseña antes de
portar nada a Swift, para que atleta y entrenador no acaben con dos idiomas del
mismo entreno — que es exactamente lo que arrastrábamos: el coach tenía veredicto
por repetición y el atleta no; el atleta tenía lectura honesta y el coach no.

---

## 2026-08-12 · Las tres columnas huérfanas de la 0154 encuentran su motor — y un CHECK que llevaba desde entonces mintiendo sobre qué es una delta

**Contexto:** `workout_executions.decoupling_pct` / `elevation_gain_m` / `elevation_loss_m` / `hr_recovery_60_bpm` existían desde la 0154 y nadie las llenaba. Las cuatro exigen recorrer la traza entera (la regla que la 0156 ya dejó escrita: se guarda lo que exige recorrer la traza, se calcula lo que depende del atleta), así que se enganchan en el mismo sitio que el reparto de zonas — `ingest-workout-traces.ts` — vía un módulo nuevo, `web/lib/execution/measured-header.ts`, que llama a tres funciones puras en `shared/domain/running/`.

**Bug encontrado y arreglado en el camino (mig 0181):** `workout_executions_hr_chk` (0154) exigía `hr_recovery_60_bpm between 30 and 260` — el rango de un PULSO ABSOLUTO, copiado a la fila de una columna que en realidad es una DELTA (cuánto cayó el pulso, no cuánto marca). Verificado contra producción: una recuperación de 18 lpm —buena y corriente— no pasaba el CHECK. Nadie lo había notado porque la columna llevaba vacía desde que existe; esta tanda es la primera que la escribe de verdad. Corregido a `0-150` (0 de suelo porque el motor que la alimenta ya descarta una caída negativa antes de guardar; 150 de techo generoso, red de seguridad y no un límite fisiológico). El Zod de `shared/schema/workouts.ts` tenía el mismo bug copiado y se corrigió igual.

**Decisiones de dominio, con su porqué:**

- **Deriva aeróbica (Pa:HR/Friel):** EF = velocidad / pulso; deriva = caída de EF de la primera a la segunda mitad, en %. Elegible SOLO con exactamente UN tramo de fase `main` (mig 0146) — cero tramos main es "nada que medir"; DOS o más es una sesión de series (alternando trabajo/recuperación) O progresiva (tramos distintos a propósito), y en los dos casos el supuesto de esfuerzo constante del método ya no se sostiene. Sin tramos etiquetados (carrera sin estructura), se excluyen los primeros 10 min (`WARMUP_SKIP_S`, la convención estándar del método) antes de partir en mitades. Mínimo 20 min de esfuerzo sostenido (`MIN_SUSTAINED_DURATION_S`) y cobertura real (≥4 muestras, ningún hueco > 180 s) en cada mitad, para pulso Y velocidad. NO lee `decoupling_target_pct`/`decoupling_regress_threshold_pct` (methodology-system.ts): esos son el veredicto del coach; este módulo solo da el número (regla Nº0, mecanismo vs método).
- **Desnivel:** histéresis contra una línea base con umbral de 3 m (`ELEVATION_NOISE_THRESHOLD_M`), no una media móvil ni sumar deltas a pelo — una traza llana con jitter de GPS da 0, no 200 (el test que acepta la pieza). Ganancia y pérdida se guardan por separado, nunca netas.
- **Recuperación de pulso:** espeja `HRRecoveryCapture` (iOS) 1:1 — mismos umbrales (cola de 10 s, marca a 60 s, tolerancia ±5 s, cobertura exigida a los 58 s), mismo criterio (caída negativa → null, nunca un artefacto). El ancla del "fin del esfuerzo" es el final del ÚLTIMO tramo de TRABAJO (no el final de la grabación) — una vuelta a la calma grabada después no debe adelantar la ventana de recuperación.

**Qué NO hacer en consecuencia:**

- No calcular deriva sobre una sesión de series ni sobre un progresivo, aunque "total esfuerzo trabajado" tiente a dar un número. Es ruido con forma de dato.
- No sumar deltas de altitud sin histéresis ni umbral: infla el desnivel de una tirada llana, y encima en la dirección que más halaga.
- No inventar un segundo criterio de recuperación de pulso: si `HRRecoveryCapture` cambia sus umbrales, este módulo cambia con él.
- No meter el veredicto de deriva (bueno/regresión) en el motor: eso vive en el dato editable del coach, no en código.
- No rellenar retroactivamente sesiones sin traza: las cuatro columnas se quedan `null` si no hay traza que recorrer.

---

## 2026-08-12 · La vista del ciclo es un CAMINO, no un boletín. Y el pie del 6-ago se retira

**Decidido (directiva de Alex, 11-ago):** la pestaña Plan mueve la entrada al ciclo
del PIE al CROMO SUPERIOR (icono `square.stack.3d.up`, el mismo símbolo del bloque,
antes de calendario y chat), y `PlanCicloView` se reconstruye espina-first portando
la propuesta que ya existía en el doble (`web/components/design-twin/screens/plan-ciclo/`).

**Esto REVIERTE a propósito la decisión del 6-ago** («el botón de pie “El bloque”
necesita un destino real»). Lo que se retira, y por qué:

- **`EntradaAlCiclo`** (`Plan/PlanHoyAtoms.swift`): una tarjeta de tres líneas
  anclada al pie que repetía lo que `CabeceraDelBloque` ya dice —nombre del bloque y
  «Semana N de M»— y le quitaba alto al héroe, que es el sujeto de la pantalla. Un
  icono en el cromo no le quita alto a nada. **Borrada**, no dejada muerta: solo la
  usaba `PlanView`.
- **El cumplimiento «Semana a semana»** de la v1 del ciclo, con `FilaSemanaDelCiclo`
  y su barra de porcentaje. Dos razones: es PASADO y esta pantalla responde adónde
  vas; y obligaba a pintar una barra sin listón, cuando dónde está el listón de una
  semana buena es MÉTODO del coach (HARD RULE Nº0). **Borrado**, junto con
  `RangoDeSemana`, que se quedaba huérfano.
- **La sección «La próxima semana»** (`FilaDiaProximo`). Esa pregunta ya la responde
  el carril del Plan deslizando a la izquierda — era el duplicado exacto que se
  arregló el 6-ago, reintroducido en otra pantalla. **Borrado.**

**El cable nuevo:** `GET /api/athlete/plan/ciclo` →
`{ camino: PlanPathDTO + por tramo { level, events[] } | null, al_acabar: "repeat" | null,
carrera: { name, date, goal_time_s } | null }`. El ciclo deja de leerse de
`/macro-progress` (que solo sabe de cumplimiento semanal) y pasa a su propia porción
cache-first en el store, calentada con la pestaña Plan.

- `level` y `events` son **aditivos** en `TramoDelPlan`: el mismo camino viaja dentro
  de una nota del coach y ese payload no los trae. En Swift van como `var` con
  defecto — un `let` con valor inicial se queda FUERA del decode sintetizado y nunca
  llegaría del cable.
- `al_acabar` se guarda **cruda** y se interpreta aparte. Hoy solo existe `repeat` en
  producción; cualquier otro valor se lee como «no se sabe» y el camino dibuja su
  hueco. **No hacer:** no inventar frases para valores del enum que aún no existen.

**La ley de la pantalla, que es la del doble:** la ESTRUCTURA está decidida y se
pinta con seguridad (qué etapas hay, cuánto duran, cómo las llamó el coach, dónde
cae hoy, qué está en el calendario, cuándo es la carrera); el RESULTADO MEDIDO del
futuro no se sabe. **No hacer:** ni una barra de carga, de volumen o de intensidad
prevista — las marcas de semana son POSICIÓN, no cantidad (todas miden lo mismo y
solo cambia la de hoy), y el objetivo de la carrera solo se escribe si el atleta se
lo puso.

**La espina sigue siendo UNA** (`Plan/Espina/EspinaDelPlan.swift`): se extiende de
forma aditiva (`forma` tramo/meta/hueco, `pasado`, `crece`, `contenido`, `etiqueta`)
en vez de que el ciclo se dibuje su propio raíl. **No hacer:** no volver a dibujar
una espina local por pantalla (misma regla que el 9-ago).

**Divergencia consciente respecto al doble:** el texto de una parada pasada baja a
`muted` y no al 45 % de su tono. El doble solo se ha mirado en oscuro; sobre lienzo
claro ese 45 % se queda muy por debajo de 4,5:1 y el rótulo de semanas deja de
leerse. Y el reparto vertical del sobrante es EQUITATIVO entre las paradas que
crecen, no 3:2:1:1 — SwiftUI no reparte por peso, y una implementación con
`GeometryReader` medía mal con contenido dinámico.

---

## 2026-08-11 (noche) · La carrera guarda su NEGATIVO: se persiste lo medido, se deriva lo demás

**Contexto:** análisis completo en `docs/correr-analitica.html`. Una carrera son
señal + troceado + intención. Teníamos la intención al nivel más alto del mercado
(veredicto por repetición contra la banda del coach) y la señal se descartaba al
terminar. `workout_traces`, su Zod y `POST /api/sync/workout-traces` existían y
funcionaban desde la 0156; **iOS nunca emitió una sola serie**. Decidido construir
el circuito entero (T0 archivo → T4 métricas propias); esta entrada fija el
contrato de T0. Los atletas corren **con nuestra app**, así que el emisor de iOS
es la pieza crítica y no la ingesta de terceros.

**Qué emite iOS**, tras recibir el `execution_id` del POST de ejecución:

| señal | fuente | se muestrea | unidad |
|---|---|---|---|
| `hr` | la del origen de pulso que ganó la precedencia | cada muestra del origen | bpm |
| `speed` | `gps` en calle, `treadmill` en cinta | cada fix válido / cada lectura FTMS | m/s |
| `distance` | ídem | ídem, acumulada | m |
| `altitude` | `gps` | ~1 Hz | m |

**NO se emite `pace`.** Se guarda lo medido —la velocidad— y el ritmo se deriva al
leer. El ritmo que se pinta en vivo es una media móvil de 10 s: guardarlo sería
guardar una interpretación y perder el negativo. Quien lee suaviza como necesite.

**NO se emite `cadence` ni `power` en carrera:** no hay fuente en el dispositivo
(el campo de cadencia lleva `nil` desde siempre y está documentado). El día que la
haya se añade una señal más y nada más cambia.

**El eje va en segundos enteros desde el inicio**, con cadencia variable a
propósito: un hueco es un hueco y tiene que verse. Jamás se rellena, porque
rellenarlo es fabricar dato — la regla que la 0156 ya dejó escrita.

**Tope de 20.000 puntos por señal.** Por encima se diezma uniformemente y se
declara; nunca se recorta el final, que es como se pierden los últimos kilómetros
de una tirada larga.

**La traza sobrevive al modo avión.** El buffer se persiste en disco con el estado
de la sesión. Si el POST de ejecución se encola por falta de red, la traza espera
y sube cuando el encolado consigue su `execution_id`. Una carrera terminada sin
cobertura no pierde su archivo.

**Los kilómetros NO se guardan: se derivan.** Una fuente, N proyecciones. El corte
por kilómetro, la curva, el reparto de zonas y los mejores esfuerzos salen todos
del mismo hilo. Persistirlos sería denormalizar algo que la señal ya contiene, y
obligaría a rehacer filas cada vez que mejore el algoritmo. Además, así una sesión
antigua sin traza **no tiene** splits en vez de tener splits inventados.

**Lo que sí se guarda ya calculado:** deriva aeróbica y desnivel acumulado, porque
exigen recorrer la traza entera y la traza no cambia nunca. Es la misma regla que
el esquema de la 0154 ya había escrito para `decoupling_pct`.

**Qué NO hacer en consecuencia:**

- No añadir una tabla de splits por kilómetro. Si aparece una, es que alguien no
  leyó esto.
- No emitir `pace` desde el cliente ni «por si acaso»: dos fuentes para el mismo
  hecho es cómo coach y atleta acaban leyendo números distintos.
- No rellenar huecos del eje para tener cadencia fija.
- No inventar traza para sesiones anteriores a esta tanda. Degradan diciendo la
  verdad, que es la cultura que este código ya tiene.

**Y una asimetría que se cierra aquí:** `SegmentActualDTO` tenía `ergSplits` y nada
equivalente para correr, así que un 6×800 se abría en seis filas al terminar y
volvía a ser UNA en el historial, mientras el remo conservaba su tabla. Los datos
ya estaban en `segment_executions` con su `leg_index`/`leg_role`/`leg_phase`; lo
único que faltaba era el contrato.

---

## 2026-08-11 (noche) · Una repetición es una excursión de ida y vuelta, no un pico periódico — y contar exige CONTEXTO, no solo señal

**Decidido:** el conteo de repeticiones en vivo y la velocidad por repetición se
rehacen sobre `ios/FAHYBRIK/Sensor/RepTracker.swift`. Se **borran**
`RepCounter.swift` (conteo por autocorrelación + picos) y
`BarVelocityEstimator.swift` (velocidad por semiciclos de una ventana móvil). El
archivo de captura sube a **formato v2** para llevar la **gravedad** en cada
muestra (9 canales: aceleración, giro, gravedad).

**Por qué — medido, no opinado.** Con señal sintética de tres ejes (trayectoria de
la muñeca + orientación del reloj → aceleración y gravedad en el marco del
dispositivo, que es lo que da CoreMotion), el mecanismo anterior daba:

| caso | verdad | mecanismo anterior |
|---|---|---|
| andar 20 s hacia la barra | 0 reps | **8 reps, confianza 0,90, nivel «contado»** |
| back squat 6× a 4,5 s | 6 reps | **3** (el tope de periodo era 3,5 s) |
| velocidad de ese squat | 0,22 m/s · 0,50 m | 0,14 m/s · 0,35 m y **13 velocidades para 6 reps** |
| wall balls 10× a 1,2 s | 10 reps | 10 ✓ |

Estaba afinado para wall balls y solo para eso. Y el fallo de fondo no era el
umbral: era el **método**. Cualquier movimiento rítmico de muñeca es periódico, así
que un detector por periodicidad no puede distinguir una serie de andar. Lo que
distingue una repetición es la **geometría** (sale y vuelve, con amplitud, y en
vertical) y el **contexto** (hay una serie abierta).

**El modelo, una vez y para todas las familias:**

- **Excursión de ida y vuelta**, con dos observables de la misma forma:
  **traslación** (metros sobre el eje vertical del mundo) para todo lo que viaja
  con la carga — squat, banca, peso muerto, press, jalón, curl, swing, wall ball,
  thruster, zancada — y **orientación** (grados que gira el antebrazo) para lo que
  NO viaja porque las manos están fijas y lo que se mueve es el cuerpo: dominadas,
  fondos, flexiones. Puerta que las separa: si la muñeca viajó durante el giro,
  manda la traslación (un curl gira 70° *y* viaja 35 cm, y solo la traslación trae
  velocidad).
- **La gravedad es obligatoria.** Sin ella no hay eje vertical y el «eje dominante»
  de una muñeca andando es el balanceo del brazo. Una muestra sin gravedad
  (archivos v1) **no cuenta**: se declara «no lo sé».
- **Las amplitudes salen de la curva de posición del ciclo entero**, no del punto
  exacto donde cruzó el cero. Los cruces *proponen* el ciclo; la curva decide dónde
  están el fondo y el bloqueo (mayor bajada y mayor subida). La velocidad se fuerza
  a cero en los dos extremos de cada tramo (tendencia quitada) — los dos anclajes
  por repetición que pedía el plan.
- **Cada repetición se emite UNA vez, al cerrarse, y no se revisa.** De ahí sale
  «una velocidad por repetición»: si el número cambia es porque hay otra
  repetición, no porque el estimador se lo repensó a mitad de recorrido.

**Lo que NO se entrega:** excursiones **horizontales** (remo sentado, aperturas,
empuje horizontal). A esa altura la señal de un remo sentado y la de un brazo
balanceándose son la misma, y entregar un número con aplomo ahí es el único error
que el plan declara inaceptable. Eso lo resolverá el clasificador (fase 4, necesita
corpus). Isométricos y carries dan cero, que es la respuesta correcta.

**El contexto, que era el agujero grande:** `openWindow`/`closeWindow` existían y
**no tenían ni un llamante** — el contador corría durante todo el entreno, también
mientras el atleta andaba, se colocaba o descansaba. Ahora la serie abierta la
define UNA función del motor (`WorkoutSession.sensorWindow`), que el reloj lee
directamente en solitario y recibe en el frame (`MirrorSensorWindow`) en espejo. Al
cambiar de serie el contador vuelve a cero. Efecto colateral bueno: el archivo de
la fase 0 por fin se sella con sus ventanas etiquetadas.

**Qué NO hacer en consecuencia:**

- **No** volver a defenderse de un contador malo en el teléfono. Se retiran el
  «+1 por paquete» (dejaba la cuenta por detrás para siempre si se perdía un
  paquete) y el **techo del plan** (congelaba la serie entera en cuanto un número
  inflado lo pasaba: eso era el «no me cuenta las reps»). El número de la muñeca es
  absoluto para la serie abierta; lo único que se respeta es que si el atleta ha
  tocado la cuenta, el sensor no la pisa.
- **No** sembrar el sesgo del acelerómetro con la primera muestra: si cae en un pico
  mete varios m/s de velocidad falsa que no se van, el signo se queda fijo y no hay
  ni un cruce por cero (síntoma: cero repeticiones). El sesgo se aprende **despacio
  y solo con la muñeca quieta**, y la velocidad integrada se centra con un filtro.
- **No** aprender el sesgo rápido: el punto de giro de una repetición lenta también
  parece reposo, y se come el gesto.
- **No** contar repeticiones de muñeca en correr ni en ergo (`run/row/ski/bike`): en
  ergo la verdad la da el PM5. Modalidad desconocida SÍ cuenta — la ventana ya
  restringe a una serie abierta, y callarse ahí dejaría el entreno libre sin contador.
- Los umbrales del contador son **método con defecto** (`RepTracker.Tuning`), no
  constantes: `coach_movement_policy` (mig. 0177) los pisa por movimiento.

**Pendiente y declarado:** todo esto está validado contra señal sintética con
física, no contra vídeo. La aceptación del plan (±1 rep en el 90 % de las series;
correlación >0,90 en velocidad hasta el 80 % del 1RM) sigue exigiendo medir en el
gimnasio. Y una muñeca dando vueltas DENTRO de una serie abierta sigue pudiendo
sumar: la defensa es que el atleta corrige, y esa corrección es la etiqueta de oro
de la fase 6.

---

## 2026-08-11 (noche) · La foto de una persona vive en Cloudflare Images, y lo que se guarda es la BASE, no un tamaño

**Decidido:** `coaches.avatar_url` y el nuevo `athletes.avatar_url` (migración 0179)
guardan UN texto: la base de entrega de Cloudflare Images,
`https://imagedelivery.net/<cuenta>/<imagen>`, **sin variante**. El tamaño lo pide quien
pinta, por NOMBRE de variante.

**Por qué mudarse de Vercel Blob, que no es el disco:** son las variantes. Con Blob se
servía el ORIGINAL —hasta 4 MB— dentro de un círculo de 32 px; con cien atletas en un
listado eso son cien originales por carga. Images entrega el tamaño pedido en el formato
que soporte ese navegador, desde su red, y sin pasar por nuestro cómputo.

**Por qué la base y no la URL final,** que es la decisión de verdad: la MISMA foto se
pinta en un círculo de 28 px del roster y en el retrato de una ficha. Si la columna
guardara ya el tamaño, cada vista tendría que reescribir la URL de otro, que es la clase
de número suelto repartido por los componentes que hace imposible cambiar de idea
después. Las variantes son **dos y tienen nombre** (`avatar160` para listados,
`avatar480` para retratos), viven en `web/lib/profile/photo-source.ts` y las crea en
Cloudflare `infra/scripts/cloudflare-image-variants.ts` **leyendo esas mismas
constantes**: el nombre que usa el código y el que existe en la cuenta no pueden
separarse porque salen del mismo sitio. Las dos recortan a cuadrado (`cover`) y tiran los
metadatos (`metadata: none`) — una foto de gimnasio sale del móvil con GPS dentro.

**Quién sube qué, y no es una regla de permisos:** el entrenador sube LA SUYA desde el
panel con su sesión; el atleta sube LA SUYA desde iOS con su bearer. **Un entrenador
nunca sube la foto de un atleta**, porque la foto la elige quien sale en ella. Por eso el
principal no viaja en el cuerpo de ninguna petición: se resuelve de la credencial
(`web/lib/profile/photo-principal.ts`), y el bearer manda sobre la cookie del panel
cuando viene, para que una credencial explícita inválida sea un «no» y no una caída
silenciosa a otra identidad.

**Tres rutas finas sobre un módulo, misma forma que Stream:**

- `POST /api/perfil/foto/subida` → `{ upload_url, image_id, expires_at }`. Valida el
  formato ANTES de dar dirección (un PDF recibe la negativa en el acto) y anota el dueño
  EN la imagen (`meta.owner = coach:<id> | athlete:<id>`), que es el censo sin tabla
  nuestra. Los bytes van DIRECTOS a Cloudflare.
- `POST /api/perfil/foto/confirmar` con `{ image_id }` → le PREGUNTA a Cloudflare si esa
  imagen existe y si la subió quien la reclama, lee la base de entrega **de la respuesta
  de Cloudflare** (nunca se construye aquí) y sólo entonces escribe la columna. Después
  borra la foto anterior. **Jamás se guarda la URL antes de que el fichero exista**: entre
  reservar y subir se puede cerrar la app, y una fila apuntando a una imagen que nadie
  subió no se distingue luego de una foto rota.
- `DELETE /api/perfil/foto` → primero deja de referenciarla, después la borra en
  Cloudflare. En ese orden: si el borrado remoto falla, sobra una imagen suelta, no queda
  una fila apuntando a algo que ya no está.

**A diferencia del vídeo NO hay ruta de estado**: una imagen subida se entrega ya, no hay
transcodificación que esperar. Por eso son dos pasos y no tres.

**Lo común a Cloudflare sube a `web/lib/cloudflare/api.ts`** (cuenta, credencial, el sobre
`{success,result,errors}`, el 503 honesto sin credenciales, el 502 cuando falla) y **Stream
lo usa también**: `video-stream.ts` se queda sólo con el camino `/stream`, y
`ExerciseVideoError` desaparece en favor de `CloudflareMediaError`. Su API responde
SIEMPRE 200 con el fallo dentro del cuerpo, así que desenvolverlo en un sitio evita que la
próxima integración se olvide de mirar `success`.

**Eliminado** (medido antes: **0 de 6 entrenadores tenían foto**, así que no se pierde
nada):

- `POST /api/coach/profile/avatar` — la subida multipart contra nuestra API y a Vercel
  Blob. Recibía los bytes en una función nuestra, justo lo que la decisión del 27-jul
  dice que no se hace;
- `avatar_url` del `coachProfileSchema` y su `update` en `updateCoachProfile`: la columna
  pasa a tener **un solo escritor**. Aceptarla también por el PATCH del perfil daría dos,
  y el de ese lado se creería cualquier URL que le mandaran;
- el `remotePatterns` de `*.public.blob.vercel-storage.com` en `next.config.ts`, que ya no
  tenía usuario. `@vercel/blob` SIGUE en uso para chat, comunicados, importaciones y
  capturas de sensor: lo que se va es el camino de la foto, no la dependencia.

**Qué NO hacer en consecuencia:**

- **No pedir el original desde una vista.** Si un sitio necesita otro tamaño, se añade una
  variante en `PROFILE_PHOTO_VARIANT_SPECS` y se corre el script — no se inventa una URL.
- **No pasar estas fotos por el optimizador de la plataforma.** Cloudflare ya entrega el
  tamaño y el formato buenos; `AthleteAvatar` las pinta `unoptimized` a propósito, y por
  eso `next.config.ts` se quedó sin `remotePatterns`.
- **No guardar el ancho, el alto ni el formato en una columna.** Eso lo resuelve la
  variante al entregar; guardarlo sería un dato que envejece solo.
- **No dejar que el cliente mande la URL.** Manda el `image_id`; el localizador se lee de
  Cloudflare. Si viajara desde fuera, la columna guardaría lo que alguien quisiera.
- **No comparar el dominio con «contiene».** `imagedelivery.net.ejemplo.com` no es
  Cloudflare: el host se compara ENTERO, igual que con el localizador del vídeo.

**En el DTO del atleta la foto sale YA LISTA PARA PINTAR** (`avatar_url` de
`/api/auth/me` y del PATCH del perfil lleva la variante `avatar480` pegada). La app la
mete en un círculo tal cual llega: darle la base sería darle una URL que no carga. Es la
asunción que la sesión de iOS dejó abierta el mismo día, y queda cerrada aquí.

**Hueco conocido, declarado:** si alguien reserva una subida y no confirma, la imagen
queda en Cloudflare sin que ninguna fila la referencie. No hay recolector de huérfanos y
hoy no hace falta; el `meta.owner` que se anota en cada imagen es por dónde se barre. Es
el mismo hueco, y el mismo remedio, que el del vídeo.

---

## 2026-08-11 (tarde) · El vídeo propio del entrenador vive en Cloudflare Stream, y el fichero nuestro se retira el mismo día

**Decidido:** la segunda forma del localizador deja de ser una ruta nuestra y pasa a
ser el **manifiesto HLS que devuelve Cloudflare Stream**:
`https://customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8`. Absoluto y
autodescriptivo. **Una sola columna**, sin tabla nueva, sin migración y sin esquemas
inventados tipo `stream:` — entra por la rama de URL absoluta que ya existía.

**Por qué:**

- Stream **transcodifica** lo que se le eche, así que un `.mov` en HEVC salido de un
  iPhone deja de ser una lotería de compatibilidad en el móvil del atleta.
- Sirve **calidad adaptativa por HLS**, que es lo que hace falta cuando el atleta mira
  la técnica en medio del gimnasio con la cobertura que haya.
- Los **bytes no pasan por nuestro cómputo** ni al subir ni al reproducir. Ese era el
  cuello de botella real para escalar a muchos entrenadores: con el proxy autenticado,
  cada reproducción de cada atleta se pagaba en función nuestra.

**Cómo, en concreto:**

- **Subida directa, igual que antes**: `POST /api/coach/exercises/video/subida` valida
  la intención (coach, ejercicio suyo o forkeable, formato) y pide a Stream una URL de
  subida de un solo uso; el navegador hace `POST` del fichero DIRECTO a Cloudflare.
  `maxDurationSeconds` = 5 min (`EXERCISE_VIDEO_MAX_DURATION_SECONDS`), que es la
  regla que manda sobre el tamaño porque va firmada en la reserva y la aplica
  Cloudflare. El tope de bytes sigue siendo el del vídeo del chat y es sólo un corte
  amable en el navegador: los bytes no pasan por nosotros, así que «validarlos» en
  servidor sería teatro.
- **Hay que ESPERAR**: `GET /api/coach/exercises/video/estado?uid=` sondea hasta
  `readyToStream`. Un vídeo recién subido NO se reproduce, y dar por bueno el
  localizador al terminar el `PUT` sería prometer un vídeo que el atleta vería en
  negro. El panel lo cuenta con cuatro estados honestos: subiendo, procesando, listo,
  error con motivo. **Sólo cuando está listo se escribe el localizador en el campo.**
- **`requireSignedURLs: false`** por ahora, y dicho en el código: el uid son 32
  hexadecimales que no se adivinan, o sea la MISMA exposición que un vídeo de YouTube
  no listado, que es lo que los entrenadores usan hoy. La reproducción firmada es un
  interruptor **por vídeo** que se voltea por API sin tocar el localizador ni migrar
  nada: no es una puerta que estemos cerrando.
- **Reproducción**: en web, el iframe de Stream (`.../<uid>/iframe`) con la misma forma
  que el embed de YouTube; en iOS, `AVPlayer` sobre el HLS, que lo hace de forma
  NATIVA y **sin bearer** (la URL es absoluta y pública).

**Eliminado el mismo día en que nació** (medido antes de borrar: `propios = 0` en
`exercises` y en `coach_exercise_overrides`; los 3 `video_url` que había son enlaces de
YouTube):

- `web/lib/exercises/video-upload.ts` (la prefirma contra Vercel Blob),
- `POST /api/coach/exercises/video-url`,
- `GET /api/exercises/video/[...key]` (el proxy autenticado de lectura),
- y en iOS, `VideoDeTecnica.propio` + `VideoPropioPlayer`, que bajaban el fichero
  entero con el bearer reutilizando el cargador del chat.

Dejar los dos caminos vivos habría sido exactamente lo que no queremos: dos maneras de
hacer lo mismo, divergiendo. Lo que había servido durante horas y no lo usaba nadie.

**Los FORMATOS aceptados cambian de criterio, y no por capricho.** Eran los del vídeo
del chat (mp4/mov/m4v) porque la regla era «lo que decodifica el móvil del atleta» —
cierto cuando le servíamos el fichero tal cual. Con Stream transcodificando eso dejó de
ser verdad, así que la lista pasa a ser **la que Stream ingiere** y vive en
`video-source.ts`. Mantener la lista corta habría sido dejar puesta una validación cuya
razón de ser ya no existe, rechazándole al entrenador ficheros que Stream acepta sin
problema.

**Qué NO hacer en consecuencia:**

- **No volver a recibir los bytes de un vídeo en una ruta nuestra**, ni al subir ni al
  leer. Sigue valiendo la decisión del 27-jul, y ahora también para la lectura.
- **No atar la validación al customer code de NUESTRA cuenta.** `video-source.ts` es
  isomórfico y corre en el navegador: meter ahí configuración de servidor la rompería
  el día que cambie la cuenta. Lo que hay que cerrar —que no apunte a un dominio
  ajeno— se cierra comparando el host ENTERO (prefijo + sufijo), nunca con `contains`.
- **No guardar la orientación ni el tipo en una columna.** El tipo se deriva de la
  forma del localizador, como siempre. La verticalidad no viaja en una URL de Stream
  (a diferencia del `/shorts/` de YouTube): en web el marco es 16:9 y el reproductor de
  Cloudflare centra, y en iOS se lee la relación REAL del `presentationSize` del propio
  reproductor.

**Hueco conocido, declarado:** si el entrenador sube un vídeo y cierra el panel sin
guardar, el vídeo queda en Stream sin que ninguna fila lo referencie. No hay recolector
de huérfanos y hoy no hace falta; el día que moleste, el `creator` (`coach:<id>`) que ya
se anota en cada vídeo es por dónde se barre.

---

## 2026-08-11 · El vídeo de un ejercicio: dos formas de localizador, una sola pieza que clasifica

> **SUPERADA EN PARTE ESA MISMA TARDE** (ver la entrada de arriba): sigue siendo verdad
> que hay **dos formas y una sola pieza que clasifica**, pero la segunda ya no es una
> ruta nuestra servida tras autenticación, sino el vídeo alojado en Cloudflare Stream.
> Todo lo que dice esta entrada sobre el fichero propio en Vercel Blob (la prefirma, el
> proxy de lectura, la carpeta por coach) está **eliminado**.

**Decidido:** `exercise_video_url` (y sus gemelos `technique_video_url` y
`WorkoutSegment.videoUrl`) tiene **exactamente dos formas válidas**:

1. una **URL de YouTube** — se reproduce con el embed que ya existe;
2. una **ruta relativa nuestra**, `/api/exercises/video/<key>` — el fichero que
   sube el propio entrenador, servido tras autenticación, y que iOS reproduce
   con `AVPlayer` nativo pidiéndolo con el bearer de la sesión.

Cualquier otra cosa (un enlace a otro alojamiento, texto suelto, vacío) **no es
vídeo**: no se pinta nada, ni botón ni reproductor.

**Por qué:** el mecanismo es nuestro, el contenido es del coach (HARD RULE Nº0).
Obligar a que la técnica viva en YouTube es imponerle a cada entrenador dónde
alojar SU material — y muchos no quieren su biblioteca en abierto. Que pueda
subir el fichero es producto, no capricho.

**Qué NO hacer en consecuencia:**

- **No volver a preguntar «¿esto tiene vídeo?» mirando la URL en una vista.** La
  pregunta la responde `VideoDeTecnica` (`ios/FAHYBRIK/Media/YouTubeEmbedView.swift`)
  y nadie más. Ese fue el fallo original: `YouTubeLinkParser.videoId(from:) != nil`
  repetido en cinco vistas, así que añadir una segunda forma de vídeo las rompía
  todas a la vez y en silencio.
- **No cablear la ruta concreta** `/api/exercises/video/`. El criterio es «es una
  ruta relativa», que solo puede apuntar a nuestro propio servidor; así el día que
  el backend sirva el fichero por otro camino esto sigue siendo verdad.
- **No usar `AVPlayer(url:)` a pelo** contra un endpoint nuestro: va sin cabecera
  de autorización y vuelve 401. Se resuelve a fichero local con el bearer.

**Eliminado:** `YouTubeLinkParser.videoId(from:)` y `Video.isShort`, que se
quedaron sin llamantes. `YouTubeSheet` pasa a ser `VideoDeTecnicaSheet` y sirve
las dos formas con la misma chapa (título, «Cerrar», y en el entreno en vivo la
misma pausa del cronómetro).

**El lado servidor, cerrado el mismo día** (ya no queda pendiente):

- **UNA validación para las dos formas:** `exerciseVideoSchema`
  (`web/lib/exercises/video-source.ts`). La aplican `POST /api/exercises`,
  `PATCH /api/exercises/[id]` y el campo del panel, así que «lo puedo guardar» y «el
  campo está en rojo» no pueden decir cosas distintas. **Eliminado:**
  `youtubeUrlSchema` de `shared/youtube.ts` — rechazaba todo lo que no fuera YouTube
  y dejarlo vivo sería dejar puesta la validación equivocada esperando a que alguien
  la volviera a enchufar. `shared/youtube.ts` sigue siendo sobre YouTube y es la
  mitad de la nueva.
- **Los bytes no pasan por una ruta nuestra** (decisión del 27-jul): se valida la
  intención en `POST /api/coach/exercises/video-url` (coach, ejercicio suyo o
  forkeable por él, formato y tamaño) y el cliente hace `PUT` contra la URL
  prefirmada. Formatos y tope NO son números nuevos: son los del vídeo del chat
  (`CHAT_ATTACHMENT_EXTENSIONS.video` = mp4/mov/m4v, `CHAT_ATTACHMENT_MAX_BYTES.video`
  = 200 MB), porque la regla es la misma —lo que reproduce el móvil del atleta— y dos
  listas acabarían divergiendo.
- **El dueño del fichero es el COACH** (`ejercicios/<coach_id>/<yyyy>/<mm>/<uuid>.<ext>`),
  como el audio de un comunicado y no como un adjunto del chat: un vídeo de técnica es
  catálogo, se lo ven todos sus atletas y existe antes de tener destinatario.
- **La lectura autoriza por CARPETA, no por «hay un ejercicio que apunte aquí»:**
  `GET /api/exercises/video/[...key]` sirve al coach dueño y a los atletas de ese
  coach. Preguntar a la base rompería justo el caso del alta, donde el vídeo se sube
  ANTES de que el ejercicio exista y el coach tiene que ver lo que acaba de subir.

---

## 2026-08-11 · Biometría de la ficha = Whoop/Oura para el coach (no dump de reloj)

**Decidido:** la pestaña **Biometría** de la ficha del atleta se diseña y se mide
contra el estándar de experiencia de **Whoop Recovery / Oura Readiness**,
adaptado a **vista coach** (no a app del atleta):

1. **Veredicto primero** (puede cargar / mantener / descargar / sin señales) —
   no una parrilla de tiles sueltos.
2. **Cada métrica se lee contra la baseline del propio atleta** (VFC 28d, RHR
   30d), nunca como número absoluto huérfano.
3. **Agudo (anoche / hoy) → crónico (28d) → fitness lento (VO₂, peso)** —
   jerarquía de atención.
4. **Objetivo + subjetivo juntos** (señales de reloj + check-in «cómo se
   encuentra»): si divergen, el coach lo ve en el mismo sitio.
5. **Circular:** un estado malo ofrece camino al Plan / ajustar carga; no un
   muro de «considera…».

**Qué NO es:** copiar la UI de Whoop píxel a píxel, ni inventar scores de
marca (stress SpO₂ temperature) multi-reloj. El *comportamiento* de producto
(estado → tendencia → acción) es el listón; los datos salen de `BodyPayload` +
check-in ya existentes.

**En consecuencia:** no añadir tiles de vanity (RMSSD/SDNN sueltos) sin
contexto de baseline; no pintar carga A:C aquí hasta que el load del plan sea
el mismo motor que Rendimiento.

---

## 2026-08-11 · El vídeo de un movimiento tiene UN solo sitio (el ejercicio), y se ve dentro del panel

**Lo que había:** el coach podía pegar la URL de un vídeo de técnica, pero no podía verlo en
ninguna parte del panel — se abría en otra pestaña. Y el reproductor ya estaba construido
(`components/media/YouTubeEmbed` + `VideoUrlField`, de mayo/junio): CERO importadores en todo el
repo. Código escrito, correcto y nunca montado.

Encima había DOS campos de vídeo distintos para lo mismo, cada uno con su validación y su copy:
`YouTubeField` + `videoFieldState` en `components/v2/editor/exercise-catalog.tsx` (hojas del
ExercisePicker) y un `input type=url` a mano en `biblioteca/EjercicioEditor.tsx`.

**Decidido:**

- **UN campo de vídeo en todo el panel**: `components/media/VideoUrlField`, montado en las tres
  superficies (editor de la Biblioteca, crear desde el picker, editar desde el picker). Valida con
  `shared/youtube.ts`, que es lo mismo que aplica el servidor al guardar (`youtubeUrlSchema` en
  create/update-exercise), así que "puedo guardar" y "el campo está en rojo" no pueden discrepar.
- **Heredar es parte del campo, no del que lo llama.** Un ejercicio de la base trae su vídeo; el
  campo enseña y REPRODUCE el heredado mientras el coach no ponga el suyo, y pone el verbo solo
  (Restaurar si hay base a la que volver, Quitar si no). Antes el vídeo de la base era un enlace a
  otra pestaña en una superficie e invisible en la otra.
- **La forma del vídeo la dice el enlace**: un Short se pinta 9:16 y un vídeo normal 16:9
  (`parseYouTubeLink.isShort`), igual que ya hacía el reproductor de iOS.

**Eliminado (lo que importa que quede escrito):**

- **`templates.demo_video_url`** (columna de la mig 0013) sale de `templateSchema` y de
  `templateUpsertSchema` (`shared/schema/templates.ts`) y de `TemplateBuilderInitialState`
  (`web/components/templates/template-types.ts`). Ninguna ruta del panel la escribía ni la leía.
- **`video_url` dentro de `template_segments.params_json`** sale de `segmentParamsSchema`. Se
  declaró como "pisa al vídeo del catálogo" y nunca tuvo un solo escritor.
- **`YouTubeField` / `videoFieldState` / `VideoState`** salen de `exercise-catalog.tsx`.

**La columna SIGUE EN LA BASE.** No se ha escrito ninguna migración: soltarla es decisión de Alex.
Lo único que la sigue nombrando es la copia de columnas del fork por atleta
(`web/lib/dashboard/coach/template-instance.ts`, espejo de la mig 0083); si se decide soltarla, esa
lista cambia en el mismo commit que la migración.

**NO hacer en consecuencia:** no volver a declarar un vídeo por plantilla ni por segmento. Un
movimiento tiene su vídeo en `exercises.video_url` más el override por coach de la 0132, y ya está:
dos sitios para el mismo dato es la forma de que el atleta acabe viendo el que no toca.

---

## 2026-08-11 · Los ejercicios tienen su propio eje de CONTENIDO; el de estado sigue siendo solo de Bloques

**El hueco:** en la Biblioteca no había forma de ver a qué ejercicios les falta contenido. La única
señal de "tiene vídeo" vivía en el `ExercisePicker` (icono `play_circle`), o sea en el sitio donde
el coach está montando una sesión y no en el sitio donde arregla su catálogo.

**Decidido:** un eje NUEVO y SUYO, declarado como dato en `lib/dashboard/v2/biblioteca-axes.ts`
junto al resto (`LIB_EXERCISE_GAPS`, `EXERCISE_CONTENT_SLOTS`, `exerciseHasGap`), no un
ensanchamiento del eje de estado de Bloques (`sin_tipar` / `sin_dosis` / `listo`): un movimiento no
se tipa ni lleva dosis, y un bloque no tiene vídeo.

El contenido de un ejercicio son **tres casillas** (claves, descripción, vídeo: los campos
forkeables de la 0132 menos el nombre, que nunca falta porque es NOT NULL), y de ahí salen los tres
huecos por los que se filtra: **sin vídeo** (lo que mira), **sin explicación** (lo que lee, o sea
ni claves ni descripción) y **sin nada**. Son PREDICADOS y no una partición — "sin nada" es el
subconjunto de los otros dos — así que sus cuentas se solapan a propósito y no suman el total.

Las cuentas van sobre el catálogo ENTERO y no sobre lo filtrado, misma regla que el eje de estado
de Bloques: dicen cuánto trabajo queda, no cuánto queda en esta vista.

**NO hacer en consecuencia:** no meter estados de ejercicio en `V2LibReadiness` ni al revés, y no
declarar el siguiente eje dentro de su componente — todos los de la Biblioteca viven en
`biblioteca-axes.ts` para que el siguiente los encuentre.

---

## 2026-08-11 · El alta no impone la periodización: `plan_mode` es dato del coach

**El hueco:** dar de alta a un atleta obligaba a pasar por la matriz nivel×días. El paso
«Estructura del bloque» pintaba una secuencia propuesta sin poder renombrarla, ampliarla ni
recortarla, y el commit del alta nunca mandaba plantilla concreta, así que siempre caía en
«primer microciclo desde la biblioteca del coach». Para llevar a alguien en plan propio había que
darlo de alta en la periodización y desengancharlo después desde su ficha.

**Lo que ya estaba bien:** el servidor era agnóstico desde la 0064 — su propio comentario dice que
el alta no auto-planifica un macrociclo y que la forma de periodización se guarda como DATO. Quien
imponía la matriz era la pantalla, no el modelo.

**Decidido:** el alta lleva un `plan_mode` (`shared` | `personal`) que es **dato del coach**, no
una constante nuestra.
- `shared`: idéntico a antes.
- `personal`: se crean N contenedores del atleta, encadenados sin hueco desde el lunes de la
  semana en curso, en borrador privado, y **no se asigna nada de la biblioteca**. Los nombres de
  los tramos los escribe el coach; el sistema no propone ninguna escuela de periodización.
- La clasificación nivel×días se guarda en los DOS modos: describe al atleta, no es un insumo de
  la matriz.

**Cómo, sin maquinaria nueva:** cada tramo entra por `addPersonalTramoToChain`, la misma función
que usa la ficha (materializa con fecha, desengancha la secuencia y audita dentro de la
transacción). Lo único añadido fue permitirle arrancar cuando todavía no hay cadena — un atleta
recién dado de alta no tiene ninguna, y antes respondía 409.

**NO hacer en consecuencia:** no volver a tratar «plan personal» como un fork posterior obligado;
nace en el alta si el coach quiere. Y no cablear nombres de fases en ningún camino de creación.

---

## 2026-08-11 · Un toque nunca borra trabajo escrito, y toda reescritura de un día deja rastro

**El fallo que lo obligó:** el fartlek de la asignación 411 —16 × (500 m Z4 / 1' trote Z2), escrito
correctamente por el conector— apareció convertido en 13 × (2' RPE 8 / 1' trote RPE 3). Contestar
«¿quién cambió esto?» costó una investigación entera entre dos sesiones, y la respuesta no estaba
en el registro porque no había registro: la escritura no dejaba ninguno.

**Las dos raíces, y las dos son de mecanismo:**

1. **Los chips de «Plantilla del principal» del editor de carrera SUSTITUYEN la fase principal**, y
   lo hacían de un toque, sin preguntar y sin vuelta atrás. El contenido guardado era literalmente
   el prefill del arquetipo «Fartlek» (`archetype-prefills.ts`). La línea rápida de al lado ya
   tenía el instinto correcto —solo pisa cuando el principal sigue en blanco—; los chips no lo
   seguían.
2. **Guardar un día del atleta borra los segmentos y los vuelve a insertar** —la escritura más
   destructiva del sistema— y era la única sin auditar, mientras el conector sí auditaba lo que
   tenía al lado. Esa asimetría es lo que alargó la investigación: había rastro de crear la sesión
   y ninguno de reescribirla.

**Decidido:**

- **Nada que destruya trabajo del coach ocurre con un solo toque.** Con el principal todavía en
  blanco la plantilla entra directa (no cuesta nada); si ya hay algo escrito, se pregunta antes.
  Misma regla para la × que quita una fase. Un único sitio decide qué cuenta como «escrito»
  (¿sigue siendo el cuerpo que sembramos nosotros?), así que las dos acciones no pueden divergir.
- **El rastro se pone donde pasan TODAS las superficies**, no en cada ruta: `updateAthleteInstanceDay`
  es por donde entran el editor del panel y `edit_day`/`create_session` del conector. El actor es
  **obligatorio**: un parámetro opcional habría dejado volver a la asimetría que se estaba cerrando.
  La entrada guarda atleta, fecha y cuántos segmentos quedaron.

**NO hacer en consecuencia:** no añadir otra ruta que escriba `template_segments` por su cuenta —
si aparece una superficie nueva, entra por el mismo escritor. Y no volver a poner un botón de un
toque que sustituya contenido autorado sin confirmación, aquí ni en los otros constructores.

**Nota de atribución:** la hipótesis inicial (que lo hubiera reescrito un servidor de desarrollo
apuntando a producción por el symlink de `.env.local`) resultó falsa — fue Alex probando el editor.
El footgun del symlink sigue siendo real y sigue en la lista; simplemente no fue esta vez.

---

## 2026-08-11 · La modalidad de una sesión se LEE de sus ejercicios; adivinarla del formato es mentir en texto

**El fallo:** la ficha del atleta rotulaba «Circuito» a un fartlek de carrera. La modalidad se
inferí­a de `templates.format` (`intervals` → circuito) y de expresiones regulares sobre el título,
con un comentario que decía que era «solo para el color» — pero ese rótulo se pinta como TEXTO en
la tarjeta de hoy. Contra el dato real de una semana: 3 de 7 sesiones mal rotuladas.

**Decidido:** la modalidad es intrínseca al ejercicio (mig 0053), así que la sesión no se adivina,
se lee — con la modalidad PRESCRITA ganando a la del catálogo, la misma precedencia que ya usaba el
brief del atleta. El colapso al eje de color de cinco valores va por reglas sin un solo umbral,
porque un umbral sería método del coach y esto es mecanismo: remo y ski son la misma cosa
(«Ergómetro»); el trabajo accesorio (core/movilidad) no define la sesión, solo manda cuando es lo
único que hay; y varias a la vez son **«Mixta»**, porque elegir una en una simulación HYROX sería
mentir. La heurística sigue viva únicamente para sesiones sin ejercicios que leer.

**NO hacer en consecuencia:** no volver a derivar modalidad de `templates.format` en una superficie
nueva, y no tratar «sin color» como «día de descanso» (la tira de la semana lo hacía; ahora eso lo
decide el estado del día).

---

## 2026-08-10 · Quién CONDUCE un tramo se decide una vez, y las pantallas leen eso — no el esquema

**El fallo que lo obligó:** el fartlek dictado por MCP (16 × 500 m Z4 + 1' suave en Z2,
asignación 411) pintaba bien la ficha y, al tocar EMPEZAR, dejaba la pantalla EN BLANCO:
una franja de «LO QUE VIENE», sin título y **sin botón de EMPEZAR**. El entreno no se
podía arrancar.

**La raíz:** el motor tiene la precedencia clara desde el #61 —estructura de carrera >
EMOM > rotativo (`WorkoutSession.onEnterSegment`)— pero la propiedad que leen las
PANTALLAS, `WorkoutSegment.isConditioningTimer`, sólo excluía el EMOM. Una serie de
correr con `structure` (cuyo esquema plano ES `intervals`/`steady`) seguía declarándose
«reloj de acondicionamiento», así que `ActiveWorkoutView` le montaba debajo un
`ForTimeLiveHUD` con sus 16 filas de ronda sin recortar: ~2.600 pt en una pantalla de
874. El `ZStack` del entreno creció con él y la puerta del bloque —hermana suya en ese
mismo `ZStack`— quedó centrada en un alto imposible: título fuera por arriba, EMPEZAR
fuera por abajo.

**Decidido:** la precedencia de motores se escribe UNA vez y es la que leen las
pantallas. `isConditioningTimer` excluye la carrera con estructura igual que ya excluía
el EMOM, y `superficieViva` resuelve un tramo de correr DENTRO de su propia rama (o una
de las dos pantallas de correr, o ninguna superficie) en vez de dejarlo caer por la
cadena hasta el formato de otro.

**En consecuencia, no hacer:** no arreglarlo en la vista de turno (la puerta del bloque
era el síntoma, no la causa: el mismo agujero pintaba un For Time debajo de cualquier
carrera estructurada); no dar por sentado que una lista de rondas cabe en la pantalla
—sigue abierto que un metcon REAL de 16 rondas que nadie mide revienta igual el alto
(`StrikeList` no recorta ni scrollea, y la ranura del vivo no scrollea en vertical por
el ancla del sujeto del §10.3): es decisión de UX, no de código.

---

## 2026-08-10 · Una recuperación que se CORRE no se llama «descanso»

**Decidido:** cuando hay `structure`, la línea de dosis se cuenta desde la estructura y
la recuperación se dice como se hace: «recuperación 1:00 suave en Z2» (`suave` /
`caminando` salen de `RunLegDisplay.recoveryModeWord`, la misma palabra que dicen el
vivo y la muñeca). Se dice «descanso» exactamente en dos casos: modo `parado`, y modo
NO DECLARADO — que es lo que llega de una prescripción plana, donde el número nació de
un `rest_s` y «descanso» es literalmente lo que el coach escribió.

**Por qué:** el aplanado (un set + un `rest_s`) miente dos veces sobre un fartlek —
pierde el ×16 (un 16×500 se leía «500 m») y llama «descanso» a un minuto que se corre.
Un atleta que lee «descanso» se queda parado, y el fartlek pierde el sentido. La
estructura sabe las dos cosas.

**En consecuencia, no hacer:** no escribir la dosis dos veces (el titular sale de UN
formateador, `PrescriptionRenderer.summaryLine`, que es el que ya leen la previa, la
puerta, la ficha del ejercicio, el espejo del reloj y el resumen de carrera); no
resumir lo que no es uniforme (objetivos o recuperaciones distintas entre tramos NO se
colapsan a la primera — §7); no colapsar una pirámide a su primer tramo, y escribir su
secuencia en METROS con la unidad una vez («1200/1000/800 m»), porque
`Formato.distancia` pasa a km a partir de 1.000 y «1,2 km/1 km/800 m» no se compara.

---

## 2026-08-11 · La biblioteca de ejercicios: dos idiomas por PERSONA, el vocabulario como DATO, y los ejes que faltaban

**El estado medido antes de tocar nada:** 126 ejercicios (121 base + 5 propios), **121
con el nombre solo en inglés** y 5 en castellano, **0 vídeos**, 16 con cues, 68 con
descripción, **56 que nadie ha usado nunca** y 0 sinónimos aprendidos. (Corrección a
una lectura previa: las 8 posiciones de HYROX **sí** están completas — ski y remo
llevan la suya desde `cardio`, que es correcto porque son ergómetros. Lo que estaba
mal era otra cosa: un ejercicio metido en `category='hyrox_station'` **sin** posición,
y una bici con `modality='run'`. Los dos arreglados en 0178.)

**Decidido (mig 0172 aplicada):**

- **El idioma se resuelve por PERSONA, no por catálogo.** `exercises.name_es` +
  `name_en` (dos columnas explícitas, no un blob i18n), y quien mira decide: el coach
  con `users.idioma`, el atleta con `athletes.preferred_language` — las dos columnas
  ya existían. `name` NO se toca: sigue siendo el nombre de siempre y el último
  recurso del resolutor, así que ninguna lectura de hoy se rompe. El fork de voz del
  coach (`coach_exercise_overrides`, 0132) también gana los dos idiomas: puede
  rellenar uno o ambos, y lo que no diga cae al base.
- **El vocabulario base es DATO, no código:** tabla `exercise_aliases` (término +
  normalizado + idioma). Hoy ese conocimiento vive cableado en TypeScript
  (`GLOBAL_ALIASES`, 101 entradas en `web/lib/import/exercise-resolve.ts`, espejo de
  `infra/scripts/parse_blocks_lib.ts`): **lo usa el importador y no lo usa el
  buscador**, el mismo saber sirviendo a una superficie y no a la otra. Con la tabla,
  una sola fuente alimenta las dos.
- **Dos capas de alias con precedencia clara:** `coach_exercise_synonyms` (0109, por
  coach, aprendida de sus correcciones) **manda** sobre `exercise_aliases` (nuestra,
  base). Al revés le quitaríamos al coach lo que ya le enseñamos a la app.
- **Un término AMBIGUO es dato, no error.** «row» es el ergómetro y el remo con barra;
  la unicidad del alias es por `(ejercicio, término)` y NO global — al contrario que el
  mapa de TS, que siendo `Record<term, slug>` hacía imposible expresar la ambigüedad y
  se comía una de las dos. Cuando un término resuelve a varios: desempata la modalidad
  del bloque, y si no cierra es un fallo honesto que va al coach, cuya elección se
  aprende como sinónimo suyo y no vuelve a preguntar.
- **`movement_pattern` es MECANISMO, no método** (CHECK cerrado, como `modality` en
  0053): que una búlgara sea una zancada unilateral es biomecánica, no criterio de
  escuela — la pregunta de la HARD RULE Nº0 («¿otro entrenador competente lo haría
  distinto?») responde no. Es además el eje por el que un entrenador pide de verdad un
  ejercicio («una bisagra de cadera»), y el que hace navegable una lista de 500.
- **`is_unilateral` e `implement_count` cambian la DOSIS**, no son adorno de ficha: un
  unilateral se prescribe por lado y un farmers son 2×32 kg, no 32. El `Target` ya
  sabía contar implementos; el ejercicio no declaraba venir en par.
- **`archived_at`:** retirar sin borrar. Hoy solo se puede borrar, y solo lo nunca
  usado (con razón: `segment_executions` es ON DELETE SET NULL y un borrado silencioso
  desnuda trabajo ya hecho). Un catálogo que crece necesita la tercera vía.
- **Búsqueda:** `pg_trgm` + `fahybrid_normalize_term()` (minúsculas, sin acentos,
  espacios colapsados) con función Y diccionario **cualificados a `public`** — sin eso
  la resolución depende del `search_path` de quien ejecute, y un índice no puede
  depender de eso (los dos primeros intentos de la migración murieron ahí).

**En consecuencia, no hacer:** no meter contenido masivo antes del cimiento (500
ejercicios sobre dos ejes empeoran la lista, no la mejoran); no convertir
`movement_pattern` en dato editable del coach; no dar por hecho el trigram sin
comprobar la extensión; no dejar que el alias base pise el sinónimo del coach; y no
volver a duplicar vocabulario en código cuando ya vive en la tabla.

---

## 2026-08-11 · `MarcoVivo` no tiene NI UNA llamada: el régimen §10 del vivo no tiene host

**Constatado** verificando el porte del contador de rondas: `MarcoVivo(` no aparece
invocado en ningún sitio del repo. Es el componente que inyecta `\.lienzoVivo`, del que
depende `Numeral` para escalar al tamaño del §10.2 — así que **toda pantalla del vivo
está fuera del régimen que la doctrina describe**: los numerales caen a su tamaño por
defecto (~54 pt en vez de ~125) y cualquier presupuesto de alto derivado del marco es
teórico, no el que se pinta. Por eso el contador acabó con un `.system(size:96)` a mano
y por eso su cascada no tenía cota real hasta que se le dio una con `GeometryReader`.

**En consecuencia, no hacer:** no citar §10 como si estuviera vigente en pantallas que
no montan `MarcoVivo`; no cambiar un tamaño «al del §10» sin comprobar quién inyecta el
lienzo; y al tocar el vivo, decidir explícitamente si esa pantalla adopta el marco o
declara su propio presupuesto — pero no las dos a medias.

---

## 2026-08-11 · El vivo tiene UN lenguaje — el de `vivo-rondas` — y le falta su HOST real

**Decidido (directiva de Alex, 11-ago: «tener diseños perdidos por la app es horrible;
traslada este vivo-rondas a otros»):** el lenguaje de `vivo-rondas` (cromo strip
formato·posición·reloj → banda del SUJETO gobernando → APOYOS de alto fijo →
franja de acción; cascada por prioridad; nada scrollea; el deshacer nunca se
recorta) deja de ser una pantalla y pasa a ser **el lenguaje de TODAS las
superficies del vivo**.

**CORRECCIÓN (11-ago noche, verificada contra el repo):** la primera versión de
esta entrada decía que `MarcoVivo` «tiene cero llamadas en Swift». **FALSO** —
era un artefacto de grep (`MarcoVivo(` no caza trailing closures): el host
existe (`ios/FAHYBRIK/Theme/LenguajeVivoUI.swift:194`, con su `MarcoVivoLayout`
que mide el sujeto, ancla su centro e inyecta `\.lienzoVivo`) y lo montan
FuerzaVivoView, EmomVivoView, OutdoorRunHUDView y ResumenCarreraView. **El hueco
REAL es otro:** el Layout mide el hueco de apoyos pero NO LO PUBLICA, así que
ninguna pantalla puede cascadear contra él — por eso `RoundsLiveHUD` (que además
vive FUERA del marco) se montó su propio GeometryReader + presupuesto estimado a
mano. Moraleja de método: una afirmación «cero llamadas» se verifica con el
símbolo A SECAS antes de escribirla aquí.

**El arreglo, en orden:** (1) el host EXISTENTE gana lo que le falta —
`PresupuestoApoyos` (asignador puro por prioridad con suelo, espejo de la
cascada del doble) + `CascadaApoyos` (mide su ranura y pasa el presupuesto) +
`TiraFormatoVivo` (el strip formato·posición·reloj, hoy `private` en rondas) —
en `Theme/`, junto al host, jamás en carpetas de pantalla; (2) piloto FUERZA
(propuesta en el doble → OK de Alex → Swift); (3) el resto en tandas: EMOM,
AMRAP, estaciones/For Time, ergo, descanso y RONDAS adoptando el host — cada
superficie migrada con su espejo del doble en el mismo lote.

**En consecuencia, no hacer:** ninguna superficie nueva del vivo fuera del marco;
no migrar dos superficies «de paso» en un lote ajeno (una por lote, con su
espejo); no re-decidir la jerarquía del sujeto por pantalla sin declararla (el
criterio es SIEMPRE «¿qué se le cae de la cabeza al atleta sudando?»).

---

## 2026-08-10 · Rondas ≠ estaciones: la lista del vivo con muchas rondas se colapsa a CURSOR, no a otra pantalla

**Decidido (cierra la pregunta que dejó abierta la entrada del blanco de EMPEZAR):** una
lista de N **estaciones** es heterogénea y colapsarla destruye información (eso ya lo
resuelve la ventana de tres + hoja de `vivo-fortime`); una lista de N **rondas** es
homogénea — la fila 12 repite la 11 — así que a partir del umbral la lista NO se
sustituye por otra metáfora: se queda **la misma lista con el cursor abierto** (cerrada
arriba tachada con su parcial, la actual en el numeral grande «RONDA 4/8», la siguiente
insinuada), trabajo escrito UNA vez en la banda (§10.6), hilo fino de progreso, sin
scroll (ancla del sujeto §10.3). Con pocas rondas manda el trabajo y la cuenta baja al
cromo; con muchas se invierte. **El umbral no es una constante de gusto: sale de la
aritmética del marco** (213 pt de apoyos, fila de 35 pt con el trabajo fuera → 5 rondas
listadas, cursor desde la 6ª) y vive calculado en `data.ts` de la pantalla.

**Dato que lo ancla:** el corpus real no tiene ningún metcon de 16 rondas (escalera
real: 4/6/8/10/12) y **el de 4 rondas ya desborda hoy** (fila actual de 54 pt × 2
líneas). Los escenarios de la propuesta son verbatim de `blocks.description`.

**Dónde vive:** pantalla del doble `web/components/design-twin/screens/vivo-rondas/`
(+ átomos en `kit-vivo`), **portada a Swift el 11-ago** (`583ab005`, Alex aprobó la
propuesta): `ios/FAHYBRIK/Workout/RoundsLiveHUD.swift` + rewires en la raíz. Tres
refinamientos que el porte fijó como doctrina: (a) **la banda del trabajo es FIJA**
(como la banda del sujeto de `MarcoVivo`) — es lo que hace al umbral PURO en rondas:
dos WODs de 8 rondas rinden la misma cara pese lo que pese su texto; el umbral se
deriva del hueco REAL medido (`RoundsListBudget`), no de un frame supuesto. (b) **el
botón del host cierra RONDA a ronda** (`conditioningPrimary`): una lista de rondas
tiene algo más pequeño que ella misma que cerrar — antes el botón grande se saltaba el
WOD entero. (c) **los parciales de una lista de rondas son DELTAS del reloj del
bloque** (`markRoundDone`): su ventana de tramo no re-ancla (`cursor .segment`), así
que leerla daba acumulados; las lecturas de máquina ahí van a nil, no un acumulado
disfrazado de ronda. Y la muñeca (`liveProgressText`) dice el MISMO número que la
pantalla («RONDA 4/8»). Los ROTATIVOS (tabata/interválico/death-by/steady) no entran:
su cursor es `rotRoundIndex` y conservan su suelo honesto (`RotatingClockHUD`).

**En consecuencia, no hacer:** no meter scroll vertical en la ranura del vivo; no
inventar una metáfora nueva para rondas; no fijar el umbral como constante suelta (se
deriva del marco); no portar a Swift sin el OK sobre la propuesta.

---

## 2026-08-10 · La `structure` de carrera es ADITIVA al plano — y lo garantiza el ESCRITOR, no la buena fe

**Decidido (tras el primer fartlek dictado por MCP):** una prescripción que lleva
`structure` (#61) DEBE llevar también la dosis plana (sets/rounds/rest_s…). El contrato
ya estaba declarado en el wire de iOS (`Prescription.swift`: «a block that carries
structure ALSO carries the flat») y el dominio traía el conversor
(`structureToLegacy` / `prescriptionFromStructure`, run-structure-convert.ts) **sin un
solo caller**. Ahora lo garantiza el escritor: `withFlatFromStructure()` aplicado en
`serializeSessionSegments` y `serializeBlockExercises` — si el autor declaró plano, el
suyo manda; si no, se deriva del flatten. Sin esto, una prescripción solo-estructura es
canónica y válida pero **muda**: `params_json` queda `{}`, `to-text` no habla structure,
y la dosis solo vive en el título si el cliente tuvo la ocurrencia de escribirla ahí.

**Lo que este caso enseñó del conector:** el cliente LLM lo hizo BIEN (convirtió
«fartlek 16x500 Z3 / 1' Z2» a estructura tipada perfecta, sin que «fartlek» exista como
formato); el hueco era nuestro. De propina, las descripciones de `create_session`
dejan dicho que el título es SOLO el nombre — la dosis jamás va escrita en él.

**En consecuencia, no hacer:** no enseñar a `to-text`/lectores a «tolerar» estructura
sola en vez de arreglar el escritor (parche en N sitios vs raíz en 1); no confiar en
que el cliente rellene el plano; no borrar `structure` al derivar (la estructura sigue
siendo la verdad para vivo/cumplimiento; el plano es el resumen lossy).

---

## 2026-08-10 · Los add-ons se venden por club: `coach_entitlements` (0167), y el portón concede por LISTA BLANCA

**Decidido:** el conector MCP (y todo add-on futuro) se gatea con la tabla genérica
`coach_entitlements` (mig **0167 aplicada**: `coach_id × feature` únicos, `status`,
`source`, FK con `on delete cascade` — un entitlement sin su club no nombra nada).
El portón (`web/lib/coach/entitlements.ts::hasEntitlement`, consumido en
`web/lib/mcp/runtime.ts::withCoach` ANTES del cuerpo de toda tool) concede **solo** con
`status='active'`: cuando Stripe traiga `past_due`/`canceled`/`trialing`, cierra por
defecto y abrir un estado nuevo exige tocar el resolutor a mano — jamás conceder por
`status <> 'inactive'`. Sin entitlement → frase propia (`NO_CONNECTOR_MESSAGE`),
DISTINTA de «esta cuenta no es de ningún coach»: allí sobra reconectar con otra cuenta,
aquí falta el add-on. Sin CHECK de enum en `feature` (mismo criterio que
`audit_log.channel`): el portón es el tipo `EntitlementFeature`. Alta fundadora: club 60
(`source='founder'`), única fila en main. El precio del add-on NO está decidido — es de
Alex; el mecanismo no lo necesita.

**En consecuencia, no hacer:** no gatear features comerciales con flags sueltos en
`coaches`; no conceder por exclusión de estados; no cargar el SELECT de membresía
(compartido con el dashboard) con la pregunta comercial.

---

## 2026-08-10 · La visibilidad de una semana la decide su fila de `weekly_plans` — y SIN fila, SE VE

**Decidido (constatado en F3 del conector y elevado a doctrina):** el portón que decide si
el atleta ve una semana es `not exists (weekly_plans … status='draft')`
(`web/lib/athlete/week-plan.ts:185`, repetido en :337 y :471). Solo un `draft` explícito
esconde; `published`, `archived` y **la ausencia de fila** se ven. Ni la creación de sesión
del panel ni el PATCH de día tocan `weekly_plans`. En consecuencia, cualquier superficie de
escritura (dashboard, MCP, futuras) **no inventa estados de borrador propios**: lee la fila
real (`weekVisibility`, `web/lib/mcp/shape-write.ts`) y declara el efecto en su respuesta
(«publicado: lo ve ya» / «borrador: no lo ve hasta publicar»). El plan del conector decía
«borrador primero» — corregido en `docs/mcp-conector-coach.html` §04.

**Derivadas de F3:**
- **Sesión AUTORADA, no solo fork:** `createDaySession` solo sabía copiar una plantilla
  (sin `template_id`, la más reciente — arrastrando formato/calentamiento/notas de OTRO
  entreno al móvil del atleta). Nueva primitiva `createAuthoredInstance`
  (`template-instance.ts`, la «instancia autorada» que la mig 0083 ya nombraba,
  `instance_of_template_id` NULL), seleccionable con `content_source`; el panel sigue en
  `'fork'` por defecto y se comporta idéntico. Una sesión dictada por MCP nace autorada.
- **Canal de auditoría:** mig **0165 aplicada** — `audit_log.channel` (`'dashboard'`
  default, `'mcp'` en el conector; sin CHECK a propósito, el portón es el tipo
  `AuditChannel` en `record-edit.ts`). Responde «¿esto lo cambié desde el chat o desde
  el panel?».
- **Dato corrupto arreglado en prod:** `template_segments` 2594/2685 llevaban
  `target.kind='pace_500m'` (no existe en la unión canónica) → corregidos a
  `{kind:'pace', unit:'per_500m', value_s}`. Si aparece otro, el canon es `Target` de
  `shared/domain/prescription/types.ts`, no inventar kinds.

**En consecuencia, no hacer:** no añadir capas de borrador nuevas sobre `weekly_plans`;
no crear sesiones vía fork «por defecto» desde superficies conversacionales; no escribir
en `audit_log` sin canal.

---

## 2026-08-10 · El conector MCP es una CARA más de la app, no un servicio nuevo

**Decidido:** el coach mira y edita su club desde su asistente (Claude hoy, Grok después)
vía un **servidor MCP remoto dentro de fahybrik-web**: ruta `app/api/[transport]/route.ts`
(→ `/api/mcp`, Streamable HTTP) con `mcp-handler` **1.x** + OAuth de Clerk
(`@clerk/mcp-tools`: `withMcpAuth` + `verifyClerkToken`, metadata en `/.well-known/*`).
Las tools llaman a las **mismas funciones de `lib/` que el dashboard** con la firma
canónica `fn({coach_id, ...})` — cero lógica duplicada, cero HTTP contra la propia API.
La identidad entra por token OAuth → `getCoachSessionForClerkUser()` (mismo SELECT de
membresía que la sesión web, refactorizado para compartirse). Rate limit: perfil `mcp`
(120/min) keyed por **usuario** de Clerk, no por coach — un bucket por coach no puede
proteger la query que produce su propia clave, y throttlea al humano, no al club entero.
Plan completo y fases: `docs/mcp-conector-coach.html`.

**Por qué 1.x y no 2.x:** `mcp-handler` 2.x exige `@modelcontextprotocol/server` 2.x;
la 1.x (SDK 1.26.0 fijado) habla el protocolo que Claude/Grok/ChatGPT consumen hoy y
convive con el zod del monorepo. Migrar es otra obra. **SSE apagado** (`disableSse`):
el SSE de mcp-handler 1.x exige Redis, que no está en el stack a propósito.

**Gotcha cazado (no repetir):** `protectedResourceHandlerClerk` cablea el identificador
del recurso al ORIGEN de la petición — para un servidor bajo `/api/mcp` publica un
`resource` que no cuadra y el cliente OAuth aborta sin decir por qué (el síntoma del
issue Claude↔Clerk de abr-2026). Se usa `generateClerkProtectedResourceMetadata` con el
identificador correcto; los paths viven derivados unos de otros en `web/lib/mcp/paths.ts`.

**En consecuencia, no hacer:** no montar el MCP como servicio/deploy aparte; no escribir
tools que acepten prescripción en texto libre (hablan `shared/domain/prescription`, y las
escrituras — F3 — nacen borrador-primero con audit canal `mcp`); no exponer escrituras sin
read-back inequívoco; no usar los helpers `protectedResourceHandler*` de Clerk tal cual
bajo un path anidado.

**Dónde vive:** `web/app/api/[transport]/route.ts`, `web/lib/mcp/*`,
`web/app/.well-known/*`, tests en `web/tests/mcp/`.

---

## 2026-08-10 · Tenancy del embudo: un lead responde a su dueño; «sin asignar» responde a cualquiera

**Decidido:** las superficies coach del embudo que actúan sobre UN lead concreto (ficha,
transición de pipeline, reabrir, liberar plaza) y sobre sus citas (actuar, sellar Meet link)
se filtran por dueño con **una sola regla**, `coachOwnsLead` (`web/lib/leads/store.ts`):
`leads.coach_id = coach` **o** `coach_id IS NULL`. Un lead asignado a otro club responde
**404** (not_found — la existencia no se filtra, nunca 403). Un lead «sin asignar» (NULL,
mig. 0147) sigue siendo accionable por cualquier club autenticado: alguien tiene que
triarlo y la captura es el negocio (misma lectura fail-open que el cupo). Las citas no
tienen `coach_id` propio (0093): su dueño ES el dueño de su lead, y el scope entra por
`appointmentWithLead`; la ruta pública de reserva sella el link con scope de confianza
(`coach_id: null`) porque opera sobre la fila que ella misma acaba de crear.

**Qué NO se tocó y por qué:** `coach_availability_exceptions` (y todo el sistema de
disponibilidad/huecos) **no tiene dueño posible** — 0093 lo dejó club-global a propósito
(unique global en `fecha`, `setAvailability` reemplaza la tabla entera). Filtrar su DELETE
exigiría rediseñar el sistema de citas entero (obra multi-coach), no un filtro. El listado
de leads (`listLeadsForCoach`) y la waitlist siguen club-global por el mismo motivo.

**En consecuencia, no hacer:** no rellenar `coach_id` NULL con un dueño por descarte para
"simplificar" el predicado (es el fallo que la 0147 cerró); no convertir el 404 de recurso
ajeno en 403; no añadir `coach_id` a `appointments` mientras el dueño derive del lead.

**Dónde vive:** `web/lib/leads/store.ts` (`coachOwnsLead` + transición/reabrir),
`web/lib/dashboard/coach/leads.ts` (`getLeadDetail`), `web/lib/citas/store.ts`
(`actOnAppointment`, `setAppointmentMeetLink`), tests en `web/tests/leads/tenancy.db.test.ts`.

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

**Nada se obliga (corrección de Alex, mismo día):** el check es del **PASO**, no
del tipo. El cimiento dio por hecho que un protocolo ES una lista de casillas
(exigía ≥1 paso y todos marcables) y eso deja fuera lo que un entrenador escribe
de verdad el día antes de una carrera: cuándo calentar, cuánta agua, cómo comer.
Es texto para LEER, y ponerle una casilla a «desayuna 3 h antes» no mide si
comió, mide si tocó un círculo. En consecuencia: `coach_communication_items`
gana `checkable` (migración **0162**, default `true`, sólo significa algo en un
protocolo — una opción se elige y una sección se lee, ahí es inerte); un
protocolo puede ser **todo casillas, todo lectura o mezcla**; lo que el servidor
exige pasa de «≥1 paso» a **«título + (texto O ≥1 paso)»** — lo único que no
puede ser un protocolo es estar vacío; el `done_at` derivado cuenta **sólo los
pasos con casilla** (marcar la última cierra, desmarcar reabre) y un protocolo
**sin ninguna deja de derivarse**: su hecho, si lo hay, es declarado por el
mismo camino que el de una tarea y no se le retira. Marcar un paso de lectura es
un 409 (`not_checkable`): no es un paso a medias, es un paso que no se marca. La
derivación vive en un solo sitio, `stampDone` en `web/lib/athlete/communications.ts`.

**No hacer:** no volver a atar «lo que un tipo pide» al tipo. Si mañana una nota
necesita una casilla, la lleva el ítem, no la tabla padre.

---

## 2026-08-09 · El camino se DERIVA del plan, no se teclea — y la nota tiene formas

**Decidido:** las secciones de una nota declaran su FORMA (`display`: texto |
cifra | reparto | camino) y el contrato la transporta tipada — aplanarla a
texto fue la pérdida que Alex cazó («a veces haces un mock y luego no ponemos
cosas que estaban en el mock»). El reparto guarda sus segmentos en tabla
propia (`coach_communication_item_segments`), y los comunicados pueden
enlazarse (`linked_communication_id`: la nota lleva al pie su pregunta).
Migración 0163.

**El camino (la espina que encantó a Alex) se deriva, no se teclea:** un item
`camino` no tiene contenido — al servir la nota, el servidor resuelve la
espina del plan REAL del atleta. Sus reglas, atadas a la 0064:
- **Nodo = TRAMO de microciclo** (las semanas seguidas de un
  `program_month_template` en `athlete_month_assignments`): el orden de los
  microciclos ES la periodización; no existe entidad fase.
- **La etiqueta del tramo es el NOMBRE del microciclo** — vocabulario del
  coach, sin interpretar: si él lo llama «Descarga», se lee «Descarga».
  **No hacer:** no emitir una bandera `descarga` deducida del nombre ni del
  recuento de sesiones — sería cablear el método o inventarse un dato.
- **Hitos solo demostrables:** simulación (`format = 'hyrox_sim'`) o test de
  calibración asignado, con su fecha.
- **Color por POSICIÓN del tramo** con paleta estable (añadir un tramo no
  recolorea los previos). El día que un coach pueda nombrar y colorear sus
  ciclos, la función de color lee esa columna (está señalado en el código).
- Sin plan activo → `camino: null` y el cliente no lo pinta.

**La espina es una pieza compartida** (`web/components/plan-espina/`):
la consumen la previa del compositor y el doble coach-nota, y es la forma
canónica de pintar un ciclo para las superficies de fases/ciclos que vienen
(vista de ciclo del atleta, Periodización). **No hacer:** no volver a dibujar
una espina local por pantalla.

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

## 2026-08-10 · Las fases de un plan personal son TRAMOS ENCADENADOS, no etiquetas por semana

**Se descartó trabajo terminado, y la culpa es de la premisa.** Se encargó «que el
coach pueda colocar fases a lo largo de un plan personal» afirmando en el encargo
que `methodology_phases` (0052) y `program_week_templates.phase_id` (0063) seguían
vivos. **No lo estaban:** la migración **0064** borró el catálogo entero y todos
los `phase_id`, un paso después de que la 0063 los creara. El encargo se escribió
leyendo ficheros de migración sueltos en vez de este registro, que es justo lo que
`CLAUDE.md` obliga a leer antes de rediseñar dominio.

El agente lo verificó contra el repo, avisó de que la premisa era falsa, construyó
una alternativa (tres columnas planas `phase_label`/`phase_tone`/`phase_is_deload`
en `program_week_templates`, sin tabla catálogo) y **dejó su migración 0167 SIN
aplicar** pidiendo que se leyera el razonamiento antes. Hizo lo correcto en las
tres cosas.

**Decidido: se descarta.** No por su calidad, sino porque la decisión de julio ya
respondía a la pregunta, y con un modelo más simple:

> Una fase **es** un tramo. Un tramo es un microciclo con el **nombre que le pone
> el coach**, su duración, y su **posición en la cadena**.

Eso ya está construido y vivo: `shared/domain/plan-path.ts` dibuja la espina y
`web/lib/plan/camino.ts` encadena los tramos por `athlete_month_assignments`. Un
plan de 14 semanas con Base / descarga / Build / descarga / Pico / Taper **no es
un plan con seis etiquetas dentro: son seis tramos encadenados**.

Y encaja con lo de esta misma mañana: la restricción `EXCLUDE` de la 0166 (dos
planes de un atleta no pueden solaparse en fechas) es exactamente lo que garantiza
que una cadena de tramos sea una cadena limpia.

**Lo que falta de verdad, y es mucho menos:** hoy personalizar crea UN tramo de N
semanas. Falta poder **encadenar varios tramos personales** al mismo atleta y
verlos en la espina que ya existe.

**En consecuencia, NO hacer:** no reintroducir fases como atributo de la semana ni
del mes, con ningún nombre ni forma —columna plana incluida—; y no volver a
escribir un encargo de dominio sin leer ESTE fichero primero. La rama descartada
es `worktree-agent-a5d58e9d1fd1ff9b7` por si alguien quiere ver el compositor.

---

## 2026-08-09 · La biblioteca no está a medias por el lector — está a medias en origen

**Decidido tras medirlo, y en contra de la hipótesis con la que empecé.** Los 56
bloques que un coach real no puede prescribir parecían un fallo de la gramática
de importación. Medido en seco sobre sus 54 bloques con prosa y sin tipar, el
reparto es otro:

  · **12** entran con el lector de hoy (6 de movilidad + 6 que cerró la
    gramática de estructura del metcon)
  · **22** están **incompletos EN ORIGEN**: el coach nombró el movimiento y no
    escribió cuánto («WOD For Time 4r: KB overhead lunge + thrusters + clean +
    TTB – TC12'» no dice cuántos thrusters)
  · **20** son límite real del lector, cada uno con su motivo verificado

**La consecuencia:** los 22 no los recupera ninguna gramática, ni la mejor. No
hay dosis que leer. Seguir metiendo lectores para ese 41% es trabajo tirado.

**Lo que sí lo resuelve, y es de producto, no de parser:** que completar un
bloque a medias cueste minutos y no una tarde, y que un bloque nuevo no pueda
nacer sin dosis. La Biblioteca ya distingue honestamente los tres estados («sin
tipar» / «sin dosis» / listo) y ya dice «N líneas sin dosis · ábrelo para
completarlas» — el hueco es que completarlas sigue siendo abrir 22 bloques a
mano, uno a uno.

**NO hacer:** inventar la dosis que falta, ni por defecto ni por IA «razonable».
Un peso o unas repeticiones que el coach no escribió son un entreno que él no
prescribió. El contrato del importador (FIEL O REVISIÓN) vale igual aquí.

**Cómo se encontró:** usando la app como coach, no leyendo código. Y el número
hubo que reconciliarlo dos veces — mi primer arnés parseaba título+descripción y
el título es una TRUNCACIÓN de la descripción, así que penalizaba a bloques que
sí entran. El del agente era el correcto.

---

## 2026-08-09 · El lector solo alcanzaba una esquina del modelo — y el rango mentía

**Cómo se encontró (y por qué importa el método).** Tras horas afinando la
gramática contra un plan concreto, Alex preguntó «¿esa tabla es un ejemplo o es
todo?». Barrer `shared/domain/prescription/types.ts` COMO ESPECIFICACIÓN —los 11
objetivos y las 5 medidas que el modelo declara, uno por uno, aunque nadie los
hubiera mencionado— destapó que la gramática alcanzaba **4 objetivos y 2
medidas**. Ningún ejemplo que teníamos delante lo enseñaba. La regla que sale de
aquí: el inventario de casos lo da el modelo, jamás el ejemplo.

**Lo que faltaba, y era medio deporte.** RITMO no entraba en ninguno de sus tres
formatos. `/km` son los 8 km de una carrera HYROX; `/500m` son remo y ski, dos de
las ocho estaciones. Un coach de resistencia no podía escribir una sola línea de
su método. Tampoco entraban pulso, vatios, calorías (ni como objetivo ni como
medida), tiempo como medida, peso corporal ni tope de tiempo.

**Lo que MENTÍA, que era peor.** El lector de secuencias de repeticiones no tenía
conciencia de unidad, así que cazaba cualquier rango como reps sueltas: «45 min
entre 130-150 ppm» salía **verde** como dos series de 130 y 150 reps, y «Peso
muerto 4x6 @150-170 kg» salía verde como dos series de 150 y 170 reps **con el
4x6 desaparecido**. El saneo de raíz: todo lector de rango se retira del texto
ANTES de que el de repeticiones lo vea — el mismo patrón que el fichero ya usaba
para los porcentajes, aplicado donde faltaba.

**Decidido — el rango es ciudadano de primera.** Un coach que prescribe
`4x12-15 @70-75%` y otro que prescribe `4x12 @72%` están los dos escribiendo
bien; la banda es una decisión metodológica (autorregulación), no una
imprecisión. Aplanarla al extremo duro es prescribir otro entreno. **NO hacer:**
guardar solo un extremo «porque el modelo ya tiene el suelo».

**Decidido — `%FCmax` se reconoce pero NO se deriva.** No es miembro del enum de
objetivos: el modelo tiene `hr_bpm` (absoluto) y `hr_zone` (índice). Convertir un
72% a pulsaciones exige la FCmáx **medida** del atleta, y eso es resolución contra
sus marcas, no gramática. Va a revisión con razón honesta. **NO hacer:** tipar
con la fórmula 220−edad.

**Decidido — `dose.ts` se parte por responsabilidad.** Estaba en 550 líneas, por
encima del techo de 500, antes de esta tanda. Ahora `target.ts` (los 11
objetivos) y `measure.ts` (las 5 medidas), con el traslado puro en un commit
separado del de comportamiento para que el diff sea auditable contra los 138
tests de fidelidad.

**Tests de contrato superados, no borrados.** Dos casos de las clases 11 y 15
fijaban `review` para «6x90 seg strides» explicando en su propio comentario que
«the grammar has no word-interval reader yet». Codificaban la limitación, no el
contrato: ahora tipa, y la garantía que sí protegían —que el «6x» no se pierda
silenciosamente— se mantiene verificada. La supersesión está escrita en el test.

**Sin cerrar:** la banda de kg sobre medida de DISTANCIA
(`Sled Push 5x25 m @150-170 kg`) va a revisión. Es el guardia de residuo
funcionando: antes salía verde con 170. Honesto, pero pendiente.

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

## 2026-08-11 · Reconocer el movimiento: fases 0–3 en código; migraciones 0173–0177

**Decidido:** se construye la cadena 0–3 del plan (grabar · trabajo/descanso ·
contar reps · velocidad de barra). Las migraciones del plan HTML (0157–0162)
ya estaban ocupadas por otras piezas; las reales son **0173–0177**. No se
reescribe el HTML histórico del plan: el rastro de numeración vive aquí y en
`FOCUS.md`.

**Semáforo de velocidad:** color = velocidad de subida (m/s), no %1RM. El atleta
interpreta el RM; la app no estima 1RM desde velocidad genérica. Cortes =
método del coach (`coach_movement_policy` / overrides), con defectos en
`shared/domain/strength/velocity-bands.ts`.

**UI fina del vivo (m/s, chip de procedencia):** Claude. Grok: sensor, cable,
API, ingest, algoritmos.

**Consentimiento:** archivar exige `athletes.sensor_capture_consent_*`. El
procesado en vivo (1–3) no espera archivo.

**Documentos:** plan + `docs/reconocer-el-movimiento.html`; código bajo
`ios/FAHYBRIK/Sensor/`, `ios/FAHYBRIKWatch/Sensor/`,
`web/lib/sync/ingest-sensor-capture.ts`.

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

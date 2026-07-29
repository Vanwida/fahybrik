# DECISIONES — FAHYBRID

Registro de decisiones estructurales del dominio y de la arquitectura.

**Para qué existe:** en julio de 2026 tuvimos que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y un par de migraciones que habían creado y luego eliminado una entidad, sin que en ningún sitio constara el porqué. Este fichero evita que vuelva a pasar.

**Cuándo se escribe aquí:** siempre que se tome una decisión que condicione el dominio o el modelo de datos, y muy especialmente cuando se **elimina o se descarta** algo. Lo que se borra sin dejar rastro es lo que alguien reconstruye seis meses después.

**Formato:** una entrada por decisión. Qué se decidió, por qué, y qué NO hacer en consecuencia.

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

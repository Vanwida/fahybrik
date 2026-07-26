# DECISIONES — FAHYBRID

Registro de decisiones estructurales del dominio y de la arquitectura.

**Para qué existe:** en julio de 2026 tuvimos que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y un par de migraciones que habían creado y luego eliminado una entidad, sin que en ningún sitio constara el porqué. Este fichero evita que vuelva a pasar.

**Cuándo se escribe aquí:** siempre que se tome una decisión que condicione el dominio o el modelo de datos, y muy especialmente cuando se **elimina o se descarta** algo. Lo que se borra sin dejar rastro es lo que alguien reconstruye seis meses después.

**Formato:** una entrada por decisión. Qué se decidió, por qué, y qué NO hacer en consecuencia.

---

## 2026-07-26 · Pausar y darse de baja son autoservicio, y la pausa reserva la plaza

**Decidido:** el atleta pausa o se da de baja desde la app, sin que el coach confirme nada. La pausa **para el cobro** (`pause_collection` en Stripe, ya implementado) con un tope de **4 semanas en una ventana móvil de 12 meses**, contando días efectivamente pausados y no los solicitados. Mientras dura la pausa **la plaza se le reserva**: deja de liberarse a la lista de espera. La baja se aplica al final del periodo pagado y es reversible hasta ese día.

**Por qué:** se entra por entrevista y se paga por un link, así que la app nunca es el canal de compra — pero la salida no puede depender de que alguien devuelva una llamada. El dinero es del atleta y frenarlo no puede requerir permiso; en la UE, además, darse de baja no puede ser más difícil que contratar. El tope es lo único que justifica reservarle la plaza: sin límite, el cupo se llena de gente que no factura; sin reserva, pausar deja de tener valor y el atleta cancela en vez de pausar, que es la peor de las dos para el negocio.

**En consecuencia, no hacer:** no meter retención agresiva (descuentos, confirmaciones repetidas) en el camino de salida — el único dato que se le da es que no pierde lo que ya pagó. No dejar pausas sin fecha de vuelta: una pausa indefinida es una baja que nadie declara. No confundir baja con borrado de datos (RGPD, #19): son caminos distintos y el historial de un atleta de baja se conserva siempre.

**Contradice a propósito** el comentario de la migración 0104 (*"No cuenta para el cupo salvo activo"*) y a `releaseWaitlistToCapacity()` dentro de `pauseAthlete`: el pausado vuelve a contar para el cupo. `baja` sigue liberando plaza igual que hasta ahora.

**Dónde vive:** `docs/design/bajas-y-pausas-mockup.html` (pantallas y razonamiento), `web/lib/coach/athlete-lifecycle.ts`, `web/lib/coach/billing-actions.ts`, `infra/migrations/0104_athlete_lifecycle.sql`.

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

# DECISIONES — FAHYBRID

Registro de decisiones estructurales del dominio y de la arquitectura.

**Para qué existe:** en julio de 2026 tuvimos que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y un par de migraciones que habían creado y luego eliminado una entidad, sin que en ningún sitio constara el porqué. Este fichero evita que vuelva a pasar.

**Cuándo se escribe aquí:** siempre que se tome una decisión que condicione el dominio o el modelo de datos, y muy especialmente cuando se **elimina o se descarta** algo. Lo que se borra sin dejar rastro es lo que alguien reconstruye seis meses después.

**Formato:** una entrada por decisión. Qué se decidió, por qué, y qué NO hacer en consecuencia.

---

## 2026-07-25 · La metodología es contenido, no schema

**Decidido:** la metodología propia de FAHYBRID (reglas, fases, catálogo de sesiones, progresión, ajuste diario) se define como contenido documentado, no como entidades nuevas en base de datos.

**Por qué:** el sistema es agnóstico por diseño. Meter las fases o el catálogo como tablas volvería a acoplar el producto a una metodología concreta, que es justo lo que se deshizo en las migraciones 0064 y 0068.

**En consecuencia, no hacer:** no crear tablas de fases, de tipos de sesión ni de macrociclos. Si hace falta que el producto ejecute estas reglas, se implementan como lógica sobre las entidades que ya existen (`program_month_templates`, `program_sequences`, `methodology_groups`).

**Dónde vive:** `docs/methodology/` — la página principal es `metodologia-fahybrid.html`.

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

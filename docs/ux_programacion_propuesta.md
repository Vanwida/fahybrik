# Propuesta UX — Programación (Panel del Coach)

> Objetivo: la mejor experiencia para que Pablo programe a sus atletas. Anclada en cómo
> programa de verdad (Documento Maestro §03, §07, §08, §10), no en UX genérica.

---

## 1. Cómo programa Pablo (del Documento Maestro)

El trabajo diario de Pablo (§08 "Constructor de planes semanales") es un **loop semanal por atleta**, no montar plantillas sueltas:

1. La **IA propone** la semana del atleta (desde la biblioteca de bloques + feedback + resultados de carrera).
2. Pablo **revisa, ajusta arrastrando bloques** de la biblioteca a los días, y **edita cada bloque para ese atleta** (pesos, ritmos, volumen, notas).
3. **Publica** la semana → el atleta recibe notificación. El ritmo canónico: **publicar cada sábado** la semana siguiente.
4. Puede **duplicar la semana de otro atleta** como punto de partida.

Unidades (jerarquía real):
- **Bloque** = unidad atómica de la metodología de Pablo. Tiene grupo (1-10), tipo, **ejercicios estructurados con vídeo**, descripción.
- **Sesión** (día, AM/PM) = varios bloques.
- **Semana** = lo que se publica al atleta (lunes-domingo).
- **Microciclo** = varias semanas (con su deload) — herramienta de planificación a medio plazo.
- **Fase ATR** (Acumulación/Intensificación/Tapering) clasifica semanas y guía qué bloques tocan.

**Implicación de diseño #1:** el centro de la UX no es un "studio de plantillas" abstracto. Es **el atleta y su semana**, con la IA y la biblioteca de bloques como herramientas del loop revisar→ajustar→publicar.

**Implicación de diseño #2 (modelo de datos, ya decidido por Alex):** los bloques son **estructurados** (ejercicios reales del catálogo + series/reps/%/zona/ritmo/RPE), no solo texto. Así el atleta ve cada ejercicio, toca→vídeo, y las analíticas cuadran. El texto verbatim de Pablo se conserva como descripción del bloque.

---

## 2. La fricción raíz del estado actual

1. **Tres formas solapadas** de meter contenido en un día (formatos vacíos `AddPartMenu` / arrastrar ejercicios sueltos / `BlockLibraryPicker`). El coach no sabe cuál usar.
2. El "studio de microciclo" vive **desacoplado del atleta**: montas una plantilla y luego la asignas, en vez de trabajar la semana del atleta directamente (que es el loop del doc).
3. La **IA es un toggle**, no el punto de partida del loop (el doc dice que la IA *propone* y el coach *aprueba* — debería ser el arranque natural).
4. **Asignar/publicar** confuso: fechas (junio vs semana actual), "0 sesiones", sin preview de qué recibe el atleta.
5. Bloques eran solo texto → no llegaban estructurados al atleta (se corrige con el modelo estructurado).
6. Edición de params escondida; sin reordenar/duplicar claros; desktop-only.

---

## 3. El modelo conceptual unificado: **todo es un bloque**

Un solo verbo para construir: **añadir bloque**. Los ejercicios viven *dentro* del bloque (no sueltos). "Añadir bloque" abre **una sola puerta con tres fuentes**:

- **Biblioteca de Pablo** — los ~97 bloques, por grupo + fase ATR. La vía normal.
- **Pablo IA propone** — compone el día/semana desde bloques según fase + atleta. El doc lo pone como protagonista.
- **A medida** — bloque nuevo con ejercicios del catálogo (absorbe el antiguo "arrastrar ejercicios sueltos").

Esto mata la confusión de los 3 caminos: pasan a ser tres fuentes de **lo mismo** (un bloque).

---

## 4. La experiencia rediseñada — pantalla por pantalla

### 4.1 Home: el atleta y su semana (no un studio aparte)
Desde la ficha del atleta → pestaña **Plan**, el coach ve la **semana del atleta** directamente editable (no una plantilla desacoplada). Arriba: estado (fase ATR, semana N del microciclo, % completado, última actividad), y si la **IA tiene una propuesta pendiente** → banner destacado "Pablo IA propone la semana del [fecha] · Revisar".

```
Marc Vidal · Pro · ACC · Semana 2/4        [Publicar semana ▸]
┌ ✦ Pablo IA propone la semana del 2-jun ──────────── [Revisar] ┐
└───────────────────────────────────────────────────────────────┘
 LUN     MAR     MIÉ     JUE     VIE     SÁB     DOM
 ▢ 2 bl  descanso ▢ 1 bl  ▢ 2 bl  ▢ 1 bl  ▢ sim   descanso
```

### 4.2 Construir/editar la semana (el board)
Board de 7 días (denso, se conserva — bueno para coach élite). Cada día:
- Lista de **bloques** (tarjetas) con: grupo (chip de color), título, resumen estructurado (ej. "Front squat 5×10-8-8-8-6 @75%"), y badge si encaja con la fase ATR.
- Sesión AM/PM cuando aplica.
- **[+ Añadir bloque ▾]** → las 3 fuentes.
- Arrastrar para reordenar bloques dentro del día y mover entre días (cumple §08 "arrastrar y soltar").

### 4.3 Editar un bloque para ESE atleta (modificadores)
Al tocar un bloque → panel de edición **por-uso** (no muta la biblioteca, §08 "editar cualquier bloque para ese atleta concreto"):
- Ejercicios estructurados del bloque (cada uno: series/reps/%/carga/zona/ritmo/RPE/descanso) — editables.
- Modificadores rápidos a nivel bloque: **intensidad %, volumen, duración**.
- Nota específica para el atleta.
- La descripción verbatim de Pablo como referencia.

### 4.4 Pablo IA — protagonista del loop
- **Proponer semana**: la IA compone desde bloques por fase ATR + grupos + feedback/resultados del atleta → preview editable → el coach acepta/ajusta/regenera. No inventa: referencia bloques reales.
- **Por día**: "Que Pablo IA proponga este día".
- Tras carrera HYROX: la IA sugiere priorizar grupos débiles en el siguiente bloque (§07.3).

### 4.5 Microciclo (multi-semana) — vista de planificación
El microciclo sigue existiendo como **planificación a medio plazo**: pestañas Semana 1-4 (+deload), cada una con su fase ATR. Pero se trabaja como semanas del atleta, no como plantilla abstracta. Sirve para ver el arco ACC→INT→Tapering y progresión entre semanas.

### 4.6 Publicar (no "asignar mes" confuso)
Acción clara **"Publicar semana"** con:
- **Preview de lo que recibe el atleta** (los días con sus bloques/ejercicios) antes de confirmar.
- Fecha explícita (por defecto la semana siguiente, ritmo sábado del doc).
- Confirmación → materializa a `workout_assignments` (estructurados) → notificación al atleta.
- Esto elimina el "0 sesiones" y la confusión junio/mayo.

### 4.7 Duplicar como punto de partida (§08)
"Duplicar semana de [otro atleta / semana anterior]" como arranque rápido, luego editar.

---

## 5. Modelo de bloque estructurado (los 97)

Cada bloque guarda **dos capas**:
- **Verbatim** (texto exacto de Pablo) — descripción/cabecera.
- **Estructura**: ejercicios ordenados (FK al catálogo de 62 + params: series, reps, %1RM/carga, zona HR, ritmo, distancia, descanso, RPE). + grupo metodológico + format + atr_hint + vídeos (heredados del ejercicio o del bloque).

Trabajo: parsear los 97 verbatim → estructura (semi-automático + revisión de casos densos), mapear nombres a los 62 ejercicios y crear los que falten. Materialización: bloque → `template_segments` con `exercise_id` reales → el atleta ve ejercicios + vídeo + analíticas.

---

## 6. Qué se conserva / qué cambia

**Se conserva:** board denso de 7 días, microciclo con pestañas de semana, vocabulario ATR nativo, drag&drop, el catálogo limpio (62) y la biblioteca (97).

**Cambia:** un solo verbo "añadir bloque" (3 fuentes) en vez de 3 caminos; trabajar la semana del atleta en vez de plantilla desacoplada; IA como arranque del loop; publicar con preview en vez de "asignar mes"; bloques estructurados.

---

## 7. Plan de implementación por fases (tras tu OK)

1. **Modelo estructurado de bloques** — parsear los 97 + mapear catálogo (fundación; ya tenemos tabla + verbatim).
2. **Unificar "añadir bloque"** (3 fuentes) en el board; absorber AddPartMenu/drag-exercises bajo "a medida".
3. **Editar bloque por-atleta** (ejercicios + modificadores) en panel claro.
4. **Loop IA**: proponer semana/día desde bloques estructurados, preview editable.
5. **Publicar con preview** + materialización estructurada + notificación (arregla fechas/0-sesiones).
6. **Duplicar semana**; pulido de estados (vacío/guardando/reordenar).
7. **Responsive** del board (ver + edición ligera en móvil).

Cada fase: verificada (tsc/build/tests) y desplegada para que la pruebes.

---

## 8. Fricciones de la auditoría → cómo las resuelve el diseño

Auditoría independiente del flujo actual (15 fricciones, con fichero:línea). Las prioritarias (ALTA) y cómo el rediseño las ataca:

| # | Fricción (severidad) | Fichero | Resuelto por |
|---|---|---|---|
| F2 | **Nombre del microciclo pierde cambios al cambiar de semana** (autosave debounce 500ms no guarda antes de navegar) ALTA | `MicrocycleEditor.tsx:478-489,411-419` | Bug real → flush del autosave en blur/navegación + guardado optimista. Fase 6 (pulido estados). |
| F4 | **3 vías de añadir solapadas sin jerarquía** ALTA | `ProgrammingWeekCanvas`, `AddPartMenu`, `BlockLibraryPicker`, `DraggableExerciseCard` | §3 — un verbo "Añadir bloque" con 3 fuentes. Fase 2. |
| F11 | **Sin undo/redo** (borrados irreversibles) ALTA | `ProgrammingWeekStudio` | Undo (Cmd+Z) + papelera de sesión. Fase 6. |
| F13 | **No se reordenan bloques entre días** (dnd solo vertical) | `ProgrammingWeekCanvas:56-190` | Drag&drop entre días (§08 doc "arrastrar y soltar"). Fase 2. |
| F8 | **Preview IA no ajustable** antes de aceptar | `PabloIAComposeModal:220+` | §4.4 — preview editable (ajustar modificadores antes de aceptar). Fase 4. |
| F9/F7/F1 | **"Bloque" ambiguo (3 sentidos)**; toggles IA crípticos; wizard sin glosario | varios | §3 nomenclatura unificada (bloque = unidad); IA sin toggles confusos (una sola "Proponer"); glosario ATR inline. Fases 2/4. |
| F10/F14 | **ATR jerga sin explicar** + scroll 7 días sin referencia de fecha real | `ProgrammingMicrocyclesHub`, `Canvas` | Glosario ATR (tooltip) + cabecera de día con fecha real + "hoy". Fases 2/6. |
| F5/F6 | PARTE editable vs BIBLIOTECA sin distinción visual; panel 320px saturado | `StudioDetailPanel` | §4.3 panel de edición unificado y claro por tipo. Fase 3. |
| F12 | Sin duplicar semana/día/bloque | — | §4.7 duplicar (§08 doc). Fase 6. |

**Conservar (validado por la auditoría):** drag&drop fluido, PabloIAInput discreto, autosave con dot de estado, badges ATR+nivel color-coded, pills de navegación de semanas, librería con chips de filtro, panel contextual inline, AssignDropdown simple, separación PARTE/ITEM.

Conclusión: la auditoría **confirma** el rediseño (especialmente §3 "un solo verbo" para F4, el centro en el atleta, e IA como arranque) y aporta los bugs/fricciones concretos que las fases recogen.

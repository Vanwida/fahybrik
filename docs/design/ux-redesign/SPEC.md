# FAHYBRIK Coach Dashboard — UX Redesign Spec v1

> Design pass para sign-off de Alex. North star: **"Calendar-first, one inbox, one library"**.
> El modelo de datos NO cambia. Cambia la capa de UX completa.
> Vocabulario visible para el coach (7 conceptos): **atleta, calendario, microciclo, semana, sesión, bloque, ejercicio**.
> Todo lo demás (esquema, medida, target, modalidad, formato, asignación vs publicación) es interno o se presenta en lenguaje natural.

---

## 0. Navegación global

Sidebar (igual patrón actual: colapsable 80px → 256px hover, drawer en móvil):

```
FAHYBRIK
├── Hoy          (/)            — inbox único + pulso del equipo. Badge con nº pendientes.
├── Atletas      (/atletas)     — roster grid → ficha de atleta calendar-first
├── Programar    (/programar)   — biblioteca única (Sesiones + Microciclos)
└── (bottom) Ajustes, Ayuda. Admin solo si rol admin.
```

Desaparecen como destinos top-level: Review, Biblioteca, Metodología (pasa a Ajustes), campana de notificaciones (todo fluye a Hoy).

Tema: dark + Fabrik orange, tokens existentes de `web/app/globals.css` (surfaces, --accent, Archivo display italic-bold, Geist Sans/Mono, .metric-num, .micro-label, spacing/radius vars). Cero estilos nuevos inventados.

---

## 1. HOY — inbox único (`/`)

**Job:** Pablo despacha su mañana (10 min) en UNA pantalla. Todo lo que necesita decisión suya vive aquí; nada más le interrumpe en el resto de la app.

### Layout (desktop ≥lg: 2 columnas 2fr/1fr; móvil: stack)

**Columna principal — la cola.** Header: "Hoy" (display italic) + fecha + línea resumen: "5 decisiones pendientes · 2 alertas". Debajo, cards ordenadas por urgencia (crítico → decisión → informativo), agrupadas con micro-labels de sección. Tipos de item (fusiona las 5 superficies actuales):

1. **Intake nuevo** (crítico si >48h) — "María G. terminó el onboarding hace 36h" + chip A-event countdown. Acciones: `Revisar intake` (primaria) · `Ver ficha`.
2. **Ajuste semanal propuesto** (Pablo IA) — resumen del coach_summary + mini-tabla diff `Día | Antes | Propuesto` (máx 3 filas, "+N cambios más"). Acciones: `Aprobar` (inline, sin salir) · `Ajustar` (abre calendario del atleta con drawer enfocado) · `Posponer`.
3. **Propuesta de bloque mensual / transición ATR** — "Carlos R. termina Acumulación esta semana → propuesta: Transformación 4 sem". Acciones: `Aprobar` · `Revisar`.
4. **Alerta** — inactividad 2+ días, pago fallido, renovación en 7 días, readiness <45 sostenido. Acción: `Abrir atleta` (y `Enviar mensaje` cuando exista chat).
5. **Mensaje de atleta** — preview del mensaje. Acción: `Responder`.

Anatomía de card: avatar + nombre atleta · chip de tipo (color semántico: error/warning/accent/tertiary) · título · 1-2 líneas de contexto · acciones a la derecha (desktop) / debajo (móvil). Crítico = full-width + ring accent (mismo patrón que ReviewTaskCard actual crítico).

**Aprobar inline:** optimistic, la card colapsa con check verde y "Aprobado — publicado a María" + `Deshacer` 5s. Nunca un modal para aprobar.

**Columna derecha — pulso del equipo.** 3 mini-cards: distribución de readiness (verde/amarillo/rojo con conteos, click = filtra roster), cumplimiento medio de la semana, "Necesitan atención" (top 3 atletas por score de urgencia, click → ficha).

### Estados
- **Vacío:** ilustración tipográfica "Todo al día." + subtexto "Sin decisiones pendientes. Próxima revisión semanal: sábado." 
- **Cargando:** skeleton de 3 cards.
- **Error de acción:** la card no colapsa, banner inline en la card "No se pudo aprobar — reintentar".

---

## 2. ATLETAS — roster + ficha calendar-first

### 2a. Roster (`/atletas`) — SE CONSERVA el grid actual
Cards con readiness + compliance + status pill + alerta: correcto, no se rediseña. Solo cambios: (1) la cola de intake y el banner de review desaparecen de aquí (viven en Hoy), (2) los filtros persisten en URL (no se resetean), (3) chip de fase ATR se mantiene.

### 2b. Ficha de atleta (`/atletas/[id]`) — UNA página, el calendario es la columna vertebral

**Header persistente (sticky):** avatar + nombre + nivel + modalidad · KPIs inline (.metric-num): Readiness % · Check-in hoy · Cumplimiento sem % · countdown A-event. Si Dobles: chip partner con link. Acciones: `Asignar microciclo` · `Mensaje` (futuro).

**Nav de secciones anclada (no sub-rutas con page-load; scroll-spy o render local):** `Calendario` (default) · `Cuerpo` · `Rendimiento`. URLs profundas se mantienen como deep-links que abren la misma shell.

**Calendario — una sola superficie con 3 niveles de ZOOM (no 3 modos):**
- Control de zoom segmentado: `Semana | Mes | Macro` (mismo componente, misma data, distinta densidad).
- **Semana:** 7 columnas, sesiones como cards con título + bloques resumidos + estado (completada ✓ verde / pendiente / saltada) + adherencia de la semana en la esquina.
- **Mes:** grid mensual, sesiones como pills compactas, semanas con % cumplimiento al margen.
- **Macro:** ribbon ATR (ACC 5 · TRANS 4 · REAL 3) con semana actual marcada, microciclos asignados como tramos, click en tramo = zoom a Mes.
- **Overlay de cumplimiento siempre visible** en los 3 niveles (lo planificado y lo hecho en la misma superficie — estándar TrainingPeaks).

**Edición en sitio — REGLA DE ORO: cualquier ejercicio editable en ≤2 clicks, cero modales anidados.**
Click en sesión → **drawer derecho** (40% ancho desktop, full móvil) con la sesión completa:
- Título sesión (editable) + día + estado.
- Bloques en lista vertical; cada bloque: título + origen (chip "Biblioteca Pablo" / "Propia") + ejercicios.
- Cada ejercicio: una fila en lenguaje natural — "Back Squat — 5×5 @ 75% RM · descanso 2'" — click en la fila la EXPANDE inline dentro del drawer (no abre otro modal) con el editor de prescripción (ver §4).
- `+ Añadir bloque` (popover 3 fuentes: Biblioteca · Pablo IA · En blanco) y `+ Añadir ejercicio` dentro de bloque.
- Autosave + estado guardado + undo/redo: se conservan tal cual.
- Footer drawer: `Guardar bloque en biblioteca` cuando el bloque es propio.

**Paneles contextuales sobre el calendario** (sustituyen a los panels sueltos del Resumen actual): si hay propuesta semanal o de bloque pendiente, banner fino encima del calendario "Propuesta de Pablo IA pendiente — Revisar" que abre el mismo drawer en modo diff (Antes/Propuesto por día, aprobar/editar/rechazar). Una sola superficie canónica; Hoy enlaza aquí.

**Cuerpo / Rendimiento:** mismas vistas de datos actuales (sueño, HRV, fatiga / charts, run vs erg) pero como secciones de la misma shell, sin recarga.

### Estados
- Sin mes asignado: empty state en el calendario con CTA único `Asignar microciclo` (flujo §5).
- Semana de descanso / deload: columna con label tertiary.
- Sesión completada: card con check + datos reales del atleta (tiempo, RPE reportado) visibles en el drawer junto a lo prescrito.

---

## 3. PROGRAMAR — biblioteca única (`/programar`)

**Dos tipos de objeto, nada más:** `Sesiones` y `Microciclos`. Toggle segmentado arriba. Muere la distinción Biblioteca/Entrenos/bloques-custom: todo entreno reutilizable es una **Sesión**.

### 3a. Sesiones (catálogo)
- Grid de cards: título + tags (grupo metodológico 1-10, formato, fase ATR, nivel) + badge de origen: `Pablo` (las 97, prescripción original read-only) o `Propia`.
- Search + filtros por tag (chips, mismos del catálogo actual de Entrenos). Los filtros son TAGS de un mismo sistema, no taxonomías paralelas.
- Click card → drawer de sesión (MISMO componente que en el calendario del atleta, §2b). Las de Pablo: prescripción verbatim visible read-only + "Duplicar como propia" para editar.
- `+ Nueva sesión`: un solo campo obligatorio (nombre, con sugerencia IA); formato/ATR/nivel como tags opcionales en el propio drawer. Sin modal-wizard de 6 campos.

### 3b. Microciclos
- Grid de cards: nombre + nivel + fase ATR + 4 semanas + último editado (como ahora).
- `+ Nuevo microciclo`: nombre (sugerencia IA) + nivel + fase ATR + objetivo — **una sola vez**. Las 4 semanas HEREDAN todo; override por semana posible pero colapsado tras "Ajustes de semana" (regla: herencia es lo normal, override la excepción, invisible por defecto). El campo nombre NO se repite por semana (auto: "Semana 1", "Semana 2 (deload)"...).
- **Editor de microciclo:** board de 4 semanas en tabs (como ahora) + studio semanal de 7 columnas. Las sesiones del board se editan con el MISMO drawer de sesión. Drag-drop desde un rail lateral de biblioteca (sesiones filtradas por la fase ATR del microciclo, sugeridas primero).
- `Asignar a atleta` desde el header → flujo único §5.

---

## 4. EDITOR DE PRESCRIPCIÓN — herramienta de coach, no formulario de BD

Vive SIEMPRE inline dentro del drawer de sesión (expandir fila de ejercicio). El modelo de datos actual (modality × scheme × measure × target) se conserva intacto; cambia el input:

- **Lectura = lenguaje natural:** "5×5 @ 75% RM · descanso 2'" / "4×1000m @ 4:10/km · r2'" / "AMRAP 12' — 10 cal row + 8 burpees".
- **Al expandir:** fila de **presets** (chips, 1 click): por modalidad fuerza → `5×5 @ 70%` `4×8 @ RPE8` `3×3 @ 90%`; run → `4×1000m umbral` `6×400m` `Z2 45'`; erg → `3×3' RPE8 r2'`... + los últimos usados del coach.
- **Defaults inteligentes:** eliges modalidad (segmented: Fuerza · Run · Row · Ski · Bike · Funcional · Core · Movilidad) → esquema/medida/target se preconfiguran al estándar de esa modalidad (Run → distancia+ritmo; Fuerza → series con reps+%RM+descanso). Los dropdowns de "esquema/medida/target" desaparecen como vocabulario: aparecen campos ya etiquetados en natural ("Distancia", "Ritmo objetivo", "Descanso").
- **Tabla por serie:** colapsada por defecto ("3 series iguales"); `Variar por serie` la expande. Quick-fill se conserva.
- Validación inline en el momento (no al guardar): combinaciones imposibles ni se ofrecen (el selector de target solo muestra targets válidos para la medida elegida).

---

## 5. ASIGNAR & PUBLICAR — un único flujo

Un solo componente `AssignFlow`, invocable desde: ficha del atleta (CTA header / empty state) y editor de microciclo (botón Asignar). Siempre idéntico:

1. **Selección:** atleta (preseleccionado si vienes de la ficha) + microciclo (preseleccionado si vienes del editor) + lunes de inicio (default próximo lunes; el picker solo permite lunes).
2. **Preview SIEMPRE:** calendario real semana a semana (lo que ya hace publish-preview) + resumen "23 sesiones · 12 may – 8 jun · fase Acumulación".
3. **Confirmación explícita:** botón `Publicar a [nombre]` + subtexto "El atleta lo verá inmediatamente en su móvil". Sin auto-publish.
4. Éxito: toast "Publicado · 23 sesiones del 12 may al 8 jun" + link "Ver calendario".

---

## 6. Estados, copy y accesibilidad (transversal)

- Copy en castellano, tono directo de coach ("Aprobar", "Ajustar", "Publicar a María"), nunca jerga interna (no "asignación materializada", no "instanciar").
- Todo icono-only lleva aria-label + tooltip. Focus visible (ring accent). Contraste AA sobre surfaces oscuras (ya cumplen los tokens).
- Skeletons en toda carga; errores siempre inline junto a la acción que falló, con causa + reintentar (nunca "Error al guardar" seco).
- Acciones destructivas (quitar bloque, rechazar propuesta): undo 5s en vez de confirm-modal, salvo Publicar (confirm explícito, §5).

## 7. Qué se conserva del build actual (no rediseñar)
Roster grid de atletas · autosave/undo-redo del studio · preview de publicación · prescripción Pablo read-only + overrides · tokens y tipografía del design system · drawer pattern (se generaliza como EL patrón de edición).

## 8. Mockups para sign-off
HTML estático autocontenido en `docs/design/ux-redesign/mockups/`:
- `01-hoy.html` — inbox + pulso (con estados: cola llena y vacío)
- `02-atleta.html` — ficha calendar-first, zoom Semana, drawer de sesión abierto con un ejercicio expandido (editor de prescripción visible)
- `03-programar.html` — biblioteca única (toggle Sesiones/Microciclos) + editor de microciclo
- `04-asignar.html` — AssignFlow con preview y confirmación

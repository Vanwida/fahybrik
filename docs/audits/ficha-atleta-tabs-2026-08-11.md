# Auditoría ficha del atleta (dashboard coach) — pestaña a pestaña

**Fecha:** 2026-08-11  
**Atleta de muestra en captura:** Alex (id de ficha abierta)  
**Captura:** header + pestaña Rendimiento activa; menú completo visible  
**Método:** UI + código (`web/components/v2/atleta-detalle/*`, loaders en `web/lib/dashboard/v2/atleta-detalle*`)  
**Estado:** en curso — **una pestaña hasta el 100% (audit + fix), luego la siguiente**  
**Almacén** entre compacts y entre sesiones.

### Regla de avance (mandato Alex, 11-ago)

1. Auditar la pestaña bajo la lente de producto.  
2. Decidir y **cambiar** lo que toque (no solo listar).  
3. **No se abre la siguiente pestaña** hasta que la actual esté perfecta bajo la lente (UX + circular + sin botones que mienten).  
4. La banda fija (header) se trata como prerequisito de la ficha entera: se cierra con Perfil o antes.

**Ahora:** banda fija + **Perfil & objetivos** — fixes en curso/hechos (ver log). Plan y el resto: **no se tocan** hasta Perfil 100%.

---

## Lente de producto (mandato, 11-ago)

No es un checklist técnico: es el criterio con el que se juzga cada pestaña.

1. **Mejor que cualquiera — first principles + state of the art.**  
   No copiar mediocridad. Preguntar qué *debería* ser esta superficie para un coach de élite, no qué es habitual en apps de gym.

2. **No reinventar la rueda.**  
   Patrones que el coach ya domina (Whoop, TrainingPeaks, calendar, chat, CRM) se reutilizan. La profundidad va en el dominio (prescripción, zonas, carrera, lifecycle), no en inventar navegación rara.

3. **UX manda. Sin coaches que sepan usarlo, el resto vale cero.**  
   Un dashboard lleno de opciones que el coach no entiende = roster vacío. Prioridad absoluta:
   - **Claridad** sobre exhaustividad (menos controles, todos reales).
   - **Un camino obvio** para la acción del día (no «descubre la pestaña correcta»).
   - **Cero botones que mienten** (parece hacer X y no hace nada) — es peor que no tener el botón.
   - **Lo que reclama atención se ve donde el coach ya está**, no escondido en un tab sin badge.
   - Si hay dos sitios para lo mismo, uno es espejo de solo lectura o se unifica; nunca dos escrituras ni una escritura falsa.

4. **Todo circular. Una feature suelta no vale nada.**  
   Cada dato o control tiene que **entrar y salir** del sistema: se produce en un sitio, se consume en otro, y el coach ve la cadena sin romper el hilo.  
   - Test → zonas → prescripción del plan → ejecución → feedback → re-test / ajuste.  
   - Intake → clasificación → asignación → plan vivo → publicación → app del atleta.  
   - Check-in / readiness → «a vigilar» → **acción en el plan** (no un muro de texto).  
   - Lesión → adaptar sesiones / pausa → el plan lo refleja.  
   Si algo se pinta y **no alimenta ni se alimenta de** nada (botón decorativo, panel huérfano, métrica que nadie usa para decidir), **no es feature: es ruido.** Se conecta al circuito o se quita.

**Tests de cada hallazgo:**
- *«¿un coach competente, frío, sin formación en FAHYBRID, resuelve esto en 10 segundos o se pierde?»* → si se pierde, bug de producto.
- *«¿esto cierra un círculo o cuelga suelto?»* → si cuelga, no se prioriza como “opción más”; se enchufa o se elimina.

**Consecuencia en Perfil (ya auditado):** P1–P4 no son «features incompletas» — son anti-UX y **anti-círculo**: enseñan acciones que no existen y esconden la escritura real en otra pestaña. Quitar el control muerto o enchufarlo de verdad gana a dejar el chrome.

**Consecuencia en Plan (ya auditado):** PL5 («A vigilar» sin CTA) es el arquetipo de lo suelto: la señal existe, el plan existe, **el arco no se cierra**. PL1 (missed = pendiente) rompe el círculo ejecución→scan del coach.

---

## Mapa del menú (orden real en código)

Fuente: `ATLETA_TABS` + `DetalleTabBar` (`atleta-detalle-types.ts`).

| # | Label UI | `?tab=` | Componente principal | Estado auditoría |
|---|----------|---------|----------------------|------------------|
| 0 | *(banda fija: identidad + stats + días + acciones)* | — | `DetalleHeader` + `DetalleTabBar` | **fixed** (H1–H3) |
| 1 | Perfil & objetivos | `perfil` | `InjuryPanel` + `TrainingDaysCard` + `PerfilTab` | **fixed** (P1–P9; re-verify) |
| 2 | Plan actual | `plan` | `PlanTab` | auditada — **bloqueada** hasta Perfil 100% |
| 3 | Ritmos / Zonas | `ritmos` | `RitmosZonasTab` + `ZoneCalculator` | pendiente (notas cruzadas ya) |
| 4 | Carreras | `carreras` | `CarrerasTab` | pendiente |
| 5 | Histórico | `historico` | `HistoricoTab` | pendiente |
| 6 | 1:1 | `sesiones` | `ReviewPanel` + `SessionReportsBlock` | pendiente |
| 7 | Biometría | `biometria` | `BiometriaTab` | **en curso** — objetivo Whoop/Oura coach |
| 8 | Rendimiento | `rendimiento` | `RendimientoTab` | pendiente (era la abierta en la captura) |
| 9 | Pagos | `pagos` | `PagosTab` | pendiente |
| 10 | Mensajes | `mensajes` | `MensajesTab` | pendiente |
| 11 | Del coach | `del-coach` | `DelCoachTab` | pendiente (única con badge) |

---

## 0 · Banda fija (compartida a todas las pestañas)

Cosas que se ven **siempre**, da igual la pestaña. Hallazgos aquí afectan a toda la ficha.

### Bugs / desconexiones

| ID | Severidad | Hallazgo | Evidencia |
|----|-----------|----------|-----------|
| H1 | **Alta** | **«Alta · revisar intake» no es accionable.** El status del header dice al coach que revise el intake, pero es texto plano: no hay link a `/atletas/{id}/intake`. Desde Hoy/Altas sí hay deep link; desde la ficha del atleta (donde ya estás mirándolo) no. | `DetalleHeader` pinta `status_label` sin href; intake real vive en `app/.../atletas/[id]/intake`. Captura: punto rojo + «Alta · revisar intake». |
| H2 | **Media** | **Botón «Mensaje» de la cabecera va a `/mensajes` genérico**, no al hilo de este atleta ni a `?tab=mensajes` de la ficha. Pierde contexto: el coach sale de la ficha a la bandeja global. | `DetalleHeader` → `HeaderAction href="/mensajes"`. La pestaña Mensajes de la ficha sí tiene el hilo (`MensajesTab` + `chat.thread_id`). |
| H3 | **Baja** | **Insignias de pestaña:** solo `del-coach` recibe contador (`cuantosReclaman`). Intake pendiente, tests sin resultado, lesión abierta, 1:1 due, etc. **no** se marcan en el tab bar. El coach no ve qué pestaña reclama atención sin abrirlas. | `AthleteDetalle` → `badges={{ 'del-coach': … }}` únicamente. |

### Observaciones de producto (no bug puro)

| ID | Nota |
|----|------|
| H4 | Stats de cabecera en captura: VO₂ est 44, FC reposo 60, VFC 42 — coherente con «lo que no se sabe no se pinta» (Adherencia no sale si es `—`). Bien. |
| H5 | Tira de días L–D en cabecera (`TrainingDaysStrip`): bien como cromo permanente. La tarjeta expandida vive solo en Perfil (el comentario de `TrainingDaysCard` dice «siempre visible independiente de tab» — **mentira del comentario**; solo el strip lo es). |
| H6 | Sello «Pablo dio de alta · 08 jul 2026»: bien atribuido (#43). |
| H7 | Nivel aparece dos veces visualmente: badge `N3` + sublínea «Nivel N3». Ruido menor. |

### Notas para pestañas posteriores

- Al auditar **Mensajes**: cruzar con H2 (CTA cabecera vs tab).
- Al auditar **Del coach**: único badge — ¿deberían entrar más señales?
- Al auditar **Ritmos**: el registro de resultados vive ahí, no en Perfil/Tests.

---

## 1 · Perfil & objetivos (`?tab=perfil`)

### Qué compone la pestaña (orden de render)

1. `InjuryPanel` — lesiones abiertas + histórico  
2. `TrainingDaysCard` — días reales del atleta (availability)  
3. `ClasificacionCard` — nivel + días/sem del coach (ejes de asignación)  
4. `TargetRaceCard` — carrera objetivo (fetch client aparte)  
5. Columna tests de referencia ↔ zonas derivadas (`PerfilTab`)  
6. Fuerza · 1RM  
7. `TestsPanel` — batería programada / hecha / falta resultado  

Archivos: `AthleteDetalle.tsx`, `PerfilTab.tsx`, `ClasificacionCard.tsx`, `TargetRaceCard.tsx`, `TrainingDaysCard.tsx`, `tests/TestsPanel.tsx`, `injuries/InjuryPanel.tsx`, selector `selectPerfilTab` / `buildPerfilTab`.

---

### Bugs y controles muertos (prioridad)

| ID | Severidad | Hallazgo | Detalle |
|----|-----------|----------|---------|
| P1 | **Crítica (UX mentira)** | **«Ajustar a mano» no hace nada.** Botón visible, sin `onClick`, sin modal, sin API. | `PerfilTab.tsx` ~254–260: `<button type="button">` decorativo. |
| P2 | **Crítica (UX mentira)** | **Lápiz de cada zona no hace nada.** Mismo patrón: botón con `aria-label="Ajustar …"` y cero handler. | `ObjectiveRow` ~90–97. El modelo lo admite: `adjusted` **siempre `false`** (`deriveObjectiveGroups`: «no per-band override yet»). UI de override sin backend. |
| P3 | **Alta** | **«Ver versiones (N)» no hace nada.** Muestra un número de versión pero no abre timeline. | Botón sin handler. En **Histórico** hay un panel «Versiones de perfil» con `TODO(endpoint)` que enseña *phase assignments* como proxy — **no son versiones de zona**. Doble mentira entre pestañas. |
| P4 | **Alta** | **«Falta el resultado» en Tests no tiene acción.** El estado ámbar es el único que pide trabajo al coach, y no hay «Registrar resultado» en la fila. | `TestsPanel` solo pinta `Pill`. El form real es `RegistrarResultadoForm`, montado **solo** en `RitmosZonasTab`. Coach tiene que adivinar la otra pestaña. |
| P5 | **Media** | **«Alta · revisar intake» (H1) no se repite como CTA en Perfil.** Si el coach aterriza en ficha por el roster, no hay banner «Revisar intake →» aunque sea el estado dominante. | Existe ruta `/atletas/[id]/intake`; la ficha no la enlaza. |

---

### Gaps de modelo / solapes

| ID | Hallazgo | Por qué importa |
|----|----------|-----------------|
| P6 | **Dos conceptos de «días» sin puente.** `ClasificacionCard` = días/sem que el coach fija para asignación (`training_days_per_week`). `TrainingDaysCard` = qué días marcó el atleta en la app. Pueden divergir (coach 4, atleta L-M-J-V = 4 OK; o coach 5 y atleta 3). No hay aviso de conflicto. | Asignación de secuencia usa el del coach; disponibilidad real del atleta es la otra. Fácil programar sobre días que el atleta no entrena. |
| P7 | **Zonas duplicadas entre Perfil y Ritmos/Zonas.** Perfil muestra tabla compacta de rangos desde `zone_profiles`; Ritmos es la calculadora rica + «Nuevo resultado». Misma fuente, dos UIs, y solo una tiene escritura. | Riesgo: coach «ajusta» en Perfil (roto) y no entiende que el sitio de verdad es Ritmos. |
| P8 | **«Tests de referencia» hardcodeados a 3.** Solo 5k, row 2k y back-squat 1RM en `buildPerfilTab`. Ski, bike, otros benchmarks del atleta no aparecen en la columna izquierda aunque existan en `benchmarks[]` / `zone_profiles`. | Un atleta con ski/bike calibrado se ve «pendiente» en lo que no es 5k/2k. |
| P9 | **1RM se repite.** Card de referencia «Fuerza · 1RM» (solo squat) + panel completo «Fuerza · 1RM» debajo (todos los lifts). | Ruido; el panel inferior es el útil. |
| P10 | **Carrera objetivo se carga en cliente aparte** (`GET /api/coach/athletes/{id}/races`) aunque el payload de ficha es un fan-out grande. Flash «Cargando…» y error aislado. | Menor; pero Carreras tab volverá a pedir lo mismo → ver P11 al auditar Carreras. |
| P11 | *(para Carreras)* Target en Perfil vs lista completa en tab Carreras: dos superficies del mismo ancla. Anotar al llegar a #4. |
| P12 | **Nombre de pestaña «Perfil & objetivos».** En código el comentario habla de test→objetivos (zonas). No hay objetivos de carrera (goal time está en TargetRaceCard), ni objetivos de plan, ni RPE target, etc. El «objetivo» es la zona derivada. Naming ok-ish si se entiende; confuso si se espera «goal setting». |

---

### Lo que SÍ está bien conectado

- `ClasificacionCard`: PATCH nivel + días, optimistic + `router.refresh()`.  
- `TargetRaceCard` + `SetTargetRaceModal`: set/change real.  
- `TestsPanel` → `ProgramarTestSheet` → `POST /api/coach/tests/{id}/apply`.  
- `InjuryPanel`: state machine, evolución, adaptar sesiones, sugerir pausa.  
- Zonas leídas de `athlete_zone_profiles` (no se inventan).  
- 1RM con delta vs versión anterior.  
- Empty states honestos cuando no hay zonas / no hay 1RM / no hay tests.

---

### Inventario de CTAs en Perfil

| Control | ¿Conectado? |
|---------|-------------|
| Chips nivel / días (Clasificación) | sí |
| Sugerido: N? | sí (si hay suggestion) |
| Fijar / Cambiar carrera objetivo | sí |
| Programar test | sí |
| Registrar lesión / transiciones lesión | sí (InjuryPanel) |
| Ajustar a mano | **no** |
| Lápiz por zona | **no** |
| Ver versiones | **no** |
| Falta el resultado → registrar | **no** (pill muerta) |
| Tests de referencia (cards) | solo lectura; no deep-link a registrar |
| «Alta · revisar intake» (header) | **no** clickable |

---

### Mini-mapa de archivos (Perfil)

```
AthleteDetalle.tsx          orquestación tab=perfil
DetalleHeader.tsx           banda fija (H1–H7)
PerfilTab.tsx               tests ref + zonas + 1RM + CTAs muertos (P1–P3)
ClasificacionCard.tsx       nivel/días coach
TrainingDaysCard.tsx        días reales atleta (P6)
TargetRaceCard.tsx          carrera objetivo (P10)
tests/TestsPanel.tsx        batería (P4)
tests/ProgramarTestSheet.tsx programar
injuries/InjuryPanel.tsx    lesiones
lib/.../atleta-detalle-types.ts  buildPerfilTab, deriveObjectiveGroups (P2, P8)
RitmosZonasTab.tsx          (cruzado) único sitio de RegistrarResultadoForm
HistoricoTab.tsx            (cruzado) «Versiones de perfil» TODO falso
```

---

## 2 · Plan actual (`?tab=plan`)

### Qué es (first principles)

La pregunta del coach al abrir la ficha, en este orden (lo dice el propio código):

1. **QUÉ** está siguiendo (microciclo / cadena / personal vs periodización)  
2. **QUÉ** hace hoy  
3. **CÓMO** va (adherencia, ejecución, readiness, check-in)

Es la superficie operativa del día a día. Si falla aquí, el coach no programa en la app: vuelve a WhatsApp + Excel.

Archivos: `PlanTab.tsx` (764L), `CadenaPersonalPanel`, `PlanesPersonalesPanel`, `SessionDetailDrawer`, `ComoSeEncuentraPanel`, modales personalizar/revertir/cadena, loader `athlete-plan.ts`.

---

### Lo que está bien (SOTA / no reinventar)

| Área | Por qué suma |
|------|----------------|
| Header del microciclo | Nombre real (casado por fecha, no por id roto), pills publicado/borrador/personal/programado — honestos |
| Publicar microciclo | CTA real → API → refresh; solo si hay borrador |
| Personalizar / Volver a periodización | Mutuamente excluyentes; no se enseña botón que luego falla |
| Cadena de microciclos | Misma `Espina` que ve el atleta; controles solo en nodos personales; botones imposibles no se muestran |
| Planes personales sin fecha | Separados de la cadena con fecha (un sitio de verdad por estado) |
| Sesión de hoy + drawer prescrito→hecho | Cierra el loop; drawer lee actuals reales, no inventa |
| Semana navegable + «Hoy» | Patrón calendario familiar |
| Cómo se encuentra | Check-in espejo iOS, stale dimmed, sin fake |
| Empty sin plan | CTA a Hoy (asignación) + panel planes personales (camino a medida) |
| Comentario anti-ruido | Quitaron «Mensaje» duplicado de la columna (cabecera ya lo tiene) |

Contraste con Perfil: **aquí casi no hay botones que mienten.** El propio `PlanAction` documenta: «always a real navigation».

---

### Bugs / mentiras visuales

| ID | Sev | Hallazgo | Detalle |
|----|-----|----------|---------|
| **PL1** | **Alta** | **Sesión perdida se ve como pendiente en la tira semanal.** | `mapWeekToStripDays`: solo `completed\|partial` → done; el resto (incl. `missed`, `skipped`) → `scheduled`. `WeekStripDay.state` no tiene `missed`. El coach no puede escanear la semana en busca de agujeros: un no-show parece «aún por hacer». |
| **PL2** | **Alta** | **Días multi-sesión: solo existe la primera.** | `findTodaySession` y strip usan `sessions[0]`. Segunda sesión del día (AM+PM, fuerza+carrera) invisible en «Sesión de hoy» y en la celda. En hybrid/HYROX es caso real. |
| **PL3** | **Media** | **Card «Sesión de hoy» colapsa estados.** | Todo lo que no es `completed` → pill «pendiente». `partial`, `missed`, `skipped` mienten. El drawer sí distingue; la card no. |
| **PL4** | **Media** | **«Ejecución reciente» omite parciales.** | Filtro: solo `completed \| missed`. Un partial (lo más interesante de coachear) no entra en la lista aunque `RecentRow` ya sabe pintarlo. |
| **PL5** | **Media** | **«A vigilar» es muro sin camino.** | Si readiness &lt; 55: texto «considera descargar carga» sin CTA (abrir semana, personalizar, ir al editor). Bajo la lente: el coach ve el problema y no el siguiente clic. |
| **PL6** | **Baja** | **Readiness con y sin `%`.** | Snapshot: número crudo; banner: `Readiness {n}%`. Misma métrica, dos lecturas. |

---

### Gaps de UX / carga cognitiva

| ID | Sev | Hallazgo | Por qué importa |
|----|-----|----------|-----------------|
| **PL7** | Media | **Dos «formas del plan» cuando no es personal y la cadena tiene nodos.** | Cadena (biblioteca, solo lectura) + tira «Progreso del microciclo» S1–Sn. Misma historia en dos idiomas. Para periodización pura, ¿basta una? |
| **PL8** | Media | **Barras del microciclo = compliance, no carga.** | Comentario en código: compliance como proxy de load. Label «Progreso» + % verde/rojo: el coach de periodización puede leer «carga prescrita» y es adherencia. First principles: o se llama cumplimiento o se pinta carga de verdad. |
| **PL9** | Media | **Empty «Sin plan» → solo Hoy.** | Correcto si la secuencia se asigna ahí. Si el bloqueo es clasificación/intake (H1/P5), el coach aterriza en Hoy, da vueltas, y la ficha no le dijo «revisa intake primero». Encadenar empty states con el status real. |
| **PL10** | Baja | **Tres fetches client en la pestaña** (cadena, planes personales, drawer on open). | Flash «Cargando…» en cadena. No es mentira; es fricción vs payload unificado de ficha. |
| **PL11** | Baja | **Header de ficha «Ver plan»** y estar ya en Plan. | Ruido menor si `?tab=plan` activo; el primary de cabecera no se adapta a la pestaña. |

---

### Inventario de CTAs (Plan)

| Control | ¿Conectado? |
|---------|-------------|
| Publicar microciclo | sí |
| Abrir en editor de día | sí → `/atletas/{id}/dia/{date}` |
| Personalizar plan | sí (modal → fork) |
| Volver a la periodización | sí (si aplica) |
| Cadena: añadir / editar / mover / borrar | sí (solo nodos personales) |
| Planes personales · Nuevo | sí → crea + editor microciclo |
| Celda semana → editor día | sí |
| Ver detalle (hoy / reciente) | sí → SessionDetailDrawer |
| Asignar secuencia en Hoy (empty) | sí → `/hoy` |
| A vigilar | **no** (solo texto) |

---

### Mini-mapa de archivos (Plan)

```
PlanTab.tsx                 orquestación + strip + hoy + snapshot
CadenaPersonalPanel.tsx     espina + mutaciones cadena (client fetch)
PlanesPersonalesPanel.tsx   borradores sin fecha (client fetch)
SessionDetailDrawer.tsx     prescrito→hecho (loop cerrado)
ComoSeEncuentraPanel.tsx    check-in subjetivo
PersonalizarPlanModal / VolverPeriodizacionModal
Anadir|Editar|Borrar*Cadena*
lib/dashboard/coach/athlete-plan.ts   payload weeks/sessions/macro
parts.tsx WeekStrip         estados: done|today|scheduled|rest  ← sin missed
```

---

### Veredicto bajo la lente (Plan)

Mejor pestaña que Perfil en honestidad de controles. El loop prescrito→hecho y la cadena son SOTA de producto de coaching.  
Los agujeros que **vacían coaches** no son falta de features: son **la semana que miente sobre lo perdido (PL1)** y **el día multi-sesión invisible (PL2)** — el coach deja de confiar en el scan visual y vuelve al chat.

Prioridad de arreglo si se toca esta pestaña: **PL1 → PL2 → PL3/PL4 → PL5**.

---

## Notas cruzadas ya capturadas (no redescubrir)

Al abrir **Ritmos / Zonas (#3)**:
- Es el único sitio de escritura de zonas (`RegistrarResultadoForm` + `ZoneCalculator`).
- Perfil es espejo de solo lectura con CTAs de escritura falsos.
- Pregunta de diseño: ¿Perfil debería deep-link a Ritmos / quitar CTAs / unificar?

Al abrir **Histórico (#5)**:
- «Versiones de perfil» con TODO y datos de fase, no de zonas — alinear con P3.

Al abrir **Carreras (#4)**:
- Relación TargetRaceCard (Perfil) ↔ CarrerasTab.

Al abrir **Mensajes (#10)**:
- H2 cabecera → bandeja global.

Al abrir **1:1 (#6)**:
- Tab key es `sesiones` pero label es «1:1» — naming interno vs producto.

Al abrir **Rendimiento (#8)** / **Histórico (#5)**:
- Cumplimiento / missed / partial: la tira de Plan (PL1) debe alinear semántica con lo que pinten esas pestañas (no tres definiciones de «perdida»).
- Readiness y check-in también viven en Plan (ComoSeEncuentra + A vigilar) — no duplicar paneles sin espejo.

Al abrir **empty plan / asignación**:
- PL9 + H1: el camino «sin plan» debe respetar el bloqueo real (intake vs sin secuencia vs sin nivel).

---

## Convención de severidad

- **Crítica:** control que miente (parece hacer X y no hace nada) o dato falso.  
- **Alta:** flujo roto o trabajo del coach sin camino en la superficie donde se ve el problema.  
- **Media:** gap de modelo, solape, o fricción clara.  
- **Baja:** polish, copy, duplicación visual menor.

---

## Log de pasadas

| Fecha | Pestaña | Resultado |
|-------|---------|-----------|
| 2026-08-11 | 0+1 audit | H1–H7, P1–P12 documentados |
| 2026-08-11 | 2 Plan audit (solo lectura) | PL1–PL11; **no fix hasta Perfil 100%** |
| 2026-08-11 | **0+1 FIX** | Ver tabla de cierres abajo |

### Cierres 0+1 (2026-08-11)

| ID | Decisión | Qué se hizo |
|----|----------|-------------|
| H1 | Enchufar | `status === 'alta'` → link a `/atletas/{id}/intake` en sublínea |
| H2 | Enchufar | «Mensaje» → `?tab=mensajes` de este atleta (no bandeja global) |
| H3 | Parcial | Badge en **perfil** = intake + tests sin resultado; Del coach igual |
| P1–P3 | Quitar mentira | Fuera «Ajustar a mano», lápices, «Ver versiones». Pill `vN` si hay versión. Link real a Ritmos |
| P4 | Enchufar | Fila «Falta el resultado» → botón **Registrar** → `?tab=ritmos` |
| P5 | Enchufar | Banner CTA «Revisar intake» al tope de Perfil si status alta |
| P6 | Avisar | Si días reales ≠ días Clasificación → warning en TrainingDaysCard |
| P7 | Clarificar | Zonas en Perfil = espejo RO + CTA a calculadora |
| P8 | Ampliar | Anclas 5k / row 2k / ski 1k + resto de benchmarks con resultado |
| P9 | Quitar dupe | 1RM solo en panel Fuerza (no en tests de referencia) |
| P10–P12 | Diferido | Fetch carrera cliente / naming — no bloquean honestidad de controles |

**Pendiente re-verify en browser** antes de declarar Perfil 100% y pasar a Plan.
)

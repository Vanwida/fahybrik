# Auditoría ficha del atleta (dashboard coach) — pestaña a pestaña

**Fecha:** 2026-08-11  
**Atleta de muestra en captura:** Alex (id de ficha abierta)  
**Captura:** header + pestaña Rendimiento activa; menú completo visible  
**Método:** UI + código (`web/components/v2/atleta-detalle/*`, loaders en `web/lib/dashboard/v2/atleta-detalle*`)  
**Estado:** en curso — una pestaña por pasada; este doc es el almacén entre compacts

---

## Mapa del menú (orden real en código)

Fuente: `ATLETA_TABS` + `DetalleTabBar` (`atleta-detalle-types.ts`).

| # | Label UI | `?tab=` | Componente principal | Estado auditoría |
|---|----------|---------|----------------------|------------------|
| 0 | *(banda fija: identidad + stats + días + acciones)* | — | `DetalleHeader` + `DetalleTabBar` | hecha (compartida) |
| 1 | Perfil & objetivos | `perfil` | `InjuryPanel` + `TrainingDaysCard` + `PerfilTab` | **hecha** |
| 2 | Plan actual | `plan` | `PlanTab` | pendiente |
| 3 | Ritmos / Zonas | `ritmos` | `RitmosZonasTab` + `ZoneCalculator` | pendiente (notas cruzadas ya) |
| 4 | Carreras | `carreras` | `CarrerasTab` | pendiente |
| 5 | Histórico | `historico` | `HistoricoTab` | pendiente |
| 6 | 1:1 | `sesiones` | `ReviewPanel` + `SessionReportsBlock` | pendiente |
| 7 | Biometría | `biometria` | `BiometriaTab` | pendiente |
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
| 2026-08-11 | 0 Banda fija + 1 Perfil | H1–H7, P1–P12 documentados; sin fixes (solo auditoría) |
| — | 2 Plan actual | pendiente |
)

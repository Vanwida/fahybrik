# Auditoría UI/UX — Apple Watch (card 105)

**Fecha:** 2026-08-28  
**Alcance:** solo auditoría de código; sin rediseño ni cambios de producto.  
**Excluido explícitamente:** pause/finish (176), metros (101), reloj 4:00 (67), tap-cambia-ronda (72), session sync (157).  
**Atleta de referencia:** id 64 (Alex).  
**Método:** recorrido del flujo del atleta como depurador, leyendo `ios/FAHYBRIKWatch/` + motor compartido `WorkoutSession`.

---

## 1. Resumen ejecutivo

El reloj **sí puede arrancar, registrar y cerrar** un entreno completo en standalone (HealthKit + motor compartido + outbox al iPhone). La arquitectura de navegación es coherente: **pantalla viva central + swipe al mapa y a pausa/terminar**.

El fallo principal para un **corredor en Chipper** (carrera + estaciones de peso corporal) no es de motor sino de **presentación**: el iPhone ya distingue una **ruta por estaciones** (`fixedListIsStations`) y pinta estación, dosis y lista de tachado; el reloj standalone **aplana todo a “Ronda X/Y + cronómetro + Ronda hecha”** y no enseña distancia, ritmo, tiempo restante de cap ni qué estación toca.

Curiosamente, el **modo espejo** (iPhone manda frames) **sí** lee `currentTramo` / `isStationTramo` y muestra la estación en curso. El standalone no reutiliza esa lógica en `FixedLiveView`.

---

## 2. Máquina de estados (flujo del atleta)

```
Sin payload (iPhone no ha empujado el día)
  → EmptyStateView

Día completado
  → ReadinessGlanceView (si hay score) + DoneStateView

Día de sesión, snapshot de crash fresco
  → ResumeOfferView → reanudar | descartar

Día de sesión, normal
  → ReadinessGlanceView (opcional) + TodayBriefView → Empezar

Empezar
  → WatchWorkoutCoordinator.start → phase .active → LiveFlowView

Durante el entreno (LiveFlowView, TabView horizontal)
  Página 0: SessionMapView (mapa de bloques)
  Página 1: área viva (gate | familia de HUD | overlay descanso)
  Página 2: PauseFinishPage

Entre bloques
  → BlockGateView (“Empezar bloque”) — engine en isAwaitingBlockStart

Fin natural o Terminar
  → phase .finished → SummaryView [+ SplitsView si ≥2 laps medidos] → Listo → DoneStateView

Paralelo: si el iPhone lanza mirror
  → MirrorHUDView sustituye TODO el contenido idle/live (no convive con standalone activo)
```

**Arranque real:** `TodayBriefView` → `coordinator.start` → primer bloque en **gate** (no entra directo al esfuerzo). El atleta confirma con “Empezar bloque”.

---

## 3. Inventario de pantallas

| Pantalla | Archivo | Cuándo aparece | ¿Usada en Chipper típico? |
|----------|---------|----------------|---------------------------|
| EmptyStateView | RootView | Sin plan empujado | No (si hay sync) |
| ReadinessGlanceView | ReadinessGlanceView | Score en payload | Sí (pre) |
| TodayBriefView | TodayBriefView | Pre-entreno | Sí |
| ResumeOfferView | RootView | Crash ≤6 h | Ocasional |
| DoneStateView | RootView | Día hecho | Post |
| **MirrorHUDView** | MirrorHUDView | iPhone espejo | Solo si entrena desde iPhone |
| **BlockGateView** | BlockGateView | Entre bloques | Sí, cada bloque |
| **SessionMapView** | SessionMapView | Swipe derecha en live | Opcional |
| **PauseFinishPage** | PauseFinishPage | Swipe izquierda | Opcional (fuera de alcance de cambio) |
| **RestBannerView** | RestBannerView | Overlay descanso fuerza | Solo si hay descanso entre series |
| RelayLiveView | LiveFlowView | Dobles HYROX relevo | No (salvo dobles) |
| **StructuredRunLiveView** | StructuredRunLiveView | Bloque carrera con `structure` | **Sí** si el run es bloque estructurado aparte |
| **FixedLiveView** | FixedLiveView | AMRAP / For Time / **Chipper** / Ladder / Rounds | **Sí** — HUD principal del Chipper |
| FixedLiveView (hyroxSim) | FixedLiveView | Sim HYROX | Variante con nombre de estación + transición |
| RotatingLiveView | RotatingLiveView | EMOM / Tabata / Intervals / Death By | No |
| ContinuousLiveView | ContinuousLiveView | Rodaje continuo sin estructura | Solo tramo `.running` suelto |
| SetTableLiveView | SetTableLiveView | Fuerza multi-serie | No en chipper BW |
| ChecklistLiveView | ChecklistLiveView | Calentamiento / vuelta lista | Si el plan lleva bloque lista |
| GenericLiveView | LiveFlowView | Segmento libre sin familia | Fallback raro |
| **SummaryView** | SummaryView | Post-entreno | Sí |
| **SplitsView** | SplitsView | Post si ≥2 laps | A veces (ver §6) |

**Pantallas “muertas” para Chipper run+BW:** RotatingLiveView, SetTableLiveView, ContinuousLiveView (si el chipper es un solo bloque fixed), RelayLiveView.

**Pantalla infrautilizada:** SessionMapView existe pero no sustituye la falta de “qué estación toca” dentro del bloque.

---

## 4. Recorrido concreto: Chipper con carrera + estaciones BW

### 4.1 Caso A — Un solo bloque Chipper (lista de estaciones: run 1 km → burpees → …)

1. **Pre:** TodayBrief muestra título, N bloques, duración prevista, hint del 1.er bloque. No lista estaciones.
2. **Empezar** → gate del bloque: nombre, chips derivados de `previewWorkLine` (p. ej. troceado por `·`), botón “Empezar bloque”.
3. **Count-in 3-2-1** (`condCountInRemaining`): pantalla naranja “Prepárate” — igual que For Time.
4. **Vivo:** `LiveFlowView` enruta a **`FixedLiveView.forTime`** porque `formatScheme == .chipper` y no es `hyroxSim`.

   **Lo que ve el atleta:**
   - Status: `Chipper · N rondas` (usa `formatRounds` si existe; si no, solo “Chipper”).
   - Hero: **cronómetro ascendente** (`condElapsed`) — tiempo total del bloque.
   - Subtítulo: **“Ronda X / Y”** — el motor cuenta **estaciones** (`fixedListTotal` = `components.count`) pero la UI dice **“Ronda”**.
   - HR pill.
   - Botón: **“Ronda hecha”** → `markRoundDone()` (correcto en motor; etiqueta incorrecta para chipper).

   **Lo que NO ve:**
   - Nombre de la estación actual (p. ej. “Correr”, “Burpees”).
   - Dosis (1 km, 20 reps) — está en `currentTramo.workLine` en el motor, no se pinta.
   - Distancia cubierta / ritmo en el tramo de carrera dentro del chipper.
   - Metros que faltan del km.
   - Tiempo en esta estación (`tramoElapsedSeconds`).
   - Lista de estaciones / qué falta.
   - Parcial del último tramo.
   - Cuenta atrás de **time cap** (el motor sí hace `tickDeadline`; la UI no muestra “queda” del cap).
   - Progreso “ESTACIÓN 3/8” (el iPhone sí: `liveProgressText`).

5. **Avance:** cada tap incrementa `fixedRoundsDone`. En estación de **reps**, el motor **no** auto-avanza (correcto). En estación de **metros con ergo**, el motor podría auto-cerrar; en **run GPS dentro del chipper**, el tramo es `.run` pero **no** se enruta a `ContinuousLiveView` ni `StructuredRunLiveView` — sigue el HUD genérico de For Time.

6. **Entre bloques:** no aplica (un solo bloque).

7. **Fin:** SummaryView — tiempo total, tile rondas/bloques, FC media si hubo pulso. SplitsView solo si hay ≥2 `LapRecord` no estructurales; en chipper las vueltas pueden quedar **dentro de un solo lap de segmento**, así que **splits post pueden no aparecer** aunque el atleta tachó 8 estaciones.

### 4.2 Caso B — Bloque carrera estructurada + bloque Chipper

1. Bloque 1 → gate → **`StructuredRunLiveView`**: tramo N/M, ritmo o tiempo de tramo, barra distancia/tiempo, objetivo, “Tramo hecho”. **Este sí es usable para correr.**
2. Bloque 2 → gate → **`FixedLiveView`** como en 4.1 — **caída brusca de información** al entrar al chipper.

### 4.3 Modo espejo (iPhone en mano/bolsillo)

Si el atleta entrena con el iPhone y el reloj en mirror, `PhoneMirrorService.buildFrame` usa `isStationTramo` y envía `lineTitle` + `detailLine` de `currentTramo`. El reloj muestra **estación + trabajo**. **No es el standalone.**

---

## 5. Qué no encaja (incoherencias)

| # | Observación | Evidencia |
|---|-------------|-----------|
| 1 | Chipper usa copy de **ronda** en vez de **estación** | `FixedLiveView` L75-89; iPhone usa `listUnitLabel` “Estación” en `WorkoutFormatHUDs.swift` L443 |
| 2 | Motor sabe la estación (`fixedListIsStations`, `currentTramo`); **UI standalone ignora** | `WorkoutSession+Tramo.swift` L64-68; `FixedLiveView` no lee `currentTramo` |
| 3 | **HYROX sim** en el mismo `FixedLiveView` sí muestra nombre de componente + interstitial; **chipper no** | `FixedLiveView.hyroxSim` vs `forTime` |
| 4 | Espejo ≠ standalone para la misma sesión | `PhoneMirrorService.swift` L317-327 vs `FixedLiveView` |
| 5 | Carrera **dentro** del chipper no activa HUD de ritmo/distancia | `LiveFlowView` L67-72 solo `isRunStructureActive`; chipper station run no |
| 6 | Time cap invisible en muñeca | `tickDeadline` en motor; sin hero de “queda” en `FixedLiveView` |
| 7 | `SessionMapView` salta **bloques**, no estaciones dentro del WOD | `SessionMapView.swift` |
| 8 | `unmarkLastRound()` existe en motor; **sin UI** en reloj para deshacer tachado | `WorkoutSession.swift` L1494 |
| 9 | Post-entreno: splits por **lap de segmento**, no por estación chipper | `SplitsView` lee `session.laps`, no `fixedRoundSplits` (ya borrados al cerrar) |
| 10 | Brief pre-entreno no anticipa la ruta del chipper | `TodayBriefView` solo hint del 1.er bloque |

---

## 6. Datos de corredor: qué falta en la muñeca

Durante un **Chipper con tramos de carrera** (caso típico híbrido, atleta 64):

| Dato | Motor / HK | ¿Visible standalone? | Notas |
|------|------------|----------------------|-------|
| Tiempo total bloque | `condElapsed` | **Sí** (hero) | Es la puntuación For Time — correcto como ancla |
| Tiempo en estación actual | `tramoElapsedSeconds` | **No** | iPhone: “llevas X en esta estación” |
| Estación actual (nombre) | `currentTramo.label` | **No** | Espejo sí |
| Dosis (1 km, 15 cal…) | `currentTramo.workLine` | **No** | |
| Posición en ruta (3/8) | `fixedRoundsDone+1` / `fixedListTotal` | **Parcial** — dice “Ronda” | Debería leer “Estación” |
| Distancia cubierta (run) | `liveRunDistanceMeters` / GPS vía HK | **No** en chipper | Sí en `StructuredRunLiveView` o `ContinuousLiveView` |
| Ritmo /km | `liveCoveredPaceSecPerKm` / `legPace` | **No** en chipper | |
| Metros que faltan | derivable de tramo + GPS | **No** | Diseño twin `watch-fortime` ya modela esta página |
| Time cap restante | `formatTotalSeconds - condElapsed` | **No** | Urgencia del último minuto invisible |
| Parcial última estación | `fixedRoundSplits` | **No** en vivo | iPhone muestra en strip |
| FC / zona | `liveHRBpm`, `liveZone` | **Sí** (pill o strip) | No es protagonista en carrera |
| Ronda AMRAP-style reps parciales | N/A en chipper | — | |

**Conclusión corredor:** en Chipper standalone el atleta **solo** tiene confianza en el cronómetro global y un contador mal etiquetado. **No puede orientarse por la muñeca** en: qué toca, cuánto le queda de carrera, a qué ritmo va, ni cuánto margen queda de cap.

---

## 7. Qué el atleta sí puede hacer (gestos)

- Iniciar / reanudar desde brief o recovery.
- Confirmar cada estación con **“Ronda hecha”** (tacto único durante esfuerzo — acorde a `LiveFlowView` diseño “un botón”).
- Swipe a mapa de bloques y saltar bloque (con confirmación si hay progreso).
- Swipe a pausar / siguiente bloque / terminar (card 176 — no auditado en detalle).
- En bloque carrera estructurado: “Tramo hecho”, saltar descanso, ver barra de metros.
- Crown ± carga solo en `SetTableLiveView` (no chipper BW).
- Post: toggle dobles share, “Listo”.

**No puede:** deshacer estación, ver lista de estaciones, tachar desde lista, ni auto-avance visual cuando el GPS cierra metros (el motor puede `markRoundDone(auto:)` — sin feedback distinto en UI standalone).

---

## 8. Comparación con iPhone (misma sesión, mismo motor)

El iPhone, para `fixedListIsStations`:
- `ForTimeContextStrip` — formato + estación X/Y + reloj bloque permanente.
- `StationSubject` — dosis grande + tiempo en estación.
- `StrikeList` — lista completa, línea activa, tap para tachar, long-press deshacer.
- Botón **“ESTACIÓN HECHA”** (`ActiveWorkoutView` L1229-1232).

El reloj implementó la familia **Fixed** en `FixedLiveView` como subconjunto **pre-ruta** (reloj + contador + botón), y reservó la UX rica de estaciones al **espejo** y al **teléfono**.

El design twin (`web/components/design-twin/screens/watch-fortime/`) ya documenta el hallazgo: For Time/Chipper es el formato donde el reloj sabe menos; propone páginas **crono** + **tramo** (metros que faltan) en tramos medidos, y modo **ciego** en estaciones BW.

---

## 9. Riesgos de producto (multi-coach, miles de coaches)

- Cualquier coach que prescriba **chipper / for-time por estaciones** obtiene la **misma UX pobre** — no es bug de contenido de Pablo.
- Atletas que entrenan **solo con el reloj** (sin iPhone en mirror) están en la peor variante.
- La divergencia espejo/standalone puede confundir en pruebas internas (“en mirror se ve bien, en standalone no”).

---

## 10. Fuera de alcance pero anotado

- Audio 3-2-1 / ticks (`WorkoutAudio`) — no es copy hablado; no entra en card 171.
- HealthKit `locationType = .unknown` — puede afectar precisión GPS (no auditado en profundidad).
- Payload summary-only si `detailJson` supera tamaño — fallback minimal sin targets.

---

## 11. Handoff para mockup (Opus / runner)

**Un solo mockup pedido:** corredor en **Chipper standalone**, estación de **carrera medible** (p. ej. 1 km), a ~mid-tramo, con:
- ancla de **tiempo total** (puntuación),
- **estación X/Y** con copy correcto,
- **metros que faltan** o ritmo (la medida que el motor ya tiene),
- gesto de cierre de estación sin competir con el hero.

No rediseñar pause/finish, metros globales de sesión, tap-cambia-ronda ni sync.

---

## 12. Dónde aterrizó (28-ago) — el círculo cerrado

La respuesta NO es una vista de reloj más: es **una interfaz de corredor con dos
superficies**, cuyo modelo vive en un solo fichero que las dos importan
(`web/components/design-twin/screens/corredor/guion.ts`). Así el hallazgo §5.4
(espejo ≠ standalone) deja de poder repetirse: no hay dos sitios donde decidir
qué se enseña.

| Se abre en | Qué es |
|---|---|
| `/es/design/corredor` | El corredor · iPhone |
| `/es/design/watch-corredor` | El corredor · muñeca |

Los cuatro escenarios (`estacion-carrera`, `cap-encima`, `estacion-ciega`,
`sin-senal`) son los mismos en las dos: abrir el mismo escenario en las dos URLs
enseña el mismo instante.

**Qué queda contestado de esta auditoría:** §5.1 (copy «Ronda» → estación) ·
§5.2 y §6 (estación, dosis, metros que faltan, ritmo, tiempo de estación y
parcial anterior, todos en la muñeca) · §5.4 (convergencia por construcción) ·
§5.5 (una carrera dentro del chipper SÍ activa metros y ritmo) · §5.6 (el
`time_cap` se ve, y se enciende en los últimos 30 s) · §5.7 (la ruta de
estaciones va en el bisel y en la cinta del móvil). Y el fallo del iPhone que
motivó la card —«sin medir» con el GPS fuerte— se arregla en la raíz: la medida
pasa a tener tres estados y el cero es un dato.

**Qué NO toca, a propósito:** pausa/terminar (176), metros de sesión (101),
reloj 4:00 (67), tap-cambia-ronda (72) y sync (157). El velo de pausa del móvil
enseña dónde caen las de la 176 sin dibujarlas.

Razonamiento y consecuencias: `docs/DECISIONS.md`, entrada del 2026-08-28.

---

*Auditoría generada por recorrido de código. Sin ejecución de suite como prueba.*

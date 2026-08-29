# Apple ya lo hace — auditoría live run iOS + Watch

**Fecha:** 29 ago 2026 · **Autor:** Alex Sole  
**Alcance:** solo lectura · `ios/` · sesión en vivo (carrera + reloj)  
**Barra:** no reinventar lo que Apple ya trae en HealthKit, WorkoutKit, CoreLocation y watchOS.

Este documento compara lo que Apple ofrece para una app de correr con lo que FAHYBRID construyó a mano. No propone parches ni código nuevo.

---

## 1. Clase: qué da Apple a una app de correr

### Una sola sesión de entrenamiento

Apple quiere **un dueño** del entrenamiento entre iPhone y Apple Watch:

| Pieza Apple | Qué hace por ti |
|-------------|-----------------|
| `HKWorkoutSession` | Abre, pausa, reanuda y cierra **un** entrenamiento. El reloj puede grabar; el teléfono puede conducir o espejar. |
| `HKLiveWorkoutBuilder` | Recoge en vivo pulso, calorías, distancia y ritmo. Escribe el `HKWorkout` final en Salud. |
| `HKLiveWorkoutDataSource` | Conecta sensores del reloj al builder sin que tú pulses un timer cada cuarto de segundo. |
| Espejo HK (`startMirroringToCompanionDevice`) | El teléfono conduce; el reloj **graba** y muestra datos. Un canal de datos entre los dos, no un segundo motor. |
| `HKWorkoutRouteBuilder` | Guarda la ruta GPS del entrenamiento en Salud (polyline oficial, no un string propio). |
| `HKQuantityType` (distancia, pulso, ritmo) | Tipos estándar para métricas; las analíticas y Salud ya los entienden. |

### Carrera estructurada en la app Entrenamiento

| Pieza Apple | Qué hace por ti |
|-------------|-----------------|
| `WorkoutKit.CustomWorkout` | Intervalos, calentamiento, recuperación, alertas de ritmo/zona — como pasos nativos en el reloj. |
| `WorkoutKit.WorkoutPlan` + `ScheduledWorkout` | Programa entrenamientos en la app Entrenamiento del reloj (±7 días). El atleta levanta la muñeca y pulsa empezar. |
| `WorkoutScheduler` | Sincroniza, retira viejos, respeta el cupo del sistema. |

### Mapa y ubicación

| Pieza Apple | Qué hace por ti |
|-------------|-----------------|
| `CLLocationManager` | Posición, velocidad, precisión. Ya lo usamos para el mapa en vivo. |
| Ruta vía HealthKit | `HKWorkoutRouteBuilder` une ubicación + sesión; no hace falta un codec de polyline propio para Salud. |

### Interfaz en el reloj

| Pieza Apple | Qué hace por ti |
|-------------|-----------------|
| `TabView` con `.tabViewStyle(.page)` | Páginas con swipe y corona digital — **estables**, no se recrean cada tick. |
| `HKWorkoutSession` en segundo plano | Con `workout-processing` el entrenamiento sigue con la muñeca abajo; no hace falta `WKExtendedRuntimeSession` si ya hay sesión HK activa. |
| App Entrenamiento nativa | Para carrera pura: pantallas de ritmo, distancia, zonas, intervalos y recuperación ya diseñadas y probadas por millones de usuarios. |

### Qué NO da Apple (y por eso existe nuestra app)

- Plan del coach con fuerza, EMOM, AMRAP, estaciones HYROX, dobles, checklist, cargas con corona.
- Multi-tenant (miles de coaches, cada uno con su metodología).
- Sincronización con nuestro backend, asignaciones, RPE, tramos medidos, analíticas del producto.
- Cinta con BLE, PM5, audio coach con reglas del método, Live Activity con copy de FAHYBRID.

---

## 2. Qué inventó FAHYBRID en su lugar

### Relojes duplicados (el problema raíz)

Hoy hay **varios relojes** que no comparten la misma fuente de verdad:

| Reloj propio | Cadencia | Archivo | Para qué |
|--------------|----------|---------|----------|
| Motor `WorkoutSession` | 0,25 s | `WorkoutSession.swift` | Countdowns, EMOM, descansos, estructura de carrera, zonas, audio |
| Display HK en muñeca | 1 s | `LiveWorkoutSession.swift` | `elapsedSeconds` publicado (aparte del builder) |
| Frames espejo teléfono → reloj | 1 s | `PhoneMirrorService.swift` | Snapshots JSON del estado del motor |
| HUD espejo en muñeca | 1 s | `MirrorHUDView.swift` (`TimelineView`) | Re-calcular tiempo entre frames |
| Outdoor en teléfono | 0,5 s | `OutdoorRunHUDModel.swift` | Ritmo, auto-pausa, cierre de tramo |
| Tramo distancia en muñeca | 0,5 s | `WatchRunLegDriver.swift` | Cerrar tramo cuando HK dice que llegaste |
| Cinta | 0,5 s + 1 s | `TreadmillHUDModel.swift` | Igual que outdoor pero con BLE |

Apple da **un** reloj: el de `HKWorkoutSession` + estadísticas del `HKLiveWorkoutBuilder`. Nosotros añadimos encima un motor de 0,25 s y varios timers de display que hay que sincronizar a mano.

### Dos formatos de countdown porque hay dos dueños

`CountdownFormat.swift` tiene dos funciones (`standalone` con redondeo hacia arriba, `mirrored` con redondeo normal) **solo** porque el reloj y el teléfono no comparten el mismo tick. Eso es síntoma, no diseño.

### Ruta GPS inventada

- `RunLocationProvider` + `PolylineCodec` + `session.capturedRoutePolyline` guardan la ruta como string propio.
- **No hay** `HKWorkoutRouteBuilder` en todo el repo.
- La ruta vive en nuestro payload de ejecución, no en el modelo de Salud que Apple documenta.

### Sesión en muñeca = segundo motor completo

`WatchWorkoutCoordinator` instancia `WorkoutSession` **y** `LiveWorkoutSession` en el reloj. El reloj corre el plan entero (timers, tramos, descansos, HUD por formato) aunque Apple ya ofrece:

1. Espejo HK (teléfono conduce, reloj graba) — **ya lo tenemos** en `PhoneMirrorService` + `MirrorSessionController`.
2. WorkoutKit (carrera estructurada nativa en Entrenamiento) — **ya lo tenemos** en `AppleWorkoutMapper` + `AppleWatchWorkoutScheduler`.

Para carrera pura, el camino standalone duplica lo que Apple ya resuelve.

### Protocolo espejo JSON pesado

`MirrorWireModels` + `PhoneMirrorService` empujan frames con títulos, fase, countdown, descanso, dobles, cinta… a 1 Hz. El reloj pinta un HUD entero (`MirrorHUDView`) que **reconstruye** el reloj localmente con `TimelineView` entre frames.

Apple en espejo HK espera: sesión compartida + métricas del builder + datos mínimos de control. Nosotros serializamos medio plan en cada frame.

### HUD que pinta el plan a mano

En muñeca standalone:

- `LiveFlowView` → `StructuredRunLiveView`, `ContinuousLiveView`, `RotatingLiveView`, `FixedLiveView`, `SetTableLiveView`…
- Cada familia lee `WorkoutSession` en cada tick del motor (0,25 s vía `@Observable`).

En carrera nativa de Apple, el plan ya está en `CustomWorkout`; la UI de Entrenamiento avanza sola por pasos.

### Overlay de descanso de gym

- Teléfono: `RestSurface.swift` (pantalla azul completa entre intervalos).
- Reloj: `RestBannerView.swift` (verde entre series de fuerza).
- Espejo: `MirrorHUDView.restOverlay`.

Apple no tiene descanso entre series de sentadilla en Entrenamiento — **eso sí es nuestro**. Pero para **recuperación entre intervalos de carrera**, WorkoutKit ya modela pasos de recovery; no hace falta un countdown paralelo.

### Métricas de carrera reimplementadas

| Invento nuestro | Qué hace Apple |
|-----------------|----------------|
| `RunPaceSmoother` | Ritmo desde estadísticas del builder / velocidad GPS filtrada por el sistema |
| `RunAutoPause` | Auto-pausa en app Entrenamiento y en sesión HK al detectar parada |
| `WatchRunLegDriver` + `RunLegProgress` | Pasos de `CustomWorkout` con metas de distancia/tiempo nativas |
| `LiveHeartRateProvider` en teléfono | Builder espejado o consulta HK estándar mientras el reloj graba |

### Lo que ya hacemos bien (no tocar en esta auditoría)

- `LiveWorkoutSession` y `MirrorSessionController` usan `HKWorkoutSession` + `HKLiveWorkoutBuilder` + `HKLiveWorkoutDataSource`.
- Espejo HK por canal de Salud, no por WatchConnectivity (`PhoneMirrorService`, `MirrorWireModels`).
- WorkoutKit para programar carreras en Entrenamiento (`AppleWorkoutMapper`, `AppleWatchWorkoutScheduler`).
- WatchConnectivity solo para plan del día y resultado terminado (`WatchWireModels`).
- `HealthKitWorkoutWriter` no escribe si el reloj ya grabó (`wristRecordedWorkout`).
- `LiveFlowView` usa `TabView` estable; el driver de tramos vive en el coordinator, no en la vista (bien para paging).

---

## 3. Lista ordenada: qué borrar y qué lo sustituye

Orden = primero lo que quita deuda sin romper fuerza/HYROX. **La mejor parte es ninguna parte.**

| # | Borrar o reducir | Sustituto Apple | Notas |
|---|------------------|-----------------|-------|
| 1 | **`LiveWorkoutSession.tickTimer`** (reloj 1 s de `elapsedSeconds`) | Estadísticas de `HKLiveWorkoutBuilder` + estado de `HKWorkoutSession` | Hoy duplica lo que el builder ya publica. |
| 2 | **Ruta propia** (`PolylineCodec`, `capturedRoutePolyline` como fuente de verdad en Salud) | `HKWorkoutRouteBuilder` alimentado por `CLLocationManager` | Mantener polyline en payload API si el backend lo necesita, pero **generarlo desde la ruta HK**, no en paralelo. |
| 3 | **`WatchRunLegDriver`** (timer 0,5 s que cierra tramos por distancia HK) | Pasos de distancia en `CustomWorkout` (WorkoutKit) **o** eventos del builder en espejo | Solo aplica a carrera estructurada; fuerza sigue en nuestro motor. |
| 4 | **Modo standalone en reloj para sesiones que son solo RUN** | `ScheduledWorkout` + app Entrenamiento **o** espejo HK obligatorio desde iPhone | El coordinator completo (`WorkoutSession` en muñeca) sobra cuando el plan cabe en WorkoutKit. |
| 5 | **Frames JSON densos de espejo** (`MirrorStateFrame` con countdown, rest, títulos duplicados) | Canal HK espejo + métricas del builder + **comandos mínimos** (avanzar, pausar) | El HUD del reloj en espejo debería mostrar pulso/ritmo/distancia del builder; el plan rico queda en el teléfono. |
| 6 | **`TimelineView` cada 1 s en `MirrorHUDView`** para relojes | Una sola fuente: builder o timestamp del frame estructural sin re-tick local | Síntoma del punto 5; al reducir frames, desaparece la necesidad. |
| 7 | **`CountdownFormat` dual** (standalone vs mirrored) | Un solo dueño del tiempo: o WorkoutKit, o `HKWorkoutSession`, o el motor del teléfono en espejo — no los tres | Se elimina al unificar dueño (punto 4–5). |
| 8 | **`OutdoorRunHUDModel.displayTimer`** para distancia/ritmo en carrera continua outdoor | `HKLiveWorkoutBuilder` (espejo) o sesión única en reloj | Mantener `CLLocationManager` para **mapa en pantalla**; no para competir con el builder en métricas oficiales. |
| 9 | **`RunPaceSmoother` + parte de `RunAutoPause`** en carrera simple | Comportamiento de app Entrenamiento / estadísticas HK | Valorar mantener auto-pausa solo donde Apple no cubre (cinta BLE, sesión híbrida con fuerza). |
| 10 | **`LiveHeartRateProvider` como camino principal en teléfono** cuando el reloj está grabando | Pulso del `HKLiveWorkoutBuilder` espejado | Ya mitigado con `wristJoined`; el siguiente paso es no leer HK en paralelo. |
| 11 | **HUD de carrera estructurada en muñeca** (`StructuredRunLiveView` + familia continuous) **cuando WorkoutKit ya programó el run** | UI nativa Entrenamiento | Nuestro HUD solo cuando el formato **no** cabe en WorkoutKit (HYROX, mixto). |
| 12 | **Timer maestro 0,25 s del motor** — solo para **segmentos RUN** | Pasos WorkoutKit o builder HK | **No borrar** el 0,25 s para EMOM, Tabata, fuerza, estaciones; **sí** dejar de usarlo como reloj de carrera cuando Apple ya lleva el paso. |

### Qué NO entra en la lista de borrado

- `WorkoutSession` completo para formatos no-run (fuerza, EMOM, AMRAP, HYROX, dobles, checklist).
- `RestSurface` / `RestBannerView` para descanso entre series de gym (Apple no lo tiene).
- `AppleWorkoutMapper` / `AppleWatchWorkoutScheduler` (ya son el puente correcto).
- WatchConnectivity para plan del día y ejecución terminada.
- `LiveFlowView` TabView + crown en `SetTableLiveView` (patrón Apple, bien aplicado).
- Dominio coach: `RunStructure`, zonas editables, estaciones FAHYBRID, payload al backend.
- Live Activity (`RunLiveActivityController`) — Apple framework, nuestro copy.
- Cinta BLE, PM5, audio coach — fuera del alcance de HealthKit/WorkoutKit.

---

## 4. Qué conservamos (Apple no lo tiene)

### Producto y dominio

- **Plan del coach** multi-formato: fuerza con cargas, EMOM, AMRAP, estaciones HYROX, dobles, calentamiento con checklist.
- **Multi-tenant**: metodología por coach, zonas editables, prescripción estructurada (`RunStructure`), analíticas propias.
- **Motor `WorkoutSession`** para todo lo que WorkoutKit no puede representar (reps, carga, rondas, partner relay, scoring WOD).
- **Sincronización backend**: asignaciones, ejecución, tramos medidos, feedback, PRs — vía API + WatchConnectivity al terminar.

### Puentes Apple que ya son correctos

- Programar carreras en Entrenamiento (`WorkoutKit`).
- Grabar con `HKLiveWorkoutBuilder` en muñeca (standalone o espejo).
- Espejo teléfono → reloj por canal HK (no WC).
- No duplicar `HKWorkout` en teléfono si el reloj grabó.

### UX propia que no compite con Entrenamiento

- Descanso de gym (banner verde / pantalla azul).
- Mapa de bloques en muñeca (`SessionMapView`) para sesiones mixtas.
- Corona para ±carga en fuerza (`SetTableLiveView`).
- Dobles HYROX: turno del partner, relevo, visibilidad al compañero.
- Pre-start cinta/calle, BLE treadmill, PM5, audio coach con reglas del método.
- Live Activity y post-workout FAHYBRID (zonas, HRR, tabla de tramos).

### Regla práctica para el equipo

> **Si el entrenamiento de hoy es solo correr** (continuo o intervalos que caben en `CustomWorkout`): el atleta debería vivir en app Entrenamiento o en espejo HK, no en un segundo motor en el reloj.  
> **Si el entrenamiento mezcla cosas** (HYROX, fuerza + run, EMOM): nuestro motor en el teléfono, reloj en espejo para grabar, UI mínima en muñeca.

---

## Mapa mental

```
                    ┌─────────────────────────────────────┐
                    │  Apple (carrera pura)               │
                    │  WorkoutKit → Entrenamiento nativo  │
                    │  o HK espejo: 1 sesión, 1 builder   │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │  FAHYBRID (mixto / coach)         │
                    │  WorkoutSession en iPhone         │
                    │  Reloj: HK graba + HUD ligero     │
                    │  WC: plan + resultado             │
                    └───────────────────────────────────┘
```

---

## Verificado (auditoría read-only)

1. Búsqueda en `ios/`: no hay `HKWorkoutRouteBuilder`; sí hay `HKWorkoutSession`, `HKLiveWorkoutBuilder`, WorkoutKit y espejo HK.
2. Lectura de timers: motor 0,25 s, espejo 1 s, outdoor 0,5 s, `LiveWorkoutSession` 1 s, `MirrorHUDView` con `TimelineView`.
3. `CountdownFormat` documenta explícitamente el fork standalone/mirrored por desincronización con el teléfono.
4. `WatchWorkoutCoordinator` confirma motor completo + HK en muñeca standalone.
5. `AppleWatchWorkoutScheduler` confirma que WorkoutKit solo cubre RUN; el resto justifica la app propia.

**Fuera de alcance:** código del PR 91, UI mockup del PR 105, cambios de versión, implementación.

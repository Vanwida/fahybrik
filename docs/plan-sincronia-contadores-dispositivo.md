# Plan de implementación — Sincronía de contadores (PM5 / tramo)

**Estado:** propuesta de implementación (sesión 2026-08-03).  
**Ámbito:** iOS vivo · ergo (PM5) primero; carrera (cinta/GPS) en fase de paridad.  
**Origen del entreno:** plan del coach (dashboard) **y** entreno libre — **misma regla**.  
**No es método de coach:** es **mecanismo** (HARD RULE Nº0).

---

## 1. Qué se decide (producto, en una frase)

> **La app y el aparato miden siempre la misma unidad de trabajo (el tramo).**  
> Al abrir un tramo de ergo, la app **ordena al PM5** el piece de ese tramo y el contador de m/cal que ve el atleta **parte de cero en esa ventana**.  
> Si el formato es **acumulativo**, no se resetea a lo bruto: un solo contador para todo el window.

Eso cierra el fallo de raíz visto en sesión: varios contadores (PM5 crudo · lap de segmento · ventana de tramo · HUD efímero) que no se sincronizan al empezar serie / ronda.

---

## 2. Modelo de dominio (completo, no el caso delante)

### 2.1 Unidades

| Unidad | Qué es | Quién la cierra |
|---|---|---|
| **Sesión** | Workout entero | finish / salir |
| **Segmento / bloque** | Una pieza del plan (puede ser un formato) | advance de segmento |
| **Tramo** | Ventana viva: serie, ronda EMOM, estación For Time, o el segmento si no hay subcursor | ver §2.3 |
| **Descanso** | Fase rest **del mismo round** (no es un tramo de trabajo nuevo) | reloj de rest o “saltar descanso” |

El contador de m/cal del atleta es del **tramo de trabajo**, no del descanso ni del segmento entero (salvo política acumulativa).

### 2.2 Medida del trabajo (objetiva)

Toda prescripción de ergo = **medida** × **objetivo** × **modalidad**:

- **Medida:** distancia | calorías | tiempo | (reps → no las mide el PM5)
- **Objetivo:** ritmo /500 m | RPE | zona (si hay)
- **Modalidad:** row | ski | bike

Si la medida es m o cal, el PM5 puede medir. Si es tiempo, el reloj de la app (o el countdown del monitor) manda. Si es reps, solo el atleta cierra.

### 2.3 Política de contador — la tabla que falta hoy

Derivada **solo** del tramo + esquema. Una función pura, testable, sin nombres de coach:

```
CounterPolicy
  · scope:   perTramo | cumulativeSegment
  · program: fixedPiece | justRow | none
  · close:   machineGoal | sessionClock | athleteTap
  · onEnter: programPM5 + anchorWindow
  · onRest:  freezeWindow (no re-anclar a cero el trabajo hecho)
  · onExit:  snapshot measured → record
```

| Caso | scope | program (por tramo) | close |
|---|---|---|---|
| **Serie uniforme m/cal** (5×500, 8×20 cal) con o sin rest | `perTramo` | fixedDistance / fixedCalories **de ESE bout** | `machineGoal` (cruce) + tap override |
| **Serie por tiempo** (5×2:00) | `perTramo` | fixedTime del bout **o** justRow + reloj app | `sessionClock` |
| **Pirámide / series heterogéneas** (1200/1000/800) | `perTramo` | fixed del bout actual (cada advance reprograma) | `machineGoal` o clock según medida |
| **EMOM** con ronda de ergo m/cal | `perTramo` | fixedPiece del goal de la ronda **o** justRow | **reloj EMOM** cierra la ronda; m/cal son informativos si no hay goal de m/cal |
| **EMOM** ronda de burpees (no ergo) | n/a | **no** programar PM5 / no cara de monitor | clock / tap |
| **Tabata / Death By** (app-driven) | `perTramo` si ergo | justRow o fixed si hay goal | reloj del formato |
| **For Time ruta de estaciones** (HYROX sim, chipper sin rounds) | `perTramo` | fixed de la estación | `machineGoal` (ya existe) |
| **For Time con rounds** / lista que se repite | `cumulativeSegment` en el ergo si un solo piece; si cada round es un erg goal explícito → `perTramo` | ver nota | score = tiempo total |
| **AMRAP** (window de tiempo, trabajo libre) | **`cumulativeSegment`** | fixedTime del window **una vez** al entrar al segmento | reloj AMRAP; m/cal acumulan |
| **Steady / calentamiento / 2K continuo** | un tramo = segmento | fixed del goal | machineGoal o tap |
| **Sin monitor** | misma política de tramo | `none` | clock / tap; sin auto machineGoal |
| **Entreno libre** | idéntico: el builder produce la misma `Prescription` / segmentos | igual | igual |

**Nota For Time con rounds:** si el coach escribe “3 rondas de (500 m remo + 20 burpees)”, el remo de cada ronda **sí** es `perTramo` (cada vez que toca remo, contador a cero). El score del WOD sigue siendo el reloj total. No confundir score con contador de máquina.

### 2.4 Quién manda en el PM5 (decisión de mecanismo recomendada)

Hoy conviven dos políticas:

1. **Monitor runs the series** (`distanceIntervals` / `calorieIntervals` / `timeIntervals` con rest) → la app **no** reprograma cada bout.  
2. **App-driven** (EMOM, pirámide, justRow) → reprograma por `currentTramo.key`.

**Propuesta de este plan (alineada con lo hablado):**

> **La app es dueña del contador de series.**  
> En cada **entrada a tramo de trabajo ergo**, la app manda el piece de **ese** bout y el monitor queda en “row to begin” / contador limpio para esa medida.  
> El modo nativo de intervalos del PM5 **deja de ser el camino principal** para series prescritas (sigue existiendo solo como optimización opcional documentada, no como default).

Motivo: el PM5 en intervalos nativos **no tiene count de rondas** (repite hasta que paras); la app sí sabe “serie 3/5”. Dos dueños = desync. Un dueño (app) + órdenes al monitor = una verdad.

**Descanso entre series:**

- La app corre el rest (countdown + UI de descanso).  
- **No** se reprograma un piece de trabajo en rest.  
- El monitor puede quedarse en rest nativo si el último program lo trajo, o en idle; la ventana de **trabajo** del tramo queda **latched** (metros/cal de la serie hecha se siguen leyendo en la pantalla de rest).  
- Al **siguiente work**: `onEnter` → program del nuevo bout + ancla nueva.

### 2.5 Auto-cierre (ampliar la regla ya decidida)

`docs/DECISIONS.md` (2026-07, tramo):

- m/cal → cierra al **cruzar** el goal (no “lectura ≥ goal al reconectar”).  
- tiempo → reloj.  
- reps → toque.  
- monitor parado **nunca** cierra.

**Hoy** `closesOnMachineGoal` solo en `isFixedStation`.  
**Plan:** el cierre por cruce aplica a **todo tramo ergo** con medida m|cal y `close == machineGoal`:

- series intervals work  
- estaciones For Time  
- steady con goal m/cal  
- **no** en rest  
- **no** en AMRAP acumulativo (el goal del window es el reloj)  
- EMOM: el **minuto** cierra por reloj; si además hay goal m/cal y se cruza antes, **no** saltar al siguiente minuto solo por m/cal (el formato es el dueño del cursor) — solo feedback “objetivo de la ronda hecho”

### 2.6 Qué se pinta (una verdad)

| Superficie | Número de m/cal |
|---|---|
| HUD ergo (trabajo) | `tramoErg*` (ventana) — **siempre**, con 0 por defecto si aún no hay sample |
| Línea secundaria | total de segmento solo si `total − window ≥ 1` (ya existe `accumulatedErgLine`) |
| ErgLiveStrip | **misma ventana** `tramoErg*`, nunca `live.distanceMeters` crudo |
| Rest del tramo | último trabajo medido (`lastTramoWorkLine`) — m **y** cal |
| Live Activity / mirror | misma política (perTramo vs cumulative) |
| Post-workout | por tramo si el formato es series/estaciones; un agregago si cumulative |

### 2.7 Grabación

- **perTramo:** un registro medido por bout/estación (m/cal/tiempo/ritmo) — paralelo a `recordRunLegLap` en carrera.  
- **cumulative:** un lap de segmento (como hoy en muchos formatos).  
- Nunca redondear al prescrito (1.014 se guarda 1.014).

### 2.8 Paridad carrera (fase posterior, misma idea)

No es PM5, pero el mismo modelo:

| Superficie | Hoy | Objetivo |
|---|---|---|
| Cinta | baseline en HUD; **no** re-baseline count-in→GO | ancla en motor al GO del tramo |
| Outdoor | “Distancia” = total segmento | total solo si cumulative; tramo = `RunLegProgress` con lifetime de sesión |
| GPS/belt en motor | segment totals sí; per-leg solo en HUD | **metros del tramo en `WorkoutSession`** (como `tramoErg*`) |

---

## 3. Stress-test (≥10 casos reales del dominio)

Cada caso debe entrar en el modelo **sin texto libre**. Si no entra, el modelo está mal.

| # | Caso | Política esperada |
|---|---|---|
| 1 | 5×500 m remo r1:30 (coach) | perTramo; program 500 m al inicio de cada serie; rest app; auto-cierre al cruzar 500 |
| 2 | 8×20 cal ski r1:00 (coach) | igual con cal; UI 0/20 desde el primer frame del tramo |
| 3 | 5×500 r0 (sin rest) | perTramo; reprogram cada bout (no un fixed 2500 a ciegas como única verdad de UI) |
| 4 | Pirámide 1200/1000/800 | perTramo; program cambia la distancia en cada advance |
| 5 | EMOM 12′: min impar 15 cal row / min par burpees | ronda ergo: program + ancla; ronda burpees: sin cara PM5; cursor lo cierra el minuto |
| 6 | AMRAP 12′ (row + thrusters libre) | cumulative; un program fixedTime 12′ o justRow; m/cal no resetean por “ronda” del atleta |
| 7 | For Time HYROX sim (estaciones) | perTramo por estación; auto-cierre m/cal; 1014 no se redondea |
| 8 | For Time 3 rondas (500 row + 20 burpees)×3 | cada visita al remo = perTramo; score = reloj total |
| 9 | 2K remo steady (libre o prescrito) | un tramo; program 2000 m; contador 0→2000 |
| 10 | Entreno libre: “series 4×30 cal bike” | **misma** política que (2); builder → prescription → mismo engine |
| 11 | Monitor se cae a mitad de serie 3 | ventana conserva último sample; UI dice sin monitor; no auto-cierre por silencio; tap puede cerrar |
| 12 | Reconexión mid-piece con contador PM5 en 0 | re-ancla sin dar el tramo por cerrado (cruce, no umbral estático) |
| 13 | Count-in 3-2-1 con atleta ya remando | metros del count-in **no** cuentan al tramo (ancla al GO) |
| 14 | Benchmark 500 m (marca) | un tramo; program 500; sin escape “sin monitor” si es regla de marca (ya existe isBenchmark) |

---

## 4. Huecos que te dejaste (y cómo los cierra el plan)

| Hueco | Decisión en el plan |
|---|---|
| Descanso entre series | App dueña del rest; no reprogram work; latch de medición del bout |
| Quién cierra la serie m/cal | Cruce de goal (app) + “Serie hecha” override |
| AMRAP | Siempre cumulative en el window |
| For Time rounds vs estaciones | Estaciones = perTramo; rounds con erg intercalado = perTramo al entrar al erg |
| Pirámide | App reprograma cada bout (no justRow eterno sin goal) |
| Sin monitor | Misma lógica de tramo; close = tap/clock |
| Bike / cal lentas (0x33) | UI con 0 por defecto; reloj armado también se suelta con **subida de cal** (no solo power/m) |
| Libre vs prescrito | Un solo pipeline: `WorkoutSession` + `LiveTramo` + programador |
| Monitor intervals nativos | Dejan de ser el default de series prescritas |
| Dobles / relevo | Fuera de v1 de este plan (tramo de partner no programa PM5 del atleta) |
| Cinta/GPS | Fase de paridad §2.8, no bloquea ergo |

---

## 5. Estado actual vs objetivo (gap)

| Pieza | Hoy | Objetivo |
|---|---|---|
| Ventana m/cal en motor | `tramoErg*` sí | Mantener; ancla también en count-in→GO |
| Program PM5 | Por segmento o tramo según `monitorRunsTheSeries` | **Siempre** por tramo de trabajo cuando scope=perTramo |
| Auto-cierre m/cal | Solo fixedStation | Todo tramo con `close=machineGoal` |
| Series intervals m/cal | `rotPhaseRemaining=0` → solo “Serie hecha” | + auto-cierre por cruce |
| Goal UI cal | Requiere sample ≠ nil | 0 por defecto |
| ErgLiveStrip | PM5 crudo, sin cal | `tramoErg*`, m y cal |
| Per-bout record series ergo | Débil / agregado | Snapshots por tramo |
| Libre | Mismo engine, programador a veces justRow flojo | Mismas specs que prescrito |
| Carrera per-leg en motor | No | Fase 2 |

---

## 6. Diseño técnico (dónde toca)

### 6.1 Capa pura (tests primero)

1. **`ErgCounterPolicy`** (nuevo, junto a `LiveTramo` / programmer)  
   - Input: `LiveTramo` + `WorkoutSegment` + scheme/phase (work|rest|countIn).  
   - Output: `CounterPolicy` (§2.3).  
   - Tests: tabla de los 14 casos.

2. **`PM5WorkoutProgrammer.spec(for:tramo:)`** (o `spec(for:segment:tramo:)`)  
   - Deja de ser solo “por segmento”.  
   - Bout actual → fixed m|cal|time de **ese** goal.  
   - Rest / no-erg → nil (no mandar basura).  
   - Deprecar o acotar `monitorRunsTheSeries` al camino legacy (tests que fallen se reescriben).

3. **`LiveTramo.closesOnMachineGoal`**  
   - Ampliar a tramos ergo con política machineGoal (no solo fixedStation).  
   - Guard: work phase, no count-in, no rest, no paused.

### 6.2 Motor (`WorkoutSession`)

4. **`onTramoEnter` unificado** (hoy repartido entre `syncTramoIfNeeded`, program en la view, count-in):  
   - Ancla `tramoErgStart*` al GO (no durante count-in).  
   - Emite evento / flag `needsPM5Program = tramo.key` para la capa BLE.  
   - Suelta reloj armado si m|cal|power avanzan.

5. **Auto-advance series intervals**  
   - En `sampleErg`, si policy.close == machineGoal y cruce → `intervalsBoutDone()` / `markRoundDone` según cursor (no solo fixed).

6. **Snapshots por tramo ergo** (series)  
   - Al salir de work: append medición del bout (como fixed splits / run legs).  
   - Alimenta post-workout y coach.

7. **Count-in**  
   - Samples durante count-in actualizan `lapErgLast*` pero **no** el numerador del tramo hasta GO (re-ancla en GO).  
   - Simétrico a `RunLegProgress` `#in`/`#go`.

### 6.3 BLE / store

8. **`programIfNeeded` por tramo** (ActiveWorkoutView ya tiene windowKey; endurecer):  
   - Key = `currentTramo.key` siempre que policy.program ≠ none y scope=perTramo.  
   - cumulative → key = segment id (una sola programación).  
   - Tras program success: esperar “row to begin”; no contar m/cal de la ventana anterior.

9. **Reconexión**  
   - Mantener re-ancla por salto atrás del contador (ya existe).  
   - No auto-close sin cruce.

### 6.4 UI

10. **ErgHUDContent**  
    - Goal cal/m con covered default 0.  
    - Sin monitor: copiar también cal (“12 cal antes de perder…”).  

11. **ErgLiveStrip**  
    - `session.tramoErgDistanceMeters` / `tramoErgCalories`.  

12. **Copy count-in**  
    - Sin cambio de concepto; el contador del tramo no arranca hasta GO.

### 6.5 Libre + dashboard

13. **Free builder**  
    - Verificar que series m/cal y EMOM ergo emiten la misma shape que el coach (`Prescription.scheme`, sets, measure).  
    - Tests de encode → `WorkoutPlan` → `ErgCounterPolicy`.

14. **Dashboard**  
    - No hace falta UI nueva de “reset contador”: es mecanismo.  
    - Sí: no generar prescripciones ambiguas (series sin measure tipada). QA de plantillas existentes con measure null en ergo.

### 6.6 Carrera (fase 2)

15. Subir `legCoveredMeters` al session (belt+GPS deltas con ancla por tramo).  
16. Cinta: legKey con fase count-in; integración con `displaySpeedKmh`.  
17. Outdoor: apoyo Distancia según policy; lifetime de `RunLegProgress` = sesión.

---

## 7. Plan de PRs (orden, commits pequeños)

| PR | Contenido | Verificación |
|---|---|---|
| **PR1 · Policy pura** | `ErgCounterPolicy` + tests 14 casos + docs en DECISIONS (decisión de app-dueña) | unit tests only |
| **PR2 · Programmer por tramo** | `spec(for:tramo:)` · program key = tramo · tests programmer | unit; sin BLE real |
| **PR3 · Auto-cierre series ergo** | ampliar `closesOnMachineGoal` + `sampleErg` → advance series | unit engine |
| **PR4 · Ancla count-in / GO + cal UI 0** | sync ancla; goal cal simétrico a m; reloj armado por cal | unit + UI snapshot si hay |
| **PR5 · Strip + rest + unmeasured cal** | ErgLiveStrip ventana; rest/unmeasured cal | unit / render tests |
| **PR6 · Per-bout record series ergo** | snapshots al cerrar bout; payload execution | encode tests |
| **PR7 · Free parity** | free → same policy path | encode + policy tests |
| **PR8 · QA dispositivo** | checklist gym (abajo); fixes firmware | manual Alex / TestFlight |
| **PR9 · Carrera paridad** | tramo metros en session; cinta/outdoor | unit + UI |

No un PR gigante: cada uno deja main compilable y tests verdes.

---

## 8. Checklist de QA en gym (PR8)

1. Conectar PM5 → program “Listo — rema para empezar”.  
2. 3×500 r1:00: cada serie monitor y app en 0 al GO; auto-cierre ~500; rest no suma al contador de la siguiente.  
3. 4×20 cal: igual en cal; barra 0/20 visible antes de la 1ª cal.  
4. EMOM 15 cal / burpees: al minuto de burpees no hay cara de remo; al volver a remo contador limpio.  
5. AMRAP 8′: m/cal no resetean al “completar ronda” mental.  
6. Estación For Time 500 m → auto-pasa; 1014 se guarda.  
7. Tirar BLE a mitad → no cierra solo; reconectar no cierra solo.  
8. Libre 3×30 cal bike: mismo comportamiento que prescrito.  
9. Count-in remando: tramo no hereda esos metros.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Reprogramar cada bout en PM5 es lento / “row to begin” molesta | Banner ya existe; program en el **inicio del rest→work** (mientras recupera), no a mitad de palada |
| Atleta ignora “row to begin” y sigue remando | Ventana app sigue midiendo por ancla; monitor puede ir desfasado un bout — UI confía en **app** |
| Firmware ignora fixed calories | Fallback justRow + cierre por ventana app; traza CSAFE |
| Series nativas antiguas en vuelo | Un solo camino nuevo; no mantener dos políticas sin tests |
| Doble advance (app + monitor) | Solo app cierra cursor; monitor no es fuente de ronda |

---

## 10. Qué NO es este plan

- No cambia el editor del coach (salvo QA de measures nulas).  
- No inventa conteo de reps en el PM5.  
- No redefine AMRAP como “reset por ronda”.  
- No mete método de un coach en el código.  
- No sustituye el doble UX: el doble ya dice “tramo decide la cara”; esto implementa la **verdad del contador**.

---

## 11. Criterio de “hecho”

- Los 14 casos del §3 tienen test automatizado de policy + al menos un path de engine.  
- En gym: serie m y serie cal, app y PM5 parten de cero cada bout; auto-cierre al goal.  
- Libre y prescrito comparten tests de policy.  
- DECISIONS.md actualizado con: **app dueña del contador; policy perTramo vs cumulative; auto-cierre series ergo**.  
- FOCUS.md apunta a este plan.

---

## 12. Superficie a Alex (subjetivo / OK para arrancar)

Lo **objetivo** del plan está cerrado arriba. Solo necesitas OK de producto en:

1. **¿Confirmas app-dueña siempre en series** (abandonar intervalos nativos PM5 como default)?  
2. **¿AMRAP siempre cumulative** (sin reset por ronda)?  
3. **¿Prioridad PR1–PR8 ergo antes que carrera (PR9)?**

Con un “sí / matices” se puede ejecutar el stack de PRs sin reabrir el modelo.

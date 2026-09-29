# Garmin R4: auditoría del repo (solo lectura), 29-sep-2026

Todas las rutas son relativas a `/Users/alexsolecarretero/Public/projects/FAHYBRIK`. Nada del repo se ha tocado. La única escritura fuera de este informe es una compilación de prueba en `scratchpad/ciq-build/` (copia del proyecto con clave desechable).

---
## 1. `garmin-ciq/` (app "mensajera"): qué se reutiliza, qué se tira, qué está frágil

### ¿Compila? ¿Hay tests? ¿Qué relojes?
- **Compila hoy.** SDK 9.2.0 + OpenJDK. Compilé la copia en scratchpad con `--typecheck 1`: BUILD SUCCESSFUL para fr965, fr255s, fenix7, venu3, fr165m, vivoactive5 y fr970. El `bin/fahybrid-fr965.prg` del repo es del 3-ago (124 KB), solo fr965; `bin/` está en .gitignore.
- **El paquete de tienda NO compila.** `monkeyc -e` falla: "Device ids 'tactix7' and 'enduro2' listed in the manifest are not recognized" (`manifest.xml`, 44 `<iq:product>`). El README lo anticipa (README:168-176) pero no está arreglado.
- **Tests: cero.** No hay ninguna función `(:test)`, ni carpeta de tests, ni CI. `garmin-ciq/logs/pre_compact.json` es un residuo de hook (ignorado por git), no un log de pruebas.
- **Relojes reales probados: ninguno.** No hay rastro en README, DECISIONS.md, FOCUS.md ni commits. El README:179-203 (## Probar) es un checklist "para hacer" (sideload por USB, ver que `System.exitTo` lanza el reproductor). Historia: 6 commits, 25-jul a 3-ago; el 25-jul "la app COMPILA" (0570af9f) fue la primera vez que pasó por el compilador. `docs/dead-code-inventory.md:409` y `docs/safety-cleanup-inventory.md:379` dicen que nadie ha revisado `garmin-ciq/`.
- Cobertura de dispositivos: 44 ids (`manifest.xml:32-78`), minSdk 3.1.0, permisos solo `Communications` + `PersistedContent` (`manifest.xml:81-82`), `type="watch-app"`. Edge queda fuera a propósito.

### REUTILIZABLE para un motor propio
| Pieza | Dónde | Veredicto |
|---|---|---|
| Login por email + código (los ajustes de Garmin Connect ponen el teclado; el reloj hace las 2 llamadas) | `Controller.mc:72-154`, `Api.mc:62-93`, `resources/settings/*.xml` | Reutilizable tal cual. Endpoints vivos: `POST /api/auth/email/request` y `/verify` (`web/app/api/auth/email/*`). El campo del código es `alphaNumeric` a propósito, para no perder el cero inicial (`settings.xml`). |
| Store: Properties (email, código) frente a Storage (token, solo reloj) | `Store.mc:16-157`, `Config.mc:30-42` | Reutilizable. El token no va a Properties (saldría en la pantalla de ajustes del móvil). `Store.trim` (l.134) y `tokenMatchesEmail` (l.106) valen. |
| `Api.mc` (`makeWebRequest` + cabeceras Bearer + JSON) | `Api.mc:54-136` | El patrón vale. Solo `requestLoginCode` y `verifyLoginCode` se conservan; `fetchToday`/`downloadFit` se sustituyen. |
| `Json.mc` (lectura defensiva) | `Json.mc:11-46` | Reutilizable. |
| `DateUtil.todayIso` (fecha local del reloj) | `DateUtil.mc:15-18` | Reutilizable. Un "hoy" por huso del atleta. |
| Manejo de red caída (-104 y demás) | `Controller.mc:335-362` | Reutilizable (`isNetworkError`). Con motor propio el fallback offline es el plan guardado en Storage, no un `.FIT` persistido. |
| 401 → `expireSession` → login | `Controller.mc:366-374` | Reutilizable. |
| Vista dibujada a mano por proporciones + `TextUtil.wrap/truncate` + `Theme` | `MainView.mc`, `TextUtil.mc:15-84`, `Theme.mc` | Vale para pantallas de estado/login. El HUD de actividad es otra cosa. Hay hexes sueltos en `Theme.mc:9-13`. |
| Esqueleto de estados (enum `AppState` + `show()`) | `AppState.mc`, `Controller.mc:411-428` | El patrón vale, los estados no. |
| `build.sh`, `.gitignore` de claves, i18n es/en | `build.sh`, `resources*/` | Reutilizable. |

### ESPECÍFICO del modelo "mensajero" (se tira)
- Todo `Delivery.mc:14-106` (`getAppWorkouts`, `findByName`, `removeStaleExcept`, `toIntent` + `System.exitTo`).
- `Controller.download/onFitDownloaded/launch/confirmLaunch` (l.213-295), los estados `NEEDS_DOWNLOAD`/`READY`/`CONFIRM`/`NOT_EXPORTABLE`, la pantalla "Dos toques" y el manejo de `STORAGE_FULL` (-1000) y "Reloj incompatible" (200 + iterador vacío, l.244-262).
- `Api.downloadFit` con `:responseType FIT` y el permiso `PersistedContent` (ya no hace falta).
- `(:typecheck(false))` de `Controller.mc:229,268` (bug del SDK ligado a la descarga FIT).
- Ojo: `STORAGE_FULL` sigue existiendo, pero como escritura de Storage (los planes de 7 días), no como descarga.

### FRÁGIL o mal (verificado leyendo código)
1. **Emparejar por nombre es frágil y el contrato miente.** README y `Api.mc:25-30` dicen que `workout_name` es "único por día" y dan el ejemplo "25 jul · 8×400". El servidor NO añade fecha: `title = detail.workout?.name || cardTitle` (`web/lib/wearables/watch-workout-source.ts:165`) → `name: clampName(title)` (`shared/domain/wearables/watch-workout.ts:399`). El ejemplo con fecha es solo el mock del test (`web/tests/wearables/garmin-today-route.test.ts:29,133`). Consecuencia: dos días con el mismo título ("Rodaje Z2") → `Controller.onToday` (l.203) ve el entreno viejo, no descarga y `removeStaleExcept` (Delivery.mc:73) lo conserva. El atleta corre los ritmos de otro día. Lo mismo si el coach edita la sesión del mismo día.
2. **`reason` desalineado.** `Api.mc:24` dice `"strength"`; el servidor emite `not_a_run_session` (`today/route.ts:91,106`) y la app ignora `reason` (`Controller.mc:184-190`): cualquier `exportable:false` sale como "Esto va en la app".
3. **README dice "sesión de 30 días" y ya no lo es.** El token dura 180 días con renovación deslizante vía `POST /api/auth/refresh` (`web/lib/auth/config.ts:26`, `web/app/api/auth/refresh/route.ts`). La app nunca llama a `/refresh`, así que caduca a los 180 días aunque se use a diario. Tampoco guarda `expires_at`.
4. **Sin guarda de re-entrada.** `refresh()` (Controller.mc:50) se llama desde `onStart`, `onSettingsChanged` (FahybridApp.mc:31) y `onNextPage` (MainDelegate.mc:37) sin comprobar `STATE_BUSY`. Dos `onSettingsChanged` seguidos con el código de 6 dígitos aún escrito lanzan dos `verify`. El segundo devuelve 400 y pisa el estado bueno con "El código no vale" (`Controller.mc:126-137`). Posible carrera, no reproducida.
5. **`writeStorage` se traga las excepciones** (`Store.mc:74-81`): si Storage falla, el token se pierde sin aviso.
6. **Nunca se ha visto en pantalla real** el contrato de `-104` ni el de `Communications.*`; todo se asume de la doc.
7. Las llamadas `pair-code` (`web/app/api/athlete/wearables/garmin/pair-code/route.ts`) y `workouts` (lista de próximas carreras) existen en el servidor pero la app CIQ no las usa. iOS sí usa `pair-code` (`ios/FAHYBRIK/Wearables/GarminSetupView.swift`, `Profile/WearablesService.swift:155`).

---
## 2. Servidor: endpoints Garmin y codificador FIT

### `GET /api/athlete/wearables/garmin/today?date=YYYY-MM-DD` (`web/app/api/athlete/wearables/garmin/today/route.ts`)
- Bearer de atleta; `date` obligatoria (400 si no es YYYY-MM-DD). Devuelve 200 siempre que el token valga; 401 si no.
- Salidas (l.87-121), campos en el nivel superior (`jsonOk` no envuelve):
  - `{has_session:false, exportable:false, reason:null}` (día sin nada).
  - `{has_session:true, exportable:false, reason:'not_a_run_session'}` (l.91) o `reason` de `loadRunWatchWorkout` (l.106).
  - `{has_session:true, exportable:true, reason:null, workout_name, summary, fit_url}`. `summary` = "N tramos · X,Y km" o "N min" o "a sensaciones" (l.51-73). `fit_url` = `/api/athlete/wearables/garmin/workout?assignment_id=…`.
- Solo mira esta semana + la siguiente (`findWatchSessionForDate`, `watch-workout-source.ts:238-268`).

### `GET /api/athlete/wearables/garmin/workout[?assignment_id=]` (`workout/route.ts`)
- 200 `application/vnd.ant.fit` + `cache-control: no-store` + `content-disposition: entreno-<fecha>-<assignment_id>.fit`. Errores: 401, 404 `no_session_today`/`not_found`, 409 `not_a_run_session`, 422 `workout_not_encodable` (`FitEncodeError`).
- Codificador: `web/lib/wearables/fit/workout-encoder.ts` (`encodeWorkoutFit`, `toFitSerialNumber`, `FIT_CONTENT_TYPE`), con `@garmin/fitsdk` oficial (`Encoder`). Manufacturer 255, `sport` running fijo, bandas SIEMPRE personalizadas (`target_value=0`), pulso con offset +100, tope 65535 pasos.
- Otros: `GET .../garmin/workouts` (lista `{assignment_id, iso_date, title, is_today}` de carreras de esta semana y la siguiente; `watch-workout-source.ts:198`) y `POST .../garmin/pair-code` (email + código para enseñar en pantalla, sin canal de email).
- Tests existentes: `web/tests/wearables/garmin-today-route.test.ts`, `garmin-workout-route.test.ts`, `fit-workout-encoder.test.ts`, `run-structure-source.test.ts`.

### Modelo de dominio: `WatchWorkout` (`shared/domain/wearables/watch-workout.ts`)
- `WatchMeasure` = `distance{m}` | `duration{s}` | `open` (l.51). `WatchTarget` = `pace{fast_s_per_km,slow_s_per_km}` | `hr{min_bpm,max_bpm}` | null (l.61). `WatchStep` = `{kind:'work'|'recovery', measure, target, cadence?{min_spm,max_spm}, incline_pct?, name≤40}` (l.72-93). `WatchBlock{steps, iterations}` (l.96). `WatchWorkout{name, sport:'running', warmup?, blocks[], cooldown?}` (l.101-108).
- **Es solo correr**, sin cue del coach, sin entorno, sin rol de descanso/transición, sin fase por paso (solo warmup/cooldown como campos), y anida un solo nivel (el Repeat interior se expande, l.286-324). Lo que el reloj no puede vigilar (RPE, zona sin resolver, modo de recuperación, inclinación) va en el `name`, no como dato (l.171-269).
- Pipeline: `loadRunWatchWorkout` (`watch-workout-source.ts:139`) → `loadAssignmentDetail` → `runStructureForSession` (`run-structure-source.ts:165`) → `buildWatchWorkout` (`watch-workout.ts:360`).

### Qué marca `exportable:false`
- Ninguna sesión cuya modalidad de bloque principal no sea `run` (`WATCHABLE_MODALITY='run'`, `watch-workout-source.ts:42,254-264`): fuerza, EMOM, AMRAP, ergo, HYROX sim, funcional (la modalidad de la tarjeta es la del bloque principal, `web/lib/athlete/week-plan.ts:736-800`).
- Sesión `run` sin estructura convertible (`runStructureForSession` = null → `not_a_run_session`, l.167-168).
- **Agujero silencioso:** una sesión con bloque principal de correr + accesorios de fuerza sale `exportable:true` con solo los tramos de correr (`collectRunStructures` filtra por `isRunItem`, `run-structure-source.ts:72-108`). El atleta no sabe que el resto no viaja. Un día con dos carreras (am/pm) solo ofrece la primera (`watch-workout-source.ts:254`).
- Asimetría de zonas documentada (DECISIONS.md:5029): un `hr_zone` llega a iOS sin banda y al Garmin sí (bpm resueltos vía `athlete_benchmarks`), y `assignment-detail.ts:1348-1360` solo resuelve `pace_zone`. El Garmin resuelve el pulso por la vía de benchmarks (`watch-workout-source.ts:72-106`), no por el perfil de zonas guardado.

---
## 3. El contrato que ya consumen Apple Watch y Zepp

### Apple Watch: el cable es `AssignmentDetail` en bruto, no una lista de pasos
- **Sobre iPhone→reloj:** `WatchTodayPayload` (`ios/FAHYBRIKCore/Watch/WatchWireModels.swift:28-67`), JSON en `applicationContext` bajo `today_v2` (l.214), tope `maxContextBytes=60_000` (l.289). Campos: `dayKind` ("session"|"rest"), `assignmentId`, `title`, `focus`, `estDurationMinutes`, `intensityLabel`, `activityKind` ("running"|"strength"|"hyrox"|"mixed"), `athleteHrZones` (perfil de FC resuelto por servidor: `lthrBpm, estimated, source, sourceLabel, confidence, zones[5 bandas]`, `ios/FAHYBRIKCore/Theme/ZoneColors.swift:102`), `readiness*`, `isDone`, `doneCompleteness`, `isDoubles`, `partnerFirstName`, `partnerVisibility`, `detailJson` (el cuerpo de `GET /api/athlete/assignments/[id]/detail` tal cual, sin `exercise_video_url`), `clubAccent`.
- Si el detalle no cabe, viaja como fichero y el reloj lo pide (`detail_request_v1`, `WatchSessionPlan.swift`, `WatchPlanModel.swift`). **El reloj solo guarda el día de hoy** (`WatchPlanModel.swift:16-30`; `docs/el-reloj-primero/index.html`: "1 day of plan on the Watch").
- **No existe un formato de pasos en el cable.** El reloj decodifica `AssignmentDetail` → `WorkoutPlan.from(detail:)` (`ios/FAHYBRIKCore/Workout/WorkoutModels.swift:1378`) → `Vivo.planDe` (`Vivo/Vivo+PlanDeSesion.swift:33`) que produce `[Vivo.Paso]`. **`Vivo.Paso` no es `Codable`** (`Vivo+Paso.swift:254`). El único espejo es TS y vive en el doble de diseño, no en `shared/`: `web/components/design-twin/kit-reloj/paso.ts` (`PasoBase` l.296, `Paso` l.336, `EstadoVivo` l.478). Especificación: `docs/reloj-muneca/modelo.md` (P1-P13, M1-M8). Esa spec fija el modelo pero dice "el Swift va después de la firma de Alex", y sus M1-M8 "aguas arriba" (dos objetivos, modo de recuperación, entorno, tandas anidadas, cue por paso) están sin resolver en el servidor.

### El paso del motor compartido (`Vivo+Paso.swift`, espejo de `paso.ts`)
`Paso {id, clase, rol, fase, medida, objetivos[0..2], posicion?, nombre?, modoRecupera?, entorno?, carga?, maquina?, tempo?, cue?, cierre, vueltaAutoM?, bloque?, roxzone?, wod?, fuerza?, dobles?, origen?}` (l.254-288; TS: paso.ts:296-334; `siguiente` va aparte).
- **Medida** `{tipo: distancia|tiempo|reps|cal|abierta, prescrito, mide: gps|cinta|ergo|sensor|atleta|reloj}` (l.26-41).
- **Objetivo** `{eje: ritmo|zona|ppm|rpe|potencia|pctRM|kg|rir|split500|cadencia|inclinacion, min, max, papel: principal|techo|secundario, avisa: ambos|solo-arriba|solo-abajo, palabra?}` (l.45-83). En `ritmo`/`split500`, `min` = valor más rápido.
- **Rol** `trabajo|recuperacion|descanso|transicion`; **Fase** `calentamiento|principal|vuelta`; **Posicion** `{tanda, serie, tramo, ronda, estacion: Contador{n,de}, slot:"A1"}` (l.85-109); **Clase** (23 valores: rodaje, tirada, tempo, series, progresivo, fartlek, cuestas, strides, carrera, test, recuperacion, descanso, estacion, roxzone, fuerza, ergo, emom, amrap, fortime, movilidad…) (l.111-136).
- **Fuerza** `FichaFuerza{ejercicio, carga: kg|rm|corporal|tuya, esfuerzo{rir|rpe,min,max}, porLado, aproximacion, pasoKg, vaciaKg}` (l.200-233); **WOD** `InfoWod` = emom|amrap|puntuacion|fortime|pared|deathby con `Tarea{nombre,dosis,carga,corporal,mide,corre}` (l.165-198); `Maquina{tipo, damper}` (l.238), `Tempo` (l.244), `Carga{kg, implementos}` (l.158).
- **Cue del coach:** `cue` (M8) hoy solo se rellena con `ficha?.nota` de una serie de fuerza (`Vivo+PlanDeSesion.swift:563`). En el servidor, el cue vive a nivel de línea (`AssignmentDetailItem.cues` = cue del ejercicio, merge por coach, y `notes`; `shared/schema/workouts.ts:447-476`) y `PrescriptionSet.note` (`shared/domain/prescription/types.ts:594`). No hay cue por tramo de correr.
- **Entorno (calle/cinta/pista):** no está en la prescripción del servidor (grep en `types.ts` y `run-structure.ts`: 0 apariciones). Lo elige el atleta al empezar (`RunEnvironment?` → `entornoDe`, `Vivo+PlanDeSesion.swift:90-96`; `WorkoutLocationType.resolve`, `WatchWireModels.swift:172-206`, defecto CALLE).
- **Lecturas en vivo** (`Lecturas{t, hecho, ritmo, ppm, ppmTendencia, split500, vatios, cadencia, cal…}`, l.318) y **reglas de aviso** (`ReglasAviso`, l.346-372) tienen defectos en el cliente (`reglasAvisoDefecto`, l.365). No hay endpoint que sirva las reglas del coach.

### Sesión (lo que viaja por sesión al reloj)
`AssignmentDetailResponse` (`web/lib/athlete/assignment-detail.ts:108-174`; Zod en `shared/schema/workouts.ts:522`): `assignment{id, scheduled_for, status, slot, template_id, partner_visibility, station_assignment, my_role, store_results}`, `workout{name, focus, coach_note, estimated_duration_minutes, modality, blocks[]}`, `blocks[]{uid,title,format,block_position,coach_note,config_json,items[]}`, `items[]{uid, template_segment_id, exercise_*, cues, params_json, prescription_json, resolved_intensity, resolved_load, resolved_references, notes}` (l.286-330), `execution`, `run_compliance`. Correr lleva `prescription_json.structure` = `RunStructure` con `resolved` por segmento (`runWireStructure`, l.1380-1400).

### ¿Hay endpoint de "7 días de plan"?
- **No hay uno que devuelva pasos.** Existe `GET /api/athlete/plan/week?week_offset=N` (`web/app/api/athlete/plan/week/route.ts`): una semana, con `days[].sessions[]{assignment_id, title, modality, status, est_duration_minutes, blocks_count, short_prescription, is_test…}` (`week-plan.ts:41-101`), sin pasos. `GET /api/athlete/assignments/[id]/detail` da una sesión con todo. `GET .../garmin/workouts` lista carreras futuras. Hay que crear uno por lotes (p. ej. `GET /api/athlete/wearables/plan?from=&days=7`).
- Con el modelo actual de CIQ, guardar 7 días implica ~7 llamadas a `/detail` o un endpoint nuevo que normalice a pasos.

### Cómo escribe el resultado el reloj hoy
- El Apple Watch NUNCA habla con el servidor: manda un `WatchExecutionEnvelope` por `transferUserInfo` (`WatchWireModels.swift:90-112`), el teléfono lo reenvía y devuelve un acuse (`held|saved|rejected`, l.123). La serie por segundos viaja aparte como fichero (`WatchTraceFile`).
- **Endpoint de cierre: `POST /api/sync/workout-execution`** (`web/app/api/sync/workout-execution/route.ts`; DTO iOS `WorkoutExecutionPayload`, `WorkoutModels.swift:1180`). Zod: `workoutExecutionSchema` (`web/lib/sync/record-workout-execution.ts:58-87`).
  - Sesión: `assignment_id`, `perceived_exertion` (RPE), `total_duration_seconds`, `notes`, `score_time_s`/`score_rounds`/`score_reps`, `source`, `recorded_via` (`live|manual|imported`), `source_workout_ref`, `completeness` (`full|partial`), `perceived_difficulty`, `pain_area`, `pain_note`, `started_at`, `ended_at`, `route_polyline`, `segments[]`.
  - Tramo (`web/lib/sync/segment-input-schema.ts:39-93`; máx 200, `sanitize-measurement.ts:82`): identidad obligatoria `position≥0` + `modality`; después `template_segment_id`, `started_at/ended_at`, `duration_seconds`, `distance_meters`, `avg_pace_s_per_km`/`_per_500m`, `avg_power_w`, `stroke_rate_spm`, `run_cadence_spm`, `incline_pct`, `avg_hr`/`max_hr`, `hr_source`, `calories`, reps (`reps_prescribed/actual/status/confirmed/source`), `weight_used_kg`, `is_structural`, EMOM, `rx_scaled`, `sets[]` (por serie de fuerza: reps, kg, rpe, rir, tempo, velocidad), `zone_seconds_json`, `erg_splits`, y los tres de carrera estructurada `leg_index` + `leg_role` (`work|recovery`) + `leg_phase` (`warmup|main|cooldown`) que van juntos o ninguno (CHECK 0146), más `round_index`.
  - **Tolerante:** un campo malo cuesta ese campo, un tramo sin identidad cuesta ese tramo; solo se rechaza 401 y JSON no-objeto (400). Idempotencia: por `assignment_id` (`record-workout-execution.ts:190`) y, fuera de plan, por `(athlete_id, started_at)` (`record-athlete-workout.ts:199`); tramos por `(execution_id, position[, round_index])`. Un id que ya no existe o es ajeno se guarda como ejecución fuera de plan (`off_plan_reason`), nunca 404. **No hay un `session_id` generado por el cliente**: el reintento seguro depende de mandar el mismo `assignment_id` o el mismo `started_at`.
- **Series por segundo:** `POST /api/sync/workout-traces` (`{execution_id:int, traces[]{signal,source,started_at,offsets_s[],values[]}}`, máx 20.000 puntos por señal, 14 series por petición; `ingest-workout-traces.ts:34-58`).
- Enums de procedencia: `biometricSource` incluye `garmin` (`shared/schema/_primitives.ts:84-99`); `hr_source` está cerrado a `strap|healthkit|pm5` (mig 0153): no hay valor honesto para "pulso óptico del reloj". El importador FIT lo deja NULL (`web/lib/import/fit/materialize.ts:34-39`); si el motor Garmin quiere declararlo hay que ampliar el enum.

### Zepp OS
Zepp NO implementa contrato de pasos (ver §5): consume `plan/week` y pinta título + nº de bloques.

---
## 4. Dónde vive el modelo de paso y cómo se resuelven las zonas

- **Lo que dice el coach (fuente de verdad):** `shared/domain/prescription/types.ts`. `Modality` (run|row|ski|bike|strength|functional|core|mobility|other, l.66), `Target` (percent_rm, kg{implement_count}, rpe, rir, bodyweight, pace{unit per_km|per_500m|per_mile}, hr_zone, hr_bpm, calories, watts, time_cap, relative{ref…}; l.104-160), `Measure` (reps|distance|duration|calories|reps_to_failure, con `max`; l.471), `PrescriptionSet` (measure, target, is_approach, modality, rest_s, tempo, note; l.571), `Prescription` (scheme = formato, sets[], rounds/rounds_max, work_s, rest_s, total_s, start/increment, target, pace_cap, `structure?: RunStructure`; l.656-682). Formatos: `prescription/format.ts:69` (`WORKOUT_FORMATS`, familias metcon|endurance|strength|structural).
- **Correr estructurado:** `shared/domain/prescription/run-structure.ts`. `Segment{kind work|recovery, measure distance{m}|duration{s}, target pace|pace_zone|hr_zone|rpe|null, incline_pct, cadence_spm, recovery_mode trote|caminar|parado, resolved?}` (l.94-107), `Repeat{times 2..20, elements}` (l.111), `Phase{role warmup|main|cooldown}`, `RunStructure = Phase[]` (≤3 fases, anidamiento ≤2). Conversión legado↔estructura: `run-structure-convert.ts:222 legacyToStructure`.
- **Resolución por segmento:** `shared/domain/methodology/segment-resolve.ts:33 resolveSegmentTarget(target, benchmarks, {coachZones, hrZoneFractions})` → `resolveTarget` (`methodology/zones.ts:453`).
- **Zonas del coach a bandas absolutas:**
  - Ritmo (6 zonas por offsets): `CoachZone{code, label, color, role, sort_order, pace_unit, low_offset_s, high_offset_s}` (`methodology/zone-model.ts:41`); `resolveZonesForAthlete(testResult, coachZones)` → `ResolvedZone{fast_s, slow_s|null}` = umbral + offset (l.90). Defecto `STANDARD_ZONES_PER_KM/_PER_500M` (`zones.ts:100-119`). Snapshot por atleta en `athlete_zone_profiles`, servido por `GET /api/athlete/zones` (`web/app/api/athlete/zones/route.ts`, `modalities[].zones[]` + `hr`).
  - Pulso (5 zonas por % de LTHR): `hr-zones.ts` (`DEFAULT_HR_ZONE_FRACTIONS` l.98, `resolveThresholdHr` l.210, `resolveHrZones` l.240), fracciones del coach en `coach_hr_method`. Todo umbral es hoy estimado: ninguna pantalla escribe un `lthr_bpm` medido (DECISIONS.md:5029).
  - Anclas del atleta: `AthleteBenchmarks` (`zones.ts:40`: 1RM, 5k/10k, umbral, 2k remo, 1k ski, lthr, max_hr, edad).
- **Para el reloj:** `shared/domain/wearables/watch-workout.ts` (arriba) convierte todo a banda ABSOLUTA. Regla de honestidad: lo no resuelto va abierto con la etiqueta en el nombre. `web/lib/wearables/run-structure-source.ts:138-165` colapsa `pace_zone` a `pace{min_s,max_s}` usando la banda del perfil guardado (`absolutizeSegment`), para que reloj y app guíen contra el mismo número. Ergo, fuerza y WOD NO tienen equivalente en `shared/`: solo existen como `Vivo.Paso` (Swift) + `paso.ts` (kit del doble). `shared/domain/hyrox/stations.ts` tiene las estaciones.

---
## 5. Zepp (`zepp/`): el precedente NO es un motor

- **Implementa solo un visor del día.** 291 líneas en total: `page/index.js` (109) pinta "HOY" + título de cada sesión + "N bloques"; `app-side/index.js` (78) hace `GET /api/athlete/plan/week` y filtra el día por `getDay()` del móvil (no por la fecha local del reloj); `setting/index.js` (89) hace el login email+código y guarda el token en `settingsStorage`. `app.json`: `permissions: []`, plataforma única `st:r, dw:480`.
- **No hay:** grabación, ni pasos, ni objetivos, ni envío de resultados, ni cierre de entreno, ni sensores, ni zonas.
- **Arquitectura útil como precedente:** el reloj no tiene red directa en Zepp OS; toda petición pasa por el Side Service del móvil (`this.request({method:'GET_TODAY'})`, con timeout de 5 s). Login idéntico al de CIQ (mismos endpoints). Token en `settingsStorage`, no en el reloj.
- **Qué funcionó:** el login y la lectura del día tras el arreglo del 25-jul (`0c4f00b4`: leía `body.token` en vez de `session_token`, y los días en la raíz en vez de `week.days`; "Zepp nunca pudo entrar ni ver el día").
- **Qué quedó pendiente / sin verificar:** nunca probado en reloj real (hay flag `DEMO` porque el simulador no ejecuta el side-service; `setting/index.js:7-8` dice "la firma exacta de fetch en settings se confirma al probar"); `zepp/dist/1119717-FAHYBRID-1.0.0-20260710102723.zab` es del 10-jul, anterior al fix y al cambio de nombre (18-ago); no hay rastro en DECISIONS.md ni docs de un plan de Zepp. Lado servidor de Amazfit: `web/lib/sync/ingest-amazfit.ts` es un stub que no persiste nada ("TODO NOT YET IMPLEMENTED", l.1-30); los entrenos de Amazfit llegan hoy por Apple Salud (`healthkit`).
- Conclusión: para Garmin no hay ninguna experiencia de "motor en reloj de terceros" que heredar. El motor propio lo tiene solo watchOS.

---
## 6. Ingesta de resultados Garmin sin API

- **Health API de Garmin: pausada** para altas nuevas (DECISIONS.md:2345; `docs/garmin_setup.md:29-36`). El código existe y responde 503 sin claves: `web/app/api/garmin/{connect,callback,webhook}/route.ts` + `web/lib/sync/ingest-garmin.ts` (actividades idempotentes por `(athlete, source='garmin', external_id)`, laps fusionados con `planSegmentFusion`).
- **Importador FIT (`@garmin/fitsdk`)**, decidido el 13-ago (DECISIONS.md:2343-2353): `web/lib/import/fit/parse.ts:27 parseFitFile(bytes)` → `CanonicalActivity` (`canonical.ts`) → `materialize.ts:142 materializeFitActivity({sql, athlete_id, activity})`. Resultados `inserted | superseded | exists | skipped_live`. Escribe en las tablas de siempre con `source='garmin'`, `recorded_via='imported'`, `source_workout_ref` con prefijo `fit:`. Laps con `role work|recovery`, ruta a `workout_routes`, pulso a `biometric_streams`. Dedupe: la sesión viva gana; el FIT plano de Salud se sustituye. Límites conocidos (materialize.ts:34-60): `leg_phase`/`leg_index` no se rellenan (los laps de recuperación cuentan como trabajo), sin desnivel por tramo, `hr_source` NULL.
- **Falta el tramo de entrada.** `parseFitFile` solo lo llaman `materialize` y `web/lib/sync/ingest-coros.ts` (COROS por su API). No hay ruta ni job que reciba un FIT subido por el atleta: no existe `web/app/api/**/fit*`, ni upload-url para FIT (solo hay upload-url de chat, import de plan del coach y sensor-capture). La decisión del 13-ago prevé "subida prefirmada a Vercel Blob + job por lotes", sin construir. Tampoco hay UI iOS de subida.
- **Endpoint apto para recibir directamente el resultado de una app en el reloj:** SÍ, `POST /api/sync/workout-execution` (+ `workout-traces`), descrito en §3. Es el mismo que usa el teléfono, con bearer de atleta; no exige que el emisor sea iOS. Limitaciones para un cliente CIQ: (a) `makeWebRequest` de CIQ pasa por el móvil o el WiFi del reloj, sin cola offline propia (hay que guardar el resultado en Storage y reintentar); (b) no hay `session_id` idempotente del cliente; (c) el cuerpo con 200 tramos + series puede ser grande para un reloj; (d) `hr_source` cerrado.
- **Duplicado futuro:** una sesión grabada por el reloj (ActivityRecording) llegará también a Garmin Connect y, si se activa, por FIT/Health API/HealthKit. El servidor ya resuelve el solape: `replaceHealthImports` casa por `source_workout_ref` o ventana (`web/lib/sync/replace-health-import.ts:52-64`), y `materializeFitActivity` devuelve `skipped_live` si hay sesión viva. El motor de reloj debe mandar `recorded_via:'live'`, `source:'garmin'` y un `source_workout_ref` estable.

---
## Cierre

**Lo reutilizable (10)**
1. Login email+código y `Store`/`Api`/`Json`/`DateUtil`/`Controller` (patrón), `build.sh`, i18n es/en (`garmin-ciq/`).
2. Endpoints de auth vivos, con `/api/auth/refresh` para sesión deslizante de 180 días.
3. `POST /api/sync/workout-execution` (+ `/workout-traces`): ya acepta tramos con `leg_index/leg_role/leg_phase`, RPE, `completeness`, idempotente por `assignment_id`/`started_at`.
4. `GET /api/athlete/zones` (bandas de ritmo por modalidad y de pulso, resueltas por servidor).
5. `GET /api/athlete/assignments/[id]/detail` y `plan/week` como fuente del plan.
6. `WatchWorkout` + `buildWatchWorkout` + `run-structure-source.ts` (correr resuelto a bandas absolutas).
7. Codificador FIT de workout (`workout-encoder.ts`): sigue siendo válido para empujar entrenos al reproductor nativo de Garmin como vía alternativa.
8. Modelo `Paso` (`Vivo+Paso.swift` + `kit-reloj/paso.ts` + `docs/reloj-muneca/modelo.md`) como spec de dominio ya diseñada y validada contra 22 sesiones reales.
9. Materializador FIT y dedupe por `source_workout_ref`/ventana para reconciliar la sesión del reloj con lo que Garmin sincronice.
10. `pair-code` (vincular sin correo) y `athleteHrZones`.

**Lo que hay que crear (10)**
1. Endpoint de plan por lotes (7 días) que sirva PASOS normalizados, no `AssignmentDetail`. Hoy el paso vive solo en el cliente Swift.
2. Contrato de paso compartido en `shared/` (Zod + TS) para correr, ergo, fuerza, WOD y HYROX; hoy solo existe `paso.ts` en el kit del doble y el adaptador Swift.
3. M1-M8 aguas arriba: dos objetivos por paso, modo de recuperación, entorno, tandas anidadas, cue por paso. No están en el servidor.
4. Servir las reglas de aviso del coach (holguras, histéresis, preaviso) como dato: hoy son defectos en el cliente.
5. `session_id`/`source_workout_ref` generado en el reloj para reintentos idempotentes; ampliar `hr_source` si se quiere declarar "óptico del reloj".
6. Cola de subida offline en el reloj (Storage) + `POST` del resultado y de las series.
7. Motor en Monkey C: `ActivityRecording`, guía por objetivo, hápticos/alertas, HUD por familia, permisos nuevos (Positioning, Sensor, etc.; verificar en la doc del SDK).
8. Corregir el manifest (`tactix7`, `enduro2`) y decidir si entran Edge (un motor propio sí puede ejecutar en ciclocomputador).
9. Tests: unitarios de la máquina de estados y del plan, y una pasada real en reloj (nunca hecha).
10. Ruta de subida de FIT (prefirmada + job) para el histórico y como red de seguridad si el POST directo falla.

**Riesgos**
- Nadie ha probado nada de `garmin-ciq/` en un reloj real; los comportamientos de `makeWebRequest` sin móvil, límites de memoria de Storage y tamaño de cuerpo son supuestos.
- El emparejamiento por nombre y el "único por día" son falsos hoy; con motor propio desaparece, pero la versión actual puede servir entrenos de otro día.
- DECISIONS.md:4539-4547: Connect IQ no da acelerómetro en crudo, así que conteo de reps y detección de estación quedan fuera; fuerza y estaciones serán "lo dices tú".
- El servidor solo sabe correr en formato reloj; las sesiones mixtas exportan solo lo de correr sin avisar.
- Zonas de pulso: todo umbral es estimado (sin `lthr_bpm` medido). Si el reloj las muestra como medidas, contradice la regla de honestidad.
- El Health API de Garmin sigue pausado; el histórico depende del importador FIT, que no tiene ruta de entrada.
- Zepp no es precedente de motor: no hay lecciones de "motor en reloj de terceros", solo de login y proxy vía móvil.

# FH-56 — El enlace muñeca↔móvil lo dice Apple

Plan: `/workspace/fh56-plan/FH-56-PLAN.md` (DA PLAN GATE YES). Decisión: `docs/DECISIONS.md` 2026-09-21 · FH-56.

## Clase del síntoma

«A veces conecta, a veces no; tras usarlo una vez deja de engancharse.» Tres
máquinas caseras (bucle `startWatchApp` ×3, watchdog 15 s en el reloj, ventana
15/12 s en el móvil) decidían por su cuenta si el espejo estaba vivo; Apple, que
sí lo sabe (`didDisconnectFromRemoteDeviceWithError`), no era consultada.

## Qué cambia

| Lado | Antes | Ahora |
|---|---|---|
| Móvil, Empezar | `startWatchApp` ×3 cada 3 s + `didLaunchWatch` que corta para siempre | UN `startWatchApp` por intent; `watchLaunch = .launched/.failed(error)` visible en la card |
| Móvil, enlace | `WristMirrorTruth` (HR reciente = vivo) | `link ∈ {none, bound, disconnected(error)}` escrito sólo por Apple |
| Móvil, adopt sin motor | `deliverEnd(save: false)` — tiraba la grabación | `adoptAction` → reabrir del disco o `MirrorEnd(save: true)` |
| Móvil, final | 5 envíos en 8 s + soltar a los 10 s | 1 `MirrorEnd` + WCSession durable; UI a idle a los 10 s o en `.ended` |
| Móvil, `PhoneWorkoutRun` | 209 líneas muertas (`session` nunca asignada) | borrado; `hkSessionUUID` se estampa en `release` |
| Reloj, recover | `.orphan` sin espejo; `handle(_:)` siguiente ignorado | `.mirror` + `startMirroringToCompanionDevice` otra vez; `handle(_:)` compatible = re-espejar |
| Reloj, enlace | watchdog 15 s + `sync` 0.5/2/5 s | `link` de Apple; un `sync` al enlazar |
| Reloj, final | `forceIdle` a los 5 s suelta el handle con `finishWorkout` en vuelo | `finishing` hasta `.ended`; deadline sólo UI; start encolado dispara en `.ended` |
| Reloj, errores | `catch { }` mudo en `startMirroring` e `init` | estado (`link`, `lastStartError`) + `Logger` |
| Reloj, HUD | «Conectando…» inalcanzable | fuera; «Grabando en la muñeca · Sin conexión con el iPhone» lee `link` |

## Verificado (sin aparato, sin toolchain)

- grep en `ios/` (fuentes **y** `project.pbxproj`): `didDisconnectFromRemoteDeviceWithError`
  en los dos delegates; 0 `PhoneWorkoutRun`, 0 `WorkoutRunClock`, 0 `.orphan`,
  0 `isConnectionLost`, 0 `WristMirrorTruth`, 0 «Conectando…» en el HUD,
  0 `watchLaunchAttempts`.
- `project.pbxproj` regenerado con `xcodegen generate` (2.46.0, compilado desde
  fuente en Linux; dos pasadas byte-idénticas). El pbxproj anterior estaba editado
  a mano: fuera 5 referencias a ficheros que no existen (`PhoneWorkoutRun`,
  `WorkoutRunClock`, `WorkoutRunClockTests`, `PhoneMirrorEndRetryTests`,
  `ErgPreStartFlow`), dentro 33 fuentes que faltaban (entre ellas
  `FH56AppleLinkTests`, `PhoneMirrorEndTests`, `MirrorPrimaryLaunchPolicy`,
  `LiveLaunchPolicy`, `RunOutdoorBands`); `CURRENT_PROJECT_VERSION = 100`.
- `PreWorkoutFlowSourceTests` afirma las APIs vivas (`startAction`,
  `configurationsCompatible`, `shouldForceIdleFromStuckEnding`) y la ausencia de
  `shouldIgnoreRedundantStart` / `shouldFinishBeforeRestart` / `mirrorChannelAlive`.
- Tests Core nuevos: `FH56AppleLinkTests` (startAction matrix, adoptAction,
  un `startWatchApp` por begin, disconnect sin relanzar, adopt sin plan guarda,
  scan de fuente), `PhoneMirrorEndTests` (un envío, sin reintento, end idempotente).
- Apple por MCP apple-docs: `didDisconnectFromRemoteDeviceWithError` (iOS 17 /
  watchOS 10), `startMirroringToCompanionDevice` (watchOS 10), `startWatchApp`
  (iOS 10), `HKWorkoutSessionState`.

## No verificado

- **Compilación**: la máquina de build no tiene Swift/Xcode. El code gate y el
  primer `xcodebuild` del Owner son la verificación.
- Paso 0 del plan: si Apple acepta `startMirroringToCompanionDevice` sobre una
  sesión recuperada. Si lo rechaza, `link = .unlinked(error)` y el HUD lo dice.
- Orden handler vs `AppShell.task` en un relanzamiento del iPhone (el diseño
  converge en los dos órdenes: `recoverOnLaunch` se serializa).

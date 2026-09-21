# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-21** (FH-56 — code gate A+B cerrados en PR #190, pendiente re-gate)

## Ahora

**FH-56 — El enlace muñeca↔móvil lo dice Apple (PR pendiente de Devil's Advocate CODE gate).**
Build 100. Plan: `/workspace/fh56-plan/FH-56-PLAN.md`; decisión en `docs/DECISIONS.md`
(2026-09-21 · FH-56); nota `docs/pr/fh56-apple-link.md`.
- `didDisconnectFromRemoteDeviceWithError` implementado en móvil y reloj; el enlace
  es tri-estado de Apple en los dos lados, sin watchdog ni ventana de señal
- UN `startWatchApp` por Empezar (`watchLaunch` con el resultado de Apple en la card)
- Adoptar sin motor GUARDA (`adoptAction` → coach / reopenFromDisk / endSaving); nunca descarta
- Primario recuperado = `.mirror` que re-espeja; `handle(_:)` redundante = re-espejar
- Handle HK hasta `.ended` (`finishing`); deadline 5 s sólo UI; start encolado dispara en `.ended`
- Borrado: `PhoneWorkoutRun`, `WorkoutRunClock`, `WristMirrorTruth`, `.orphan`,
  reintento ×5 de `MirrorEnd`, overlay «Conectando…»
- Code gate NO (P0 A+B) cerrado: `project.pbxproj` regenerado con xcodegen 2.46.0
  (5 fantasmas fuera, 33 fuentes que faltaban dentro, build 100);
  `PreWorkoutFlowSourceTests` contra `startAction` / `configurationsCompatible`
- **Swift sin compilar aquí** (hay toolchain Linux para xcodegen, no Xcode): el
  primer `xcodebuild` del Owner es la verificación de compilación

**FH-30 — Cara rodaje muñeca (PR #189, mergeado).** Lámina redo cerrada.

## Pendiente decisión Alex

- FH-56 paso 0 con aparato: ¿acepta Apple `startMirroringToCompanionDevice` sobre
  una sesión recuperada? Si no, el HUD dice «Sin conexión con el iPhone» y hace
  falta Terminar+Empezar (no se inventa un segundo motor).
- FH-56 riesgo §7: `.endSaving` deja en Salud una grabación sin ejecución atada (se guarda, no se tira).
- Smoke TF build **100** con la matriz §6 del plan (7 casos + soak 2 h).

## Sabido y no hecho

- FH-30: `PhoneLiveSession.applyCommand` no relaya `.newLap` al motor (latente).
- FH-30: `GuionSeries` queda sin vía viva en el espejo — retirada pendiente.
- FH-56: la fila «Reconectar reloj» en `LiveConectividadSheet` es subjetiva — no añadida.

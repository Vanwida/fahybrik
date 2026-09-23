# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-23** (panel del coach reconstruido; ola 3 de pulido en curso)

## Ahora

**Panel del coach (web `(v2)`) — RECONSTRUIDO, pulido final en curso.** Alex aprobó
el plan entero de la auditoría (`docs/auditoria-panel-coach/`, plan de obra en
`PLAN-CONSTRUCCION.md`; decisiones en DECISIONS 2026-09-23). Rama
`claude/focused-bardeen-u9zz33`.
- Hecho: shell nuevo (Hoy casa · Atletas · Mensajes · Programar · Negocio tras add-on),
  Hoy = bandeja única (con 100 atletas: 42 «te necesitan», filas + grupos con acción en
  lote), Atletas tabla densa con vistas, ficha = cockpit con 3 pestañas, Programar
  (programas, biblioteca, grupos, tests, asignar a varios ≈15 clics para 20 atletas),
  publicación por semana con auto N días, Negocio y Ajustes por coach, guía reescrita.
- Motor: una señal vs la base del propio atleta, una adherencia (solo lo debido), un
  estado, una cuenta de «te necesitan»; umbrales = dato del coach (0211–0243).
- Tests: sin regresiones frente a la base (27 ficheros fallan igual: dependen de la rama
  demo de Neon).
- UI toda sobre primitivos: `panel/no-raw-styled-control` es ya error (v2 + media).
- Falta: QA visual final, revisión completa para FLEXR (petición de Alex).
- PROD: aplicar migraciones 0211–0243 en Neon; fila de entitlement 'negocio' para el club.

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

- Panel coach: borrar código muerto (sin importadores) que el clasificador de permisos no
  deja borrar a los agentes: `web/components/v2/orientacion/**`,
  `web/lib/dashboard/v2/orientacion{,-types}.ts`, `web/components/v2/{SegmentedControl,
  InlineSave,OrderAlteredSignal,Rail,SessionLine}.tsx`, `v2/periodizacion/SidePanel.tsx`,
  `v2/tests/chrome.tsx`. Al borrarlos, quitarlos de los `ignores` de eslint.config.mjs.
- FH-56 paso 0 con aparato: ¿acepta Apple `startMirroringToCompanionDevice` sobre
  una sesión recuperada? Si no, el HUD dice «Sin conexión con el iPhone» y hace
  falta Terminar+Empezar (no se inventa un segundo motor).
- FH-56 riesgo §7: `.endSaving` deja en Salud una grabación sin ejecución atada (se guarda, no se tira).
- Smoke TF build **100** con la matriz §6 del plan (7 casos + soak 2 h).

## Sabido y no hecho

- Panel coach: sin Stripe Connect (Cobros lee, no cobra); huso del coach solo en
  Agenda (el resto del «día» usa BOX_TIMEZONE, sin editor en Ajustes › Tu club).
- Seeds: `seed_demo.ts` desfasado (`chat_messages.sender_role`); `0051` no corre en
  `migrate.ts` (CONCURRENTLY dentro de transacción).
- FH-30: `PhoneLiveSession.applyCommand` no relaya `.newLap` al motor (latente).
- FH-30: `GuionSeries` queda sin vía viva en el espejo — retirada pendiente.
- FH-56: la fila «Reconectar reloj» en `LiveConectividadSheet` es subjetiva — no añadida.

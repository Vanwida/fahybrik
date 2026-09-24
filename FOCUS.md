# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-24** (PR #191 en verde, espera migraciones en Neon; el reloj es el producto → diseño Watch-first)

## Ahora

**EL RELOJ ES EL PRODUCTO (Alex, 24-09).** La muñeca lleva la sesión desde el primer día; se
descarta «teléfono ahora, reloj después» (DECISIONS 24-09). EN CURSO: diseño Watch-first
(modelo + roto contra sesiones reales + dónde falla) para firmar antes de tocar Swift.
**Auditoría de la app del atleta (iOS + watchOS) — ENTREGADA.** `docs/auditoria-app-atleta/`.
6 raíces: enlace del reloj diseñado para fallar · entreno terminado no durable · lo del coach
no llega · la app dice lo que ningún coach decidió · empezar/terminar peor que el mercado ·
nada compila ni prueba el iOS (fase 0 = CI macOS). Arreglos de servidor HECHOS en el PR #191.

**Panel del coach (web `(v2)`) — RECONSTRUIDO y REVISADO para FLEXR.** Rama
`claude/focused-bardeen-u9zz33`. Auditoría: `docs/auditoria-panel-coach/`. Revisión
pre-FLEXR (4 lentes: aislamiento, método, producto, plataforma) y decisiones de Alex:
`docs/revision-flexr/index.html` (https://claude.ai/artifact/EhJpMWGaSBkytzi5LVaUb2).
- Hoy = bandeja única (100 atletas: 55 te necesitan = Atletas = barra; Acción 7,
  Vigilar 32, sin «Acción» sin base); asignar un programa a 20 = 4 clics.
- Aislamiento: 3 agujeros P0 cerrados (clonar plantillas ajenas, partes de sesión,
  Google Calendar global → por coach 0254) + P1; tests de dos coaches en `web/tests/tenancy/`.
- Método = dato del coach con defecto (0211–0260): motores secundarios, niveles,
  zonas, lecturas de carrera, cadencia de tests, huso del coach; editores en Ajustes.
- PENDIENTE DE ALEX (revisión §decisiones): app de los atletas, quién cobra, alta de
  coaches, precio, despliegue, dominios, deportes, idioma, arranque de un club, RLS,
  legal, permiso para borrar código muerto.
- PR #191 → `main`: CI verde. Se fusiona cuando Alex aplique en Neon 0211–0260 y 0270–0272
  (revisadas contra datos reales: seguras; migrar y fusionar seguido) y el entitlement 'negocio'
  del club 60 (pasos y SQL en el PR). Hasta entonces `main` (prod) da 500 en cada alta desde 09-05.
- Tras el deploy: reconectar Google Calendar (ahora por coach); cron lifecycle pasa a horario (vercel.json); alta de pago apagada para cualquier club que no sea FAHYBRID hasta decidir quién cobra.

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

- Panel coach: borrar código muerto sin importadores (el clasificador no deja a los
  agentes): `web/components/v2/orientacion/**`, `web/lib/dashboard/v2/{orientacion,
  orientacion-types,periodizacion}.ts`, `web/components/v2/{SegmentedControl,InlineSave,
  OrderAlteredSignal,Rail,SessionLine}.tsx`, `v2/periodizacion/SidePanel.tsx`,
  `v2/tests/chrome.tsx`, `v2/intake/IntakeBlockStructure.tsx`, `v2/ajustes/LevelAxisSetting.tsx`,
  `web/lib/coach/{deep-dive-body,deep-dive-body-demo,demo-events,program-weeks}.ts`,
  `infra/scripts/seed_exercises.ts`, `buildAthletePlan` de `coach/deep-dive-plan.ts`, `athlete-profile-shell.ts` (solo lo usa un test); tabla `google_oauth_tokens`. Luego quitar los
  `ignores` de eslint.config.mjs.
- FH-56 paso 0 con aparato: ¿acepta Apple `startMirroringToCompanionDevice` sobre
  una sesión recuperada? Si no, el HUD dice «Sin conexión con el iPhone» y hace
  falta Terminar+Empezar (no se inventa un segundo motor).
- FH-56 riesgo §7: `.endSaving` deja en Salud una grabación sin ejecución atada (se guarda, no se tira).
- Smoke TF build **100** con la matriz §6 del plan (7 casos + soak 2 h).

## Sabido y no hecho

- Panel coach: sin Stripe Connect (Cobros lee, no cobra); crons en serie por coach
  (no aguantan ~20 clubs); sin RLS; panel solo en castellano; crons a hora UTC fija (falta hora
  de entrega por coach) y `resolvePeriod` sin el día local de la app (DECISIONS «Qué día es…»).
- Seeds: `seed_demo.ts` desfasado (`chat_messages.sender_role`). Cadena personal: un mes de
  biblioteca en medio bloquea acortar/borrar (409; decisión de producto en DECISIONS).
- FH-30: `PhoneLiveSession.applyCommand` no relaya `.newLap` al motor (latente).
- FH-30: `GuionSeries` queda sin vía viva en el espejo — retirada pendiente.
- FH-56: la fila «Reconectar reloj» en `LiveConectividadSheet` es subjetiva — no añadida.

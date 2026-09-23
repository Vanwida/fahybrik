# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-23** (auditoría del panel del coach entregada; esperando 7 decisiones de Alex)

## Ahora

**Auditoría del panel del coach (web `(v2)`) — entregada, esperando decisiones de Alex.**
Documento: `docs/auditoria-panel-coach/index.html` (publicado:
https://claude.ai/artifact/K1ow8BzisviftwYAJJnYG9); 5 informes de área en `informes/`.
Probado en local con 100 atletas sintéticos. Veredicto: reconstruir Hoy, ficha,
Programar, IA y sistema visual; conservar backend, tokens, piel del club y 6 pantallas.
- 5 raíces: números que se contradicen · sin bandeja única (Hoy = 92 «decisiones»,
  114 tarjetas) · no se actúa en lote (≈500 clics para dar un bloque a 20) · IA por
  modelo de datos (15 destinos, 12 vistas en la ficha) · sin sistema de componentes
- Orden propuesto: 0 cimientos (una señal, una adherencia, un estado, scope por coach,
  primitivos) → 1 shell+Hoy+Atletas → 2 ficha → 3 Programar → 4 Negocio/Ajustes/móvil
- NADA construido todavía (regla UX: maqueta → OK de Alex → construir)

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

- Panel coach (auditoría §Your decisions): 1 home = Hoy · 2 oscuro por defecto ·
  3 «Programa» en vez de «Microciclo» · 4 Grupos antes que nivel×días · 5 ficha =
  cockpit + 2 pestañas · 6 publicar por semana + auto N días · 7 Negocio tras add-on.
  1, 2, 4 y 5 revocan DECISIONS 2026-08-19/20, 08-23 y 08-13.
- FH-56 paso 0 con aparato: ¿acepta Apple `startMirroringToCompanionDevice` sobre
  una sesión recuperada? Si no, el HUD dice «Sin conexión con el iPhone» y hace
  falta Terminar+Empezar (no se inventa un segundo motor).
- FH-56 riesgo §7: `.endSaving` deja en Salud una grabación sin ejecución atada (se guarda, no se tira).
- Smoke TF build **100** con la matriz §6 del plan (7 casos + soak 2 h).

## Sabido y no hecho

- Panel coach P0 (auditoría §Launch blockers): Negocio sin `coach_id` (leads, citas,
  métricas, disponibilidad); «Pablo te escribirá» en copy; sin Stripe Connect;
  Cuestionarios sin consumidor; «Descanso» borra el día sin confirmar; guardar bloque
  nuevo → 404; «Responder» abre otro hilo y lo marca leído; `compliance_pct` 0–1
  pintado como %.
- Seeds: `seed_demo.ts` desfasado (`chat_messages.sender_role`); `0051` no corre en
  `migrate.ts` (CONCURRENTLY dentro de transacción).
- FH-30: `PhoneLiveSession.applyCommand` no relaya `.newLap` al motor (latente).
- FH-30: `GuionSeries` queda sin vía viva en el espejo — retirada pendiente.
- FH-56: la fila «Reconectar reloj» en `LiveConectividadSheet` es subjetiva — no añadida.

# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-29** (analíticas rehechas: cumplimiento y panel del coach fusionados en main, migraciones 0279–0281 en prod)

## Ahora

**FIX GUARDADO 500 (29-09, sin desplegar):** un tramo `run` de 0 m en el historial (atleta 64) partía por cero en `running-prs.ts` y tumbaba TODO guardado suyo; arreglado + savepoint en `detectPrs`. Tras deploy la cola de la app lo reintenta sola.

**LAS PESTAÑAS, CON EL DISEÑO DE «HOY · EL DÍA» (29-09, doble, main).** Alex firmó «El día» para Hoy (DECISIONS 29-09; «El pulso» descartado). En curso: Plan, Carreras y Perfil en el mismo diseño (`/design/pestanas`, kit `kit-dia`); luego las cuatro a Swift (lo instala Alex). Analíticas sigue con su diseño firmado (¿unificar la piel? pendiente de Alex).

**ANALÍTICAS REHECHAS (29-09; modelo `docs/analiticas/modelo.md`; ya en main; DECISIONS 29-09).** Un solo cálculo (`cargarPanel`)
para el iPhone y el panel del coach. Piezas, cada una con su entrada en DECISIONS:
- Cimientos del motor (`worktree-agent-a342e82f006cd9120`, 0277): contrato `Lectura`, ventana única en el día local, anclas
  resueltas una vez, carga única por tramo, forma/fatiga con proyección a la carrera, umbrales declarados de un toque, método del coach.
- Cinco fallos de datos (`claude/analiticas-datos`, 0278): readiness como texto, zonas más largas que su tramo, saltos imposibles,
  1.277 importaciones de Salud sin tipo, 13 copias de libres. Aplicar 0278 ANTES del deploy y luego `pnpm --dir infra backfill:zonas`.
- Progreso y récords (`worktree-agent-a07fb545a296d59ca`, 0280): «¿mejoro?» de las siete familias + lista única de récords.
- Intensidad, recuperación, carrera y detalle de sesión (`worktree-agent-a700671c0309eea89`, 0279): basal única (P3/P16) que ya leen
  roster, barrido, ficha, disposición y readiness; las bandas del readiness las sirve la API (P14). Falta Swift leyendo `bands`.
- Cumplimiento (`worktree-agent-aea0d21b345de9122`, 0281): por tramo, por sesión y adherencia de solo lo debido. Falta holgura en el vivo.
- Propuestas en el doble (`worktree-agent-af9303cea786f40b4`): `/design/analiticas`, kit `kit-analiticas/`; FIRMADAS por Alex el 29-09.
- **PANEL DEL COACH (fusionado en main, 29-09):** pestaña Rendimiento
  con los ocho bloques y el detalle de sesión; editor del método en Ajustes › Método (todos los campos que el motor lee, defectos
  editables); umbrales declarados de un toque. Retirado lo viejo que el panel cubre (DECISIONS). Verificado en navegador 390/768/1440
  contra rama Neon desechable; tsc limpio y 736 tests de ajustes/analíticas/ficha en verde. El editor heredado (`d4a303d7`) auditado:
  ninguna regla cruzada cruza grupos (test), esquema y CHECK de la tabla alineados (test con base real). DECISIONS 29-09.
- Migraciones 0277–0281 aplicadas en prod (0279–0281 el 29-09, 248 registradas, 0 pendientes). FALTA en analíticas: UI del atleta en Swift (rama del iPhone en curso); capa de voz de
  coach para `explica_es`; los campos del método que el motor aún no lee (DECISIONS); decisiones abiertas de Alex en esa entrada.

**iPhone · EL ENTRENO MINIMIZADO SE VE (29-09, main).** Barra de sistema sobre las pestañas con crono y paso; tocarla vuelve al mismo
motor; la tarjeta del scroll queda para «guardado para luego». Falta probarlo en aparato (build siguiente).

**iPhone · EL VIVO NUEVO (28-09, firmado por Alex; galería https://claude.ai/artifact/YN3iFbkZYGHSn1S5hsgb8t, propuestas `iphone-vivo-*`).**
Swift en `claude/vivo-swift-release` y `-2` (sin fusionar): bandera encendida en release, dobles/relevo, salir sin terminar, saltar de
tramo, RX/Escalado por bloque metcon, pausa sola a los 10 s, Estructura del circuito. CI verde. Falta prueba en aparato; el shell
viejo se borra tras ella. Build iOS en Xcode Cloud para TestFlight: lo instala Alex. Reloj para la demo (28-09): 6 fallos de la muñeca
arreglados; falta aparato.

**UN SOLO ENTRENO (28-09).** Libre ≡ sesión del coach al guardar, escribir y leer: 0274–0276 aplicadas en prod + backfill de
plantillas; ramas `fix/un-solo-entreno`, `fix/plantilla-escritor-unico`, `ios/motor-libre-un-objeto` (motor por formato) y
`worktree-agent-acf4f0bae662f59a6` (coach ve libres solo lectura), sin fusionar. Contratos iOS: `docs/pr/un-solo-entreno.md`,
`docs/pr/lectores-libre-coach.md`, `docs/pr/ios-motor-libre.md` (falta servidor: `round_index`, `workout.modality`, segmentos en /free/plan).

**LA MUÑECA SE REHACE Y EL RELOJ ES EL PRODUCTO (24-25-09; listón TrainingPeaks).** Auditoría `docs/reloj-muneca/` y diseño firmado
`docs/el-reloj-primero/` (SF nativo, el objetivo manda, voz al cambiar de paso y cada km). Hechas las fases 0+1 (CI macOS, registro
técnico 0273, sesión 180 d, cola sin caducidad, acuses) y las 6 propuestas `reloj-*` sobre `kit-reloj`. Falta la firma de Alex sobre
las pantallas → Swift (correr primero); exige arreglos de modelo M1–M8. PR #192 (fases 0+1) abierto: no fusionar sin 0270–0273 en
prod (a 24-09 faltaban; comprobar con el runner antes de asumir). Auditoría de la app del atleta: `docs/auditoria-app-atleta/`.
FH-56 (enlace muñeca↔móvil lo dice Apple, build 100, nota `docs/pr/fh56-apple-link.md`).

**Panel del coach (web `(v2)`) RECONSTRUIDO y revisado para FLEXR** (rama `claude/focused-bardeen-u9zz33`; auditoría
`docs/auditoria-panel-coach/`, revisión `docs/revision-flexr/index.html`). Hoy = bandeja única; aislamiento entre coaches con tests
en `web/tests/tenancy/`; método = dato del coach con defecto (0211–0260). DECIDIDO 24-09: app FLEXR (repo nuevo al final), Stripe
Connect, alta por solicitud + aprobación, RLS antes del coach 20. PR #191 fusionado (24-09): tras el deploy, reconectar Google
Calendar por coach; alta de pago apagada para todo club que no sea FAHYBRID hasta Stripe Connect.

## Pendiente decisión Alex

- Analíticas: las cinco decisiones abiertas de DECISIONS 29-09 (voz de coach, «Dar feedback», 1RM medido en el motor, copy de
  Umbrales, Progreso a 1440) y la firma de las pantallas del reloj.
- Panel coach: borrar código muerto sin importadores (el clasificador no deja a los agentes): `web/components/v2/orientacion/**`,
  `web/lib/dashboard/v2/{orientacion,orientacion-types,periodizacion}.ts`, `v2/{SegmentedControl,InlineSave,OrderAlteredSignal,Rail,
  SessionLine}.tsx`, `v2/periodizacion/SidePanel.tsx`, `v2/tests/chrome.tsx`, `v2/intake/IntakeBlockStructure.tsx`,
  `v2/ajustes/LevelAxisSetting.tsx`, `web/lib/coach/{deep-dive-body,deep-dive-body-demo,demo-events,program-weeks}.ts`,
  `infra/scripts/seed_exercises.ts`, `buildAthletePlan` de `coach/deep-dive-plan.ts`, `athlete-profile-shell.ts`; tabla
  `google_oauth_tokens`. Luego quitar los `ignores` de eslint.config.mjs.
- FH-56 con aparato: ¿acepta Apple `startMirroringToCompanionDevice` sobre una sesión recuperada? Si no, hace falta Terminar+Empezar.
  Riesgo: `.endSaving` deja en Salud una grabación sin ejecución atada. Smoke TF build 100 (matriz §6: 7 casos + soak 2 h).

## Sabido y no hecho

- Carga: ficha, deep dive, cohorte, app del atleta y race-readiness usan aún 42/7 fijos en algún sitio; el CTL/ATL del coach solo lo lee
  `lecturas.ts` (la ficha ya sale del panel).
- Panel coach: sin Stripe Connect (Cobros lee, no cobra); crons en serie por coach (no aguantan ~20 clubs); sin RLS; solo castellano;
  crons a hora UTC fija y `resolvePeriod` sin el día local de la app (DECISIONS «Qué día es…»).
- MCP del asistente: la búsqueda en la biblioteca falla con `column b.archived_at does not exist` (0236): su base no la tiene.
- Seeds: `seed_demo.ts` desfasado (`chat_messages.sender_role`). Cadena personal: un mes de biblioteca en medio bloquea acortar/borrar (409).
- FH-30: `PhoneLiveSession.applyCommand` no relaya `.newLap` al motor (latente); `GuionSeries` sin vía viva en el espejo.

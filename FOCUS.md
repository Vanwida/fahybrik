# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-30** (complicación de reloj con lo de hoy; editor de correr: entorno, aviso y frase; analíticas del iPhone: detalle y cierre; reloj: fuerza, ergo y correr en la cara nueva, entrada nueva y lanzamiento automático; modelo del reloj Garmin)

## Ahora

**FICHA DE LA SESIÓN · DOS PROPUESTAS (02-10, doble `/design/ficha-guion` y `/design/ficha-ruta`; DECISIONS 02-10).** Alex: la ficha previa «se ve mal». A = la hoja (una línea por movimiento), B = la ruta (mapa de bloques y uno cada vez), sobre un contrato (`kit-ficha`) y 16 sesiones. Sin firmar; nada en Swift. Siguiente: que Alex elija o mezcle y construirlo sobre `LecturaSesionPrevia`.

**EDITOR DE CORRER · ENTORNO, AVISO Y FRASE PARA EL RELOJ (30-09, worktree `agent-a1e4bc45135113ff8`, sin fusionar; DECISIONS 30-09).** El coach ya edita por tramo dónde se corre (calle, cinta con inclinación, pista), hacia dónde avisa (defecto = su método) y una frase de 80 caracteres. Guardado probado contra rama Neon. Falta: firma de Alex del layout, y el reloj aplicando `alert`.

**RELOJ · LA ESFERA Y EL SMART STACK DICEN LO DE HOY (30-09, worktree `agent-a2aba4fd09a67fc18`, sin fusionar; DECISIONS 30-09).** Extensión
`FAHYBRIKWatchWidgets` (rectangular, esquina, inline, circular) que lee lo de hoy del App Group `group.<bundle>`; un toque abre el brief. Estados: sesión,
descanso, hecha, sin plan. Falta: aparato (`widgetURL`, ranking del Smart Stack) y que Xcode registre el App Group al firmar (ver informe).

**FIX GUARDADO 500 (29-09, sin desplegar):** un tramo `run` de 0 m en el historial (atleta 64) partía por cero en `running-prs.ts` y tumbaba TODO guardado suyo; arreglado + savepoint en `detectPrs`. Tras deploy la cola de la app lo reintenta sola.

**RELOJ · FUERZA Y ERGO EN LA CARA NUEVA (30-09, rama `worktree-agent-a08aa87d85a4f8e6b` = la de correr + fuerza + ergo, sin fusionar; DECISIONS 30-09).** Serie, colócate, anotar en el descanso (reps, carga, RIR con la corona), ejercicios y ergo con segundo objetivo (M1: `pace_cap`), por solitario y espejo con la misma cara. Falta aparato (corona en el dato, doble toque) y capturas; lo viejo se borra al final.

**RELOJ · CORRER, LA CARA NUEVA EN SOLITARIO Y EN ESPEJO (30-09, rama `worktree-agent-a6f6e3920e890764a` = núcleo + vistas + cable + espejo, sin fusionar en main; DECISIONS 29-09 y 30-09).** Núcleo puro (`Vivo.cuadroMuneca`, ritmo actual, `Vivo.Paso` Codable), pila en `FAHYBRIKWatch/Muneca/` tras `MunecaBandera` (encendida), cable (`MirrorWirePlan`: plan + cursor) y espejo pintando la MISMA pila (`MunecaEspejo`, `CaraDelEspejo`): nueva solo al correr de corrido con cuadro; si no, todo lo de siempre. **F3 hecha (rama `worktree-agent-aa538ed5ab37a4c85`, sin fusionar; DECISIONS 30-09):** director de hápticos por evento (`Vivo+Director`, `MunecaHaptics`), `Vivo.PoliticaHaptica` que calla lo heredado con la cara nueva, `Objetivo.avisa` relleno (rodaje a zona solo por arriba) y cierre seguro (el último paso pregunta «¿Terminar y guardar?»; «Descartar» con el enlace roto). Falta aparato (plan por `sendToRemoteWorkoutSession`, doble toque, corona anidada, Always-On, distinguir los golpes corriendo) y: deshacer (F3b), voz (F4), método/M3/M8 en servidor (F5, incl. leer `wristMethod`), puertas y final natural (F6), complicación (F7), retirada de lo viejo (F8).

**RELOJ · SE LANZA SOLO AL EMPEZAR (29-09, worktree `agent-a6bcbe816a50de313`, sin fusionar; DECISIONS 29-09).** «No conecta» = una carrera sin calle/cinta no lanzaba
el reloj ni lo decía. Ahora siempre lanza sin preguntar (fuera «Preparar grabación» y «Continuar sin reloj»), deja rastro (`start_watch_app_skipped`), relanza 1 vez
por alcance si Apple dio error y muestra el estado real (chip). Falta aparato con reloj.

**iPhone · LAS CINCO PESTAÑAS Y SUS PANTALLAS SECUNDARIAS, EN «EL DÍA» (30-09; en main hasta `8dab606a`, el lote 2 en `integracion-30sep`; DECISIONS 30-09).**
Hoy, Plan, Carreras, Perfil y Analíticas en Swift sobre UN kit (`Theme/Dia/`, CONTRATO-UI §11) más todo lo que cuelga de ellas (hojas, detalles, post-entreno,
sesión previa, dispositivos, bloques). Borrados el vivo antiguo (`RunLiveShellView`, bandera) y sus HUD; el vivo usa las holguras y avisos del coach
(`WristMethod`→`ReglasAviso`). Faltan: diálogos del entreno en vivo y pantallas de dispositivos/captura (agente en curso), Onboarding/Auth/Nutrición/Day1 con la piel vieja,
reloj 67/45 fijos, cortes por fila del detalle de disposición y `JumpProfileDTO` (piden servidor). Sin ver en aparato. Lo instala Alex.

**ANALÍTICAS REHECHAS (29-09; modelo `docs/analiticas/modelo.md`; en main; DECISIONS 29-09).** Un solo cálculo (`cargarPanel`) para el iPhone y el panel del coach:
motor (0277), datos (0278: aplicar ANTES del deploy y luego `pnpm --dir infra backfill:zonas`), progreso y récords (0280), intensidad/recuperación/carrera (0279, bandas del readiness
servidas por API), cumplimiento (0281). Migraciones 0277–0281 en prod (0 pendientes). Panel del coach: pestaña Rendimiento + Ajustes › Método. iPhone: pestaña y detalles en Swift
(la pestaña vieja ya no existe). FALTA: voz de coach para `explica_es`, los campos del método que el motor aún no lee, y las decisiones abiertas de Alex (DECISIONS 29-09).

**RELOJ · ESPEJO CON TRES PÁGINAS (29-09, worktree `agent-afdc843ecfbddfffc`, sin fusionar; DECISIONS 29-09).** Datos | Vivo | Controles al correr también en espejo; falta aparato.

**iPhone · EL ENTRENO MINIMIZADO SE VE (29-09, main).** Barra de sistema sobre las pestañas con crono y paso; tocarla vuelve al mismo
motor; la tarjeta del scroll queda para «guardado para luego». Falta probarlo en aparato (build siguiente).

**iPhone · EL VIVO NUEVO (28-09, firmado por Alex; galería https://claude.ai/artifact/YN3iFbkZYGHSn1S5hsgb8t, propuestas `iphone-vivo-*`).**
Swift en `claude/vivo-swift-release` y `-2` (sin fusionar): bandera encendida en release, dobles/relevo, salir sin terminar, saltar de
tramo, RX/Escalado por bloque metcon, pausa sola a los 10 s, Estructura del circuito. CI verde. Falta prueba en aparato (el shell viejo ya está borrado, 30-09). Build iOS en Xcode Cloud para TestFlight: lo instala Alex. Reloj para la demo (28-09): 6 fallos de la muñeca
arreglados; falta aparato.

**UN SOLO ENTRENO (28-09).** Libre ≡ sesión del coach al guardar, escribir y leer: 0274–0276 en prod + backfill; ramas `fix/un-solo-entreno`, `fix/plantilla-escritor-unico`,
`ios/motor-libre-un-objeto` y `worktree-agent-acf4f0bae662f59a6`, sin fusionar. Contratos: `docs/pr/{un-solo-entreno,lectores-libre-coach,ios-motor-libre}.md` (falta servidor: `round_index`, `workout.modality`).

**RELOJ GARMIN, MOTOR PROPIO EN CONNECT IQ (29-09; modelo `docs/garmin-reloj/modelo.md`, DECISIONS 29-09).** Ya no reproductor nativo: watch-app de
actividad que guía pasos, graba FIT y envía el resultado a `workout-execution` (TrainingPeaks en Garmin = calendario nativo, sin fuerza ni
RPE). Corrige DECISIONS 06-08: Connect IQ SÍ da acelerómetro a 100 Hz en lotes. NO prometer Training Status hasta la prueba T1 en reloj real.
App Monkey C de CORRER en `garmin-ciq/` (30-09, main 01e88373): 36 relojes compilan, 76/76 tests en simulador, login en el propio reloj, plan por `GET /api/athlete/wearables/garmin/plan` (shared/domain/watch-plan). `.prg` FR965/FR970 con `./build.sh`. SIN desplegar el endpoint (lo coordina la sesión-enlace) y SIN probar en reloj real (T1–T14, de Alex). Fuerza/circuito/WOD/ergo en el reloj = «va en la app» (fase 2). Diseño de todas las familias en el doble (`garmin-*`, kit `kit-garmin`, ~2.300 pruebas); contrato en `docs/garmin-reloj/`. PENDIENTE OK: B1/B7/G6 (DECISIONS 29-09).

**LA MUÑECA SE REHACE Y EL RELOJ ES EL PRODUCTO (24-25-09; listón TrainingPeaks).** Auditoría `docs/reloj-muneca/` y diseño firmado
`docs/el-reloj-primero/` (SF nativo, el objetivo manda, voz al cambiar de paso y cada km). Hechas las fases 0+1 (CI macOS, registro
técnico 0273, sesión 180 d, cola sin caducidad, acuses) y las 6 propuestas `reloj-*` sobre `kit-reloj`. Falta la firma de Alex sobre
las pantallas → Swift (correr primero); exige arreglos de modelo M1–M8. PR #192 (fases 0+1) abierto: no fusionar sin 0270–0273 en
prod (a 24-09 faltaban; comprobar con el runner antes de asumir). Auditoría de la app del atleta: `docs/auditoria-app-atleta/`.
**Reloj · LA ENTRADA YA HABLA EL LENGUAJE DEL LIENZO (29-09, rama `worktree-agent-a8049b68b5dbef775`, sin fusionar).** Brief con la estructura real del plan, descanso, hecho, retomar,
cómo llegas y espera del iPhone en `Views/Entrada/` (DECISIONS 29-09). Sin dato en el reloj y omitido: «GPS listo»/pulso, calle/cinta.
FH-56 (enlace muñeca↔móvil lo dice Apple, build 100, nota `docs/pr/fh56-apple-link.md`).

**RELOJ · CORRER, F5 SERVIDOR (29-09, rama `worktree-agent-af00ecda6d4b2f6be`, sin fusionar; migración 0282 SIN aplicar en prod; DECISIONS 29-09).** El método del coach de la muñeca (26 `wrist_*` + palabras del RPE) es dato con defecto, editable en Ajustes › Método «Reloj…», y viaja como `wrist_method` en el detalle de asignación; gramática con `environment`/`cue`/`alert`; decoder Swift listo. Falta: que el director del reloj lo consuma y la UI del coach para el entorno, el cue y el aviso por tramo.
**Panel del coach (web `(v2)`) RECONSTRUIDO para FLEXR** (auditoría `docs/auditoria-panel-coach/`, revisión `docs/revision-flexr/index.html`):
bandeja única, aislamiento entre coaches con tests en `web/tests/tenancy/`, método = dato del coach (0211–0260). DECIDIDO 24-09: app FLEXR,
Stripe Connect, alta por solicitud, RLS antes del coach 20. PR #191 fusionado: reconectar Google Calendar por coach; pago apagado salvo FAHYBRIK.

## Pendiente decisión Alex

- Analíticas: las cinco decisiones abiertas de DECISIONS 29-09 (voz de coach, «Dar feedback», 1RM medido en el motor, copy de
  Umbrales, Progreso a 1440) la firma de las pantallas del reloj (Apple y Garmin) y qué Garmin físico hay.
- Panel coach: borrar código muerto sin importadores (el clasificador no deja a los agentes): `web/components/v2/orientacion/**`, `v2/{SegmentedControl,InlineSave,
  OrderAlteredSignal,Rail,SessionLine}.tsx`, `v2/periodizacion/SidePanel.tsx`, `web/lib/dashboard/v2/{orientacion,orientacion-types,periodizacion}.ts`, `coach/{deep-dive-body,
  deep-dive-body-demo,demo-events,program-weeks}.ts`, tabla `google_oauth_tokens`, y luego los `ignores` de eslint.config.mjs (lista completa en git: este fichero, 29-09).
- FH-56 con aparato: ¿acepta Apple `startMirroringToCompanionDevice` sobre una sesión recuperada? Si no, hace falta Terminar+Empezar.
  Riesgo: `.endSaving` deja en Salud una grabación sin ejecución atada. Smoke TF build 100 (matriz §6: 7 casos + soak 2 h).

## Sabido y no hecho

- Carga: ficha, deep dive, cohorte, app del atleta y race-readiness usan aún 42/7 fijos en algún sitio; el CTL/ATL del coach solo lo lee
  `lecturas.ts` (la ficha ya sale del panel).
- Panel coach: sin Stripe Connect (Cobros lee, no cobra); crons en serie por coach (no aguantan ~20 clubs); sin RLS; solo castellano;
  crons a hora UTC fija y `resolvePeriod` sin el día local de la app (DECISIONS «Qué día es…»).
- MCP del asistente: la búsqueda en la biblioteca falla con `column b.archived_at does not exist` (0236): su base no la tiene.
- Seeds: `seed_demo.ts` desfasado (`chat_messages.sender_role`). Cadena personal: un mes de biblioteca en medio bloquea acortar/borrar (409).
- FH-30: `GuionSeries` sin vía viva en el espejo (`newLap` ya se relaya al motor desde 30-09).

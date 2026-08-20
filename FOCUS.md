# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-20** (MCP crea/edita microciclo de biblioteca)

## Ahora

**111 · MCP receta de biblioteca (feat/mcp-microcycle-crud):** `create_microcycle` /
`update_microcycle` escriben SIEMPRE en receta (`program_*_templates`), nunca en
lo entregado. Completitud blocking; update resincroniza solo `scheduled`. V1
sin plan personal ni publicar.

**LA PRUEBA DE ALEX DEL 20-AGO — 8 cards, 7 cerradas.** Detalle en ClickUp 116
a 123 y en DECISIONS 20-ago; aquí solo el estado.

EN PRODUCCIÓN, sin instalar nada: **116** el guardado llevaba roto desde el
13-ago 07:11 (la mig 0191 dejó parcial el índice de la asignación y Postgres no
lo infiere desde `on conflict`: 42P10 en los CUATRO escritores; arreglado con la
0203, índice llano) · **117** una lectura de sensor fuera de banda ya no tumba el
POST entero, se encaja o se guarda hueco · **120** un libre reenviado es el mismo
entreno (llave: `started_at`) · **121** un entreno se archiva en el día en que se
HIZO. Los 5 libres del 19 mal archivados, movidos.

EN EL REPO, PENDIENTE DE QUE ALEX INSTALE: **119** el teléfono no leía los metros
que la muñeca lleva mandando siempre (en cinta tonta = cero metros y 0:00 de
ritmo); ahora los recoge y el podómetro se aparta mientras la muñeca emite ·
**123** la estación de correr se cierra sola al llegar a sus metros, como ya
hacían remo y ski, y la pantalla enseña la dosis y lo que falta (de paso:
`tramoRunCoveredMeters` prometía «cinta si la hay» y leía solo Apple, así que con
FTMS conectada no había cuenta atrás) · **121** la hora de fin se sella al
terminar, no al pulsar guardar · **118** correr DENTRO de una sesión ya no la
convierte en carrera (manda si se lleva más de la mitad del tiempo) y sin metros
medidos no hay lectura de carrera.

LA LECTURA DEL ENTRENO, DE MOCK A APP EN UNA NOCHE (118 → 124 → 126). Alex validó
la propuesta del doble («vamos a integrarlo») y está construida:
· **124** el contrato de UI gana suelo tipográfico (15 pt en iPhone, 16 en reloj) y
  contraste AA MEDIDO. Lo medido cambia el diagnóstico: el gris de apoyo pasa AA
  de sobra (6,5:1 / 5,6:1) — cuando un apoyo no se lee es el TAMAÑO, no el color.
· **126 pieza 1, EN PRODUCCIÓN** (6c05b34c, 34a95904, mig 0204): la sesión sabe sus
  totales. Se calculan al guardar en UN sitio (`session-totals.ts`) y viajan en el
  detalle. Escalera: traza de pulso → tramos ponderados por duración → nada.
  Distancia SOLO si una modalidad la midió: correr+remo no son metros de nada.
  Rellenado lo viejo: la sesión del 20-ago ya lee FC 115/149; 41 de 55 con pulso.
· **126 pieza 2, PENDIENTE DE INSTALAR** (d5aaedf6): las 7 capas en Swift,
  sustituyendo a la lectura genérica. Los totales se LEEN, no se recalculan.
  Tres degradaciones DECLARADAS por límites del cable: fuerza sin serie a serie
  (volumen = reps × carga máx), sin número de ronda (lista plana) y sin descanso
  medido. Cada una es card futura, no excusa. 1.621 tests.

ABIERTO: **122** (el crono arranca con el toque y no con la primera zancada; la
cinta no detecta que se ha parado; no existe la transición — con decisión de Alex
dentro) · **125** barrido de letra pequeña y contraste en toda la app · **127** una
prueba ROJA preexistente (`totals_source` coalescea al revés de su comentario) y
una INESTABLE (`ComunicadosRenderTests` cae bajo carga, pasa sola). Y el duplicado
del 19 sigue en la base: borrarlo es dato del atleta.


**El reloj, auditado y arreglado (105, en trunk):** auditoría en 6 frentes
(ciclo de vida, running, cronómetros, inventario de las 17 vistas, estándares
de mercado). Cuatro arreglos: (1) cards 72+102 eran UNA raíz — `deliverEnd`
mandaba el cierre una vez sin ACK ni reintento y el auto-reparo de `start()`
solo cubría `.ending`; ahora reintenta hasta ACK, repara CUALQUIER estado
`!= .idle` y hay vigía de 5 min que autoguarda (45 s cortaba entrenos reales).
(2) card 101 en DOS pasos: la guarda del podómetro era código inalcanzable, y
el primer arreglo NO cubría bloques mixtos (se pliegan a `kind = .reps`) —
ahora pregunta `tramoIsRun`. (3) `tramoGpsStartDistance`, gemelo del de ergo y
cinta: cada carrera del bloque empieza en cero. (4) la muñeca enseña metros y
ritmo en una estación de correr. Verificado: los 2 targets compilan, 1573 tests
en verde. **La card 67 estaba medio desfasada** (el EMOM ya estaba bien) y **la
70 es una reversión de decisión, no un bug** — anotado en sus cards.
Rediseño propuesto en el doble (`watch-legible`, 5 escenarios): suelo de 16 pt,
el crono deja de caer a 44 pt por tener 5 glifos, corona, bloqueo por agua,
«ahora/después», terminar al alcance. **Pendiente del visto bueno de Alex.**

**Mañana 21-ago Alex prueba en real (asignación 482, plantilla 687, card 107):**
resuelto contra la base, ejercicio a ejercicio — NO son 4 rondas de 8 bloques,
son 8 bloques (las «4 rondas» son 4 parejas correr+estación ya expandidas, lo
dicen las notas del coach): calentamiento 6' Z2 · 1.000 m + SkiErg 500 m · 1.000 m
+ Burpee Broad Jump 40 m · 1.000 m + Rowing 500 m · 1.000 m + Wall Balls 25×9 kg,
con 2:00 de descanso tras cada estación. NO hay trineo (eso fue el 20). Los
arreglos de arriba son justo lo que esa sesión necesita, y la dosis de cada
estación SÍ viaja hasta el tramo (verificado: `prescription_json` se sirve
verbatim), así que la cuenta atrás de metros y el cierre automático tienen de
dónde leer. La sesión se llama «Compromised» en el plan: es contenido del coach.

**Claro y oscuro del panel (106, `feat/coach-theme-toggle`):** el botón
de siempre vuelve a la barra. Acento = piel del club, no naranja de
sistema. Landing / iOS / reloj no se tocan. Ley: DECISIONS 20-ago.

**Correo de avisos del club (78, `feat/coach-inbox-email`):** leads, citas
y bajas van a `coaches.club_notify_email`. Vacío = no se manda. hello@ y
`LEADS_NOTIFY_EMAIL` ya no son el buzón de nadie. Campo en `/es/club`.
Ley: DECISIONS 19-ago «El correo de avisos es del club». No iOS. No main.

**Piel del club a los dispositivos (19-ago, en trunk):** el coach elige UN
color y el servidor deriva la familia entera para las DOS superficies (panel
perla / app casi negra) con AA garantizado en los papeles con significado:
`shared/domain/coach/club-accent.ts` + 15 tests sobre 10 colores reales. El
relleno conserva el color elegido salvo que se confunda con el fondo (exigir
3:1 movía hasta el naranja actual). `GET /api/auth/me` devuelve `club` con
hexes YA resueltos para fondo oscuro: iOS NO recalcula color. El panel «Tu
club» estrena vista previa doble (panel + app), dice qué ajustó y por qué,
avisa de choque con verde/rojo/ámbar y declara su alcance. Ley: DECISIONS
2026-08-19 «La personalización del club tiene DOS niveles» — estándar (piel
viva, un binario, todos) vs por encargo (app propia con icono y nombre
propios, build por cliente, precio muy superior). iOS y el reloj leen la piel (`ClubThemeStore`, persistida; se limpia en
signOut; el reloj por `WatchTodayPayload`) y los correos del atleta la pintan
(`resolveClubEmailSkin`: alta, código, las 4 de citas, recordatorio, resumen,
nurture, lista de espera y aceptación de pago; `coachVoice` deja de firmar la
marca cableada); los correos NUESTROS siguen con nuestra marca. De
paso: el panel pintaba texto con `--v2-accent` en 179 sitios (1,9:1 con el
naranja guardado) → todos a `--v2-accent-text`. EN PRODUCCIÓN (99bcb4d1, con el merge de origin dentro).
Pendiente: nombre y logo del club llegan al móvil pero no se pintan en
ninguna pantalla de la app; un solo logo para dos fondos.

**Rediseño FLEXR del panel (19-ago, COMPLETO y EN PRODUCCIÓN):** el panel
entero adopta FLEXR (contrato `projects/FLEXR/DESIGN.md`, canvas dirección C):
cromo FLEXR (claro perla; el oscuro y el botón vuelven 20-ago),
Bricolage+Figtree, sidebar flotante con slot de tenant, casa =
/atletas (toggle tarjetas/tabla, chips-filtro, franja de triage; /hoy = cola),
todas las pantallas restyleadas, cero em dash en copy (417 sust.), QA con
Chrome sobre prod hecho. El «bg raro movido» tenía DOS raíces, ambas
muertas: clases dark: siempre-activas (html legacy con .dark fijo) y los
overlays fixed de la ficha atrapados por el wrapper animado (containing
block por transform): el reveal pasa a fill backwards y el cajón de sesión
+ 10 modales se portalan al v2-root vía ModalPortal. iOS/doble/landing intactos.
**Resuelto (19-ago, decidido por Alex):** «Editar día» va SIEMPRE al día real
del atleta (/atletas/[id]/dia/[fecha]) anclado a la semana en pantalla; la
plantilla se edita solo desde «Editar plan». Verificado en prod con el atleta
64 (plantilla 89 con sessions=[] y semana entregada llena: los dos recibos
pueden divergir y el botón ya no enseña el vacío).

**UX coach (solo lectura, 18-ago):** el hueco es que el estado no se
entiende, no el publicar-tras-MCP. Mapa:
`docs/coach-ux-grok.html`. Recorrido Preview Coach Demo 1:
`docs/coach-ux-recorrido.html`. Sin implementar. Main/prod/FLEXR intactos.

**Corte prod 19-ago:** `fahybrid.com` y `app.fahybrid.com` sirven el
rediseño FLEXR (deploys de hoy desde `integration/trunk` local, worktree
fijado; smoke ok en los dos dominios). El corte pineado del 17-ago quedó
atrás. Migs Production sin cambios (0 pendientes al desplegar).


**Bloque vs propuesta (`feat/coach-bloque-vs-propuesta`):**
`month_2_pending` ya no mezcla «el bloque se acabó» y «hay una
propuesta de mes por validar». `block_ended` = sin siguiente bloque
(crítico). `month_2_pending` = validar propuesta. No auto-asigna.
No main, no Production.

**Receta vs bloque en Hoy (`feat/coach-hoy-receta-vs-bloque`):** la tira
de asignación separa el programa del atleta (titular: nunca tuvo /
terminó el X) de la receta de su celda (motivo: «Tu método»). Dos
puertas: Reponer bloque (modal de biblioteca → `assign-draft`, queda en
borrador) y Crear receta. «El sistema sigue tu método» exige 34/34.
Ley: DECISIONS 18-ago «Lo que le falta al atleta y lo que le falta a la
receta son dos ejes». No se asigna solo. No main, no Production.

**Carril del microciclo (`feat/coach-parcial-rail`):** badge «N de M
publicadas», cada semana del carril Visible / Borrador, ejecución
cortada = «a medias». No se dice «parcial». No se publica solo.
Caso: Marc 17–23 draft, 24–30 published. Ley: DECISIONS 18-ago
«Parcial son tres nombres».

**Borrador vivo en Preview (`feat/demo-draft-week`):** Marc Vidal
tiene 17–23 ago en `draft` (`delivery_mode=manual`) y 24–30
`published`. Recorrido: Preview `/es/acceso-demo` → Coach Demo 1 →
Marc → Plan.

**Hoy + altas honestos (`feat/coach-hoy-altas-honestas`):** `/es/hoy`
no pinta salud si nadie ve la semana. El alta no dice «antes de
arrancar» si el atleta ya entrenó, chateó o tiene bloque vencido.
Ley: DECISIONS 18-ago «Hoy del club no pinta salud». No se publica
solo. No se asigna el mes. No main, no Production, no FLEXR.

**Semana honesta (#35, en trunk):** Resumen y Plan titulan la semana
calendario del chip. Un bloque de julio no se llama «Esta semana».

**Chip de entrega (#34, en trunk):** Visible · No lo ve · Semana vacía ·
Bloque terminado · Sin plan. Misma puerta que MCP `athlete_sees_it`.

**Trunk 18-ago:** #29–#35 en `integration/trunk`. No main.

**Clonabilidad iOS (#33):** marca/bundle/dominio/esquema/equipo en
`settings.base`. Team id en AASA (público, decisión pendiente).

**Carrera hogar:** shipeada en Swift (13-ago). Plan personal atleta 64
cerrado. Tests = loop (CMJ + feedback `test_result`, mig 0196).

## Espera Alex

- iPhone: abrir la app (API `app.fahybrid.com`). Sign in with Apple.
  No usar `/es/acceso-demo` (404 en prod).
- Elegir capas del layout de vídeos de técnica: `docs/video-tecnica-layouts.html`
- Chat contextual: `/es/design/chat-contexto`.
- ZIP GDPR Garmin para validar el importador FIT.

## Parqueado (no tocar)

Onboarding 15 agujeros · 29 rutas coach sin pantalla · `coach_methodology`
vacía · vivo ergo/AMRAP/FT · 22 bloques incompletos · 20 secuencias.

## Ley

`docs/DECISIONS.md`. Se cita la entrada de la pieza, no se pega el fichero.

## Regla de gasto

Un átomo por sesión de agente. Grok default. Claude solo UI gorda.
Bugs 1–3 líneas: Hermes. FOCUS no se hincha: si hace falta relato, va al tablero.

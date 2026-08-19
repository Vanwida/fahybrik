# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-19** (correo de avisos del club; piel a dispositivos; FLEXR EN PRODUCCIÓN)

## Ahora

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
tema claro perla único (muere dark+naranja+itálica del cromo; DECISIONS.md
2026-08-19), Bricolage+Figtree, sidebar flotante con slot de tenant, casa =
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

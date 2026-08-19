# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-18** (recorrido UX coach Preview; Production intacta)

## Ahora

**Rediseño FLEXR del panel (19-ago, COMPLETO y EN PRODUCCIÓN):** el panel
entero adopta FLEXR (contrato `projects/FLEXR/DESIGN.md`, canvas dirección C):
tema claro perla único (muere dark+naranja+itálica del cromo; DECISIONS.md
2026-08-19), Bricolage+Figtree, sidebar flotante con slot de tenant, casa =
/atletas (toggle tarjetas/tabla, chips-filtro, franja de triage; /hoy = cola),
todas las pantallas restyleadas, cero em dash en copy (417 sust.), QA con
Chrome sobre prod hecho (bug del bg del tab Plan arreglado de raíz: dark:
siempre-activo por el .dark fijo del html legacy; frase invisible de la guía;
barras de adherencia). iOS/doble/landing intactos.
**Pendiente de decisión (hallazgo QA):** «Editar día» desde la ficha aterriza
en la PLANTILLA del microciclo (vacía) aunque la semana del atleta tenga
sesiones; es el modelo de dos recibos, pero el coach aterriza en una pantalla
vacía. Decidir si debe aterrizar en la semana viva.

**UX coach (solo lectura, 18-ago):** el hueco es que el estado no se
entiende, no el publicar-tras-MCP. Mapa:
`docs/coach-ux-grok.html`. Recorrido Preview Coach Demo 1:
`docs/coach-ux-recorrido.html`. Sin implementar. Main/prod/FLEXR intactos.

**Corte prod 17-ago:** `fahybrid.com` sirve `origin/integration/trunk`
`d2c269eb` (dpl_a3vpPryxuJqeiHXKj5KygrMgourJ). Clerk Production. Sin
`DEMO_ACCESS`. Migs Production: `0197_coach_method_interview` +
`0199_coach_club_skin`. `main` no se tocó (`origin/main` = `0e834b5c`).
Preview trunk intacto (Clerk Dev + DEMO_ACCESS). No se promocionó.

Carrera hogar shipeada en Swift (13-ago). Plan personal atleta 64 cerrado.
Tests = loop (CMJ + feedback `test_result`, mig 0196).

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

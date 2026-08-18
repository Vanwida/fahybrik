# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-18** (chip de estado del atleta)

## Ahora

**Chip de entrega (feat/coach-athlete-state-chip):** lista, ficha y semana
dicen la misma frase: Visible · No lo ve · Semana vacía · Bloque terminado ·
Sin plan. Misma puerta que MCP `athlete_sees_it` (`draft` esconde; sin fila
se ve). `week_ok` ya no es Plan OK si él ve vacío. No se publica solo. Ley:
DECISIONS 18-ago «chip de estado del atleta». No main, no Production, no FLEXR.

**Trunk 18-ago:** #29–#33 en `integration/trunk`. No main.

**Clonabilidad iOS (#33):** marca/bundle/dominio/esquema/equipo en
`settings.base`. Team id en AASA (público, decisión pendiente). Página de
soporte 404 bloquea revisión Apple.

**Carrera hogar:** shipeada en Swift (13-ago). Plan personal atleta 64
cerrado. Tests = loop (CMJ + feedback `test_result`, mig 0196).

## Espera Alex

- iPhone: abrir la app (API `app.fahybrid.com`). Sign in with Apple.
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

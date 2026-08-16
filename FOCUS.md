# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-16** (CI typecheck+unit de trunk, honesto)

## Ahora

**CI web unit:** rama `fix/ci-web-unit-baseline` contra `integration/trunk`.
Alineé 2 aserciones HealthKit con el código (walking≠run; sesión importada
sin assignment), openpyxl en el runner + skip si falta, umbral de
paralelismo de fotos. No toca lint/infra/iOS/DB.

**Carrera hogar: SHIPEADO en Swift** (13-ago noche, orden directa de Alex:
«haz el mock… dale» — supersede el «sin Swift hasta firmar» de antes). Hub
navegable en la pastilla (Estado etiquetado, sin CTA de tests) + Historial /
Tendencias / Capacidad / Por tipo / Forma / Pedido / Cansado + endpoints
`/api/athlete/running/*` + `shared/domain/running/session-type.ts`. Build OK,
suite iOS 1503/0. Ley: DECISIONS 13-ago (noche). Tandas: comparativa de
sesión (T2) · por zona (T3) · veredicto por fila · volcados tira→hub.
Plan personal sin periodización (atleta 64): cerrado. Tests = loop: informe
CMJ montado + Dar feedback (Del coach, forma `test_result`, mig 0196).
Falta archivo por familia y comparativa de homólogos.

## Espera Alex

- Instalar la build de iOS y probar el hub de Carrera (la instala él).
- Chat contextual: `/es/design/chat-contexto`.
- ZIP GDPR Garmin para validar el importador FIT.
- Mergear PR #16: el editor de tests ya no disfraza el 5K control / half-sim
  de Remo 2K (entra «Carrera 5 km»; ley DECISIONS 15-ago).

## Parqueado (no tocar)

Onboarding 15 agujeros · 29 rutas coach sin pantalla · `coach_methodology`
vacía · vivo ergo/AMRAP/FT · 22 bloques incompletos · 20 secuencias.

## Ley

`docs/DECISIONS.md`. Se cita la entrada de la pieza, no se pega el fichero.

## Regla de gasto

Un átomo por sesión de agente. Grok default. Claude solo UI gorda.
Bugs 1–3 líneas: Hermes. FOCUS no se hincha: si hace falta relato, va al tablero.

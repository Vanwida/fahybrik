# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (live: borrar writers, tres clases)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Tres clases. Un
escritor. Se borra, no se suma control.

1. Una sesión. Watch y teléfono suscriben `livePicture`.
   `live_start_v1` + `phoneOwnsLive`. No 105.
2. El HUD bebe live. Cifra = stream GPS. **No se toca.**
3. El motor avanza. Rest es tramo. Borrado: `skipFixedRest`,
   alias `fixedRest*`. Lista/Chipper: `livePicture.label` =
   Descanso. Un gesto = `primaryAdvance`.

**NO es hecho de producto.** Marc camina Chipper Y run+rest
(DESCANSO en HUD, metros no suman, al acabar rest arma work,
Watch en la misma sesión). Sin eso no se cierran 101/67/72/110/157/176.

No tocar: GPS/authority, 105, 174, 175, plan del 67,
`DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no. No merge.

## Cerrado en código (esta PR)

- Detail 200. Sesión ready (`/me` no 500).
- Rest entre works de serie. Un gesto en calentamiento.
- `skipFixedRest` fuera. Rest de lista = `livePicture`.

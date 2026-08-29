# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (live: se borra overlay gym / CALENTAMIENTO HECHO / launched)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Tres clases. Un
escritor. Se borra, no se suma control.

Debugger f5894e9 Series umbral: overlay gym (91-rest),
CALENTAMIENTO HECHO cerraba el bloque, Watch en esfera.

1. Rest ES el HUD del Run. Overlay `RestSurface`+RX no monta.
2. Un tap = un tramo. Borrado el override CALENTAMIENTO HECHO.
3. Watch entra en `livePicture`. Éxito = `wristJoined`, no
   `startWatchApp` ok. No 105.

**NO es hecho de producto.** Marc camina Chipper O umbral:
rest HUD (no gym), siguiente Run solo, Watch no es esfera.
Sin eso no merge.

No tocar: GPS/authority, 105, 174, 175, plan del 67,
`DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no.

## Cerrado en código (esta PR)

- Detail 200. Sesión ready. Rest entre works. `skipFixedRest` fuera.
- Rest de pie = Descanso. Overlay gym fuera. `strengthPrimary` fuera.
- `if launched` fuera. CALENTAMIENTO HECHO override fuera.

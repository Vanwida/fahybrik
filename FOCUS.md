# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero; el mapa que abre él es `docs/tablero.html`.
Última actualización: **2026-08-31** (clase 1: HUD = sesión Apple)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no se suma. **NO merge.**

**Walk `1be0aad4` v23:** 3 páginas AL AIRE LIBRE, crono 00:00. iPhone
SIN RELOJ. GPS=map. Recap con metros. Pausa/fin de muñeca no.
`a900f117` ya estaba: no bastaba. El HUD se pintaba al **crear** el
`HKWorkoutSession`, no al ser `.primary` / `.running`.

**Fork borrado.** `state = .recording` solo cuando Apple está en
`.running` / `.paused`. El crono es `HKLiveWorkoutBuilder.elapsedTime`
(«based on the builder’s current contents»). `beginCollection(withStart:)`
es el del builder vivo. `startMirroringToCompanionDevice` cuando
`session.state == .running`. Cero motor nuevo. Cero tercer crono.

**Build 24** (`CURRENT_PROJECT_VERSION` en `project.yml` + pbxproj). El
walk ya había mostrado 22/23 en Mac; 21 en repo no actualiza la muñeca.

**Dueño:** `LiveWorkoutSession`. El espejo no crea sesión.

**105 CORTADA.** `datos | VIVO | controles`.

## Cerrado en código (esta PR · el por qué en DECISIONS)

**Borrado:** el segundo primary · HUD al crear el objeto · crono
`elapsedTime(at:)` del writer · matar la sesión si `beginCollection`
falla · `abandon()` · CONECTANDO · `hasRecordedWork` · capa de km ·
`tickTimer` · cinta de la muñeca · degradado · velos.
**Arreglado:** recap = telemetría · `finish()` escribe la pierna abierta.

## Pendiente de esta rama

1. **BLOQUEANTE: el km no se canta.** Decide Alex. No se inventa voz.
2. Reloj en solitario: `LiveFlowView` — dos looks.
3. Ruta en `HKWorkoutRouteBuilder`. Crono a 6 glifos / 99 min.

**SIN COMPILAR AQUÍ:** no hay Xcode. Marc: Mac + Libre 1×800, build 24.
Si SIN RELOJ o crono 00:00: sigue sin hecho.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM`
(`S6W4459DDG`). Neon no. Analítica 178 no. **105 cortada.**

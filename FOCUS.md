# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-28** (live: tira PM5 = livePicture)

## Ahora

**LIVE · PR 91.** Watch sim ya compilaba en `6f5b8c67`. iPhone fallaba
en `ErgHUDContent:188` (`ForTimeContextStrip` muerto con las ramas).
La tira de estación bebe `livePicture` — el mismo contexto que el HUD
de ruta. El tipo no vuelve. `Theme.Color.ink` / `inkMuted` son alias
de foreground/muted (el HUD de ruta los nombra así).

Tres clases (cuadran en estático; Marc las camina):
- a) Una distancia = CoreLocation en calle.
- b) El descanso es un tramo (`!tramoMide` no suma).
- c) Un dueño (`yieldToPhone`).

**NO es hecho.** Linux no es compile. Marc: iPhone+Watch, Chipper Y
run+recuperación.

No tocar: 105, 174, 175, web, Neon, `DEVELOPMENT_TEAM` (`S6W4459DDG`).

## Espera Alex / Marc

- Marc: simulador iPhone + Watch. Chipper y run con recuperación.
- iPhone físico: no xcodebuild desde este cloud.

## Parqueado (no tocar)

Onboarding · 29 rutas coach · `coach_methodology` vacía · 105 rediseño.

## Ley

`docs/DECISIONS.md`. Se cita la entrada, no se pega el fichero.

# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-28** (live: un motor)

## Ahora

**LIVE · UN MOTOR (PR 91, este cloud).** Compile: `closeConditioningAndAdvance`
deja de ser private (una forma). Después, tres clases (no parches):

- a) Una distancia. Cifra y mapa = CoreLocation. Se borró el podómetro
  como fuente oficial. `RunDistanceAuthority` acepta `.gps` en calle
  y tira HK ahí (sustituto). Reloj solo / cinta tonta siguen en HK.
- b) El descanso es un tramo. `sampleRunDistance` no suma si
  `!tramoMide`. Overlay y recuperación parada no miden. El trote sí.
- c) Un dueño. Start Watch standalone + móvil: el motor del reloj
  cede (`yieldToPhone`). Un `WorkoutSession` (el del teléfono).
  La muñeca pasa a espejo. No se guarda un segundo HKWorkout.

Inventario: `docs/audits/live-run-patches-root.md`.
Ley: DECISIONS 28-ago (motor) y la entrada de las tres clases.

**NO es hecho de producto.** Linux no compiló Xcode. Marc lanza
debugger en Mac: Chipper Y run+recuperación, iPhone+Watch.

No tocar: 105 maqueta runner, 174 PR 87, 175 PR 88, web, Neon,
`DEVELOPMENT_TEAM` (`S6W4459DDG`). No segundo audit. No otro cloud.

## Espera Alex / Marc

- Marc: simulador iPhone + Watch. Chipper y run con recuperación.
- iPhone físico: no xcodebuild desde este cloud.

## Parqueado (no tocar)

Onboarding · 29 rutas coach · `coach_methodology` vacía · 105 rediseño.

## Ley

`docs/DECISIONS.md`. Se cita la entrada, no se pega el fichero.

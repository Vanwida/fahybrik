# Live: la raíz era un bosque de ramas

Cloud de inventario: `bc-94310edd`. Este texto se reescribe desde el brief
del implementer (`bc-832c5afe`). No es un segundo audit.

## Hechos (código, no hipótesis)

`WorkoutSession` tenía tres relojes (EMOM, conditioning, structured run),
dos descansos, tres auto-cierres de distancia (cinta, GPS, muñeca) y dos
superficies (Watch standalone vs espejo). Cada card era un formato que
caía por la rama equivocada:

- 101: la cifra no bebía el GPS del mapa (plan en hero + tres `RunLegProgress`)
- 67: EMOM por un reloj distinto
- 72 / 110: `primaryAdvance` por tipo vs cierre de estación
- 157: dos dueños de finish
- 176: gestos de persona resueltos con una pantalla Watch nueva (PR 90)

## Queda

- Un cursor: `LiveTramo`
- Una lectura: `livePicture`. HUD = render. Watch = mismo motor o espejo.
- Un descanso: `restRemainingSeconds`
- Un `RunLegProgress` en el motor
- `primaryAdvance` = cerrar tramo

## Se borra, no se parchea

- `tickEMOM` / `tickConditioning` / `tickFixed` / `tickRotating` como motores
- `conditioningPrimary` y APIs de avance por tipo como puerta del botón
- árbol `WorkoutFormatHUDs` + `EmomVivoView`
- familias Watch: Fixed, StructuredRun, Continuous, Emom, RelojDePared
- `WatchRunLegDriver`
- plan en hero
- odometro de cinta que cierra o inventa metros
- PR 90 como camino
- `RunPedometer` como cifra de calle (sustituto de CoreLocation)
- el rechazo de `.gps` en `RunDistanceAuthority` en calle
- el “declina y quédate dueño” del espejo ante un standalone vivo

## Se conserva

`LiveTramo`, un `RunLegProgress`, `sampleRunDistance`, `sampleErg`,
`injectLiveHR`. 105 no se redibuja.

## No tocar

105 (Opus). 174 PR 87. 175 PR 88. Web. Neon. `DEVELOPMENT_TEAM`.
No xcodebuild contra iPhone físico. No segundo audit. No otro cloud.

# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-28** (live: un motor)

## Ahora

**LIVE · UN MOTOR (PR, este cloud).** WorkoutSession tenía tres relojes,
dos descansos, tres auto-cierres de distancia y dos superficies.
Las cards 101, 67, 72, 110, 157 y 176 eran un formato que caía por
la rama equivocada.

Queda: un cursor (`LiveTramo`), una `livePicture` (HUD = render),
un descanso (`restRemainingSeconds`), un `RunLegProgress`,
`primaryAdvance` = cerrar tramo. Watch = mismo motor o espejo de
esa lectura, nunca ambos.

Se borraron (no se parchearon): ticks por formato, `conditioningPrimary`,
familias Watch (Fixed / Rotating / StructuredRun / Continuous / Emom /
RelojDePared), `WatchRunLegDriver`, árbol `WorkoutFormatHUDs` +
`EmomVivoView`, plan en hero, segundo odometro de cinta.

Conservado: `LiveTramo`, un `RunLegProgress`, `sampleRunDistance`,
`sampleErg`, `injectLiveHR`. SetTable / Checklist / 105 (cinta y
calle, Opus) no se redibujan.

101 = la cifra bebe el mismo GPS que el mapa.
72 y 110 = el mismo dueño cierra el tramo.
176 = gestos de persona sobre ESA sesión. PR 90 no se sigue.
157 = un finish de persona.

Inventario: `docs/audits/live-run-patches-root.md`.
Ley: DECISIONS 28-ago.

**NO es hecho de producto.** Cloud Linux no compiló Xcode. Marc
lanza debugger en Mac: Chipper Y run+recuperación, iPhone+Watch.

No tocar: 105 maqueta runner, 174 PR 87, 175 PR 88, web, Neon,
`DEVELOPMENT_TEAM` (`S6W4459DDG`). No segundo audit. No otro cloud.

## Espera Alex / Marc

- Marc: simulador iPhone + Watch. Chipper y run con recuperación.
- iPhone físico: no xcodebuild desde este cloud.

## Parqueado (no tocar)

Onboarding · 29 rutas coach · `coach_methodology` vacía · 105 rediseño.

## Ley

`docs/DECISIONS.md`. Se cita la entrada, no se pega el fichero.

# VivoIphone — el vivo del iPhone, rehecho (cimientos en Swift)

Para las sesiones que portan las familias (`correr`, `ergo`, `fuerza`, `wod`, `circuito`) encima de esto. Contrato: las propuestas del doble `web/components/design-twin/screens/iphone-vivo-*` (firmadas por Alex el 28-09, DECISIONS «Alex firma el vivo nuevo del iPhone») construidas con `kit-iphone-vivo/` sobre `kit-reloj/`. Modelo: `docs/vivo-iphone/modelo.md` y `docs/reloj-muneca/modelo.md`.

## La idea en una frase

**Un estado, dos pintores.** El iPhone pinta EL MISMO estado que la muñeca con las MISMAS reglas. Todo lo que decide QUÉ se pinta vive en `ios/FAHYBRIKCore/Vivo/` (Swift puro, compila en el iPhone y en el reloj) y es espejo función por función del kit del doble. Aquí (`ios/FAHYBRIK/Workout/VivoIphone/`) solo vive el LIENZO del iPhone: tokens, la anatomía I5 y sus piezas. **Esta carpeta no tiene dominio propio**: si al portar una familia te falta una regla, va a `FAHYBRIKCore/Vivo/` con su test en `FAHYBRIKTests/Vivo/`, y a `kit-reloj/` en el mismo lote para que el doble no divorcie.

## Qué hay y de dónde sale cada cosa

| Swift | Espejo TS (doble) | Qué decide |
|---|---|---|
| `Core/Vivo/Vivo+Paso.swift` | `kit-reloj/paso.ts` | el paso (medida × objetivos × rol × fase × posición), las lecturas, las zonas y reglas del coach, `EstadoVivo` |
| `Vivo+Reglas.swift` | `reglas.ts` | formatos (`fmtReloj`, `fmtRitmo`, `fmtSplit` /500 y /1000, `fmtPrescrito`, `fmtObjetivo`, `textoObjetivo`), `principal`, `faltaDe`, `contextoDe`, `textoPasoCorto`, zonas, **veredicto con dirección y holgura** (`veredictoDe`, `veredictoPrincipal`, `veredictoDelPaso`, `palabraVeredicto`), `tinteDelPaso` |
| `Vivo+Lamina.swift` | `lamina.ts` | `heroeDelPaso` (P3), `bandaDe`, `lineaPulso`, `laminaDelPaso` |
| `Vivo+Familia.swift` | `familia.ts` | `familiaDe`, `formatoDe` (castellano de box, dato con defecto), `admiteHorizontal` |
| `Vivo+Metricas.swift` | `metricas.ts` | `heroeDeFamilia` (I4), `trabajoDe` (§10.6), `metricasDelPaso` (la rejilla §4: máquina manda, bici /1000 y rpm, pulso siempre) |
| `Vivo+Posicion.swift` | `posicion.ts` | `posicionDe` («SkiErg · Serie 3/8 · 250 m», «A1 · Back Squat · Serie 2/4»), `textoViene`, `luegoDe` |
| `Vivo+Tarea.swift` · `Vivo+Fuerza.swift` · `Vivo+DeathBy.swift` | `tarea.ts` · `fuerza.ts` · `deathby.ts` | la tarea del WOD y la puntuación del AMRAP; la ficha de la serie; la escalera del death by |
| `Vivo+Anotar.swift` | `anotar.ts` | propuesto / medido / declarado, cascada de la carga, `girar`, `seriesDelDescanso` |
| `Vivo+Ruta.swift` | `ruta.ts` + `alrededor.ts` | la ruta del circuito con parciales; la lista ±1 del chipper |
| `Vivo+Eventos.swift` · `Vivo+Voz.swift` | `eventos.ts` · `voz.ts` | un evento, un háptico (`vocabulario`, `componer`, `decidirAviso`); la voz en español desde el dato |
| `Vivo+Estructura.swift` | `estructura.ts` + `aro.tsx` + `listas.tsx` + `vivo.tsx` | grupos, brief, `textoFila`, `arcosDePlan`, `fraccionDelPaso`, `avisoDeCierre` |
| `Vivo+Accion.swift` | `kit-iphone-vivo/accion.tsx` + `enlace.ts` + `Vivo.tsx#clavePorDefecto` | el vocabulario cerrado del botón (`ClavePrimaria`), `clavePorDefecto`, `resumenParaTerminar`, los chips de enlace (`enlacesDe`, `notaEnlace`) |
| `Vivo+Tokens.swift` | `kit-reloj/tokens.ts` | los hex compartidos, el espectro de zonas del coach, `anchoTexto`, `tallaHeroe` |
| **`Vivo+PlanDeSesion.swift`** | — (nuevo) | **el adaptador estático**: `WorkoutPlan` → `[Paso]` con `origen` (segmento + ventana del cursor del motor + descanso) |
| **`Vivo+EstadoDeSesion.swift`** | — (nuevo) | **el adaptador dinámico**: `WorkoutSession` → `EstadoVivo` (paso vivo por cursor, lecturas, parciales, vueltas). `LecturaExterna` = lo que el motor no ve (el monitor, el GPS) |
| `Vivo+Colocate.swift` | `reloj-fuerza/planes.ts#colocate` | «Colócate» (5″, dato con defecto) antes de una serie por tiempo sin descanso; el descanso que el motor abre tras cada serie |
| **`Vivo+Muneca*.swift`** | `kit-reloj/pasos.tsx` + `piezas.tsx` + `listas.tsx` + `vivo.tsx` | **el cuadro de la muñeca** (`Vivo.cuadroMuneca`): TODO lo que pinta el reloj (cuatro páginas, capa del 3-2-1, Always-On, tinte, aro) sin vistas; `Vivo+MunecaEstado.swift` es su adaptador desde `WorkoutSession` |
| `Vivo+RitmoActual.swift` | `lamina.ts` («el ritmo es el ACTUAL») | ritmo de los últimos 10 s sobre las muestras del builder, nil cuando no se sabe |
| `Vivo+PasoCodable.swift` | `paso.ts` | la codificación estable del paso y del plan (el cable de la muñeca) |

El kit SwiftUI (esta carpeta): `VivoTokens` (escala con suelo 15 pt, `Alto` de cada franja, `Numeral` = UN token para toda cifra, `VivoColor`), `VivoPiezas` (numeral, etiqueta, botones, chips, superficie), `VivoCabecera`, `VivoSujeto` (+ banda, instrucción, trabajo, cuenta atrás, aviso de vuelta), `VivoRejilla` (+ luego, tira), `VivoAccion` (franja con Parar mantenido 1 s, deshacer 5 s, hoja de terminar, velo de pausa, terminado), `VivoDescanso` (+30 s, anotar serie), `VivoPaginas` (Estructura, Mapa), `VivoIphoneCuadro` (TODO lo que se pinta en un instante, calculado con el kit compartido), `VivoIphoneView` (la raíz), `VivoActividadEnVivo` (Live Activity), `VivoArranque` (lo que el vivo ya sabía al montarse a mitad de sesión: lo declarado, el dato encendido, el aviso — lo usan las capturas) y `VivoFuerzaMotor` (la fuerza conduce el motor por su API pública: la última serie lleva al siguiente ejercicio sin parar en la puerta, la serie por tiempo se cierra sola, «Colócate» corre como descanso del motor).

## Cómo se enciende

`ActiveWorkoutView.superficieMontada` monta `VivoIphoneView`: es el único vivo del iPhone. El shell antiguo (`RunLiveShellView`), su bandera y los HUD que solo él montaba se borraron el 30-09 (DECISIONS 30-09).

**Lo que el vivo heredó del shell antiguo** (mismo negocio, pintado con el kit): dobles (`Vivo+Dobles.swift`: el relevo es UN paso de recuperación con la primaria «Relevo» → `advanceRelay`, el reparto lleva TU parte como dosis, el turno delante en la fila del formato; `VivoPareja` = la tira de presencia), las salidas (`VivoSalidas` en la hoja de terminar: guardar para luego, cerrar solo este bloque, descartar con confirmación; y el chevrón de la cabecera = minimizar sin parar) y el salto de tramo desde la Estructura (`Vivo.segmentoDeSalto` → `requestJump` del host, que confirma si se omite trabajo).

## Cómo se añade una familia

1. **Lee el contrato de tu familia** (`screens/iphone-vivo-<familia>/`, sus `casos.ts`/`planes.ts` y las capturas) y su test TS (`web/tests/design-twin/iphone-vivo-<familia>.test.ts`).
2. **Primero el adaptador, no la vista.** Comprueba con un plan real (`FAHYBRIKTests/Vivo/VivoPlanesDePrueba.swift`, mismo JSON que decodifica la app) que `Vivo.planDe` produce los pasos del contrato y que `Vivo.estadoDe` sigue al cursor del motor en tu familia. Lo que falte se arregla en `Vivo+PlanDeSesion.swift` / `Vivo+EstadoDeSesion.swift` con su test en `VivoAdaptadorTests`.
3. **Lo que la familia sabe y el paso no** (rondas, carga en la barra, última serie, total del circuito…) va a `Vivo.ExtraFamilia` desde `VivoIphoneCuadro.init` — y NUNCA a la vista. Mira ahí cómo el circuito pone `total`/`rondaS` y la fuerza `cargaKg`/`ultimaSerie`.
4. **La acción primaria** sale de `Vivo.clavePorDefecto` (vocabulario cerrado). Si tu familia necesita otra clave del vocabulario en un estado, decídelo en `VivoIphoneCuadro` (donde ya se hace para AMRAP y el descanso de fuerza) y cablea el gesto en `VivoIphoneView.primaria(_:)`. Un texto fuera del vocabulario NO compila: así se quiere.
5. **Si necesitas una pieza de UI nueva** (la lista ±1 del chipper, la puntuación del AMRAP en la campana), va aquí como pieza, con tokens de `VivoTokens`, y se monta desde `VivoIphoneView.bloqueApoyo` como «apoyo» de la rejilla (las celdas pasan a compactas), igual que `VivoAnotarSerie`.
6. **Capturas**: añade tu escenario a `VivoIphoneCapturasTests` (plan real + motor real) y compara con `scratchpad/capturas-final/<familia>-*.png` del contrato. Declara cada diferencia.
7. **El doble**: la pantalla `propuesta` de tu familia pasa a `espejo` y estampa `actualizado` en el mismo lote.

## Lo que NO se toca

- **Nada del vivo se decide en la vista.** Ni un `fontSize`, ni un hex, ni un texto de botón, ni un «si es fuerza entonces…» en SwiftUI. Todo eso es dominio o token.
- **`FAHYBRIKCore/Vivo/` es Foundation puro** (compila en el reloj). Nada de SwiftUI/UIKit ahí: los colores son hex, el pintor los convierte.
- **El motor (`WorkoutSession`) no cambia por el vivo.** El adaptador lo LEE. Si el motor no modela algo (M1–M8), el paso lo lleva a `nil` y el pintor calla: no se inventa.
- **Naranja = la acción primaria y el trabajo en la tira.** Nada más. El veredicto NO cambia de color: cambia ▲▼ y la palabra.
- **Una cuenta atrás, un deshacer (5 s), un terminar (mantener 1 s + hoja).** No se dibuja otro.
- **Copy de box**: «el remo», «la bici», «lo dices tú». Nunca PM5/FTMS/BLE.
- **Nada por debajo de 15 pt.**

## Checklist contra la propuesta (elemento a elemento, «mock aceptado = contrato»)

Para cada pantalla de tu familia, marca en la entrega qué elemento está IGUAL, DISTINTO (por qué) o NO ESTÁ:

- [ ] Cabecera: posición en palabras (el nombre delante), formato de box, marca Test, crono de sesión o TOTAL, chips de enlace (reloj · GPS · máquina · pulso) que abren Conectividad.
- [ ] Puntos de página (Vivo · Estructura · Mapa solo con GPS).
- [ ] Sujeto: el héroe de tu familia (I4), alto fijo, etiqueta encima, unidad pegada, nota de honestidad debajo.
- [ ] Banda del objetivo con ▲▼ y palabra (o la instrucción del RPE/RIR en su fila). Sin objetivo, sin banda.
- [ ] Trabajo (lo que falta / la dosis / la tarea), nunca en gris. En descanso «viene …» y «+30 s».
- [ ] Rejilla 2 columnas, 2–4 celdas de tu familia y máquina, el pulso siempre; el sobrante hace crecer el valor.
- [ ] Luego · … · después …
- [ ] Tira de estructura (trabajo naranja, resto gris, el vivo marcado; tocar abre Estructura).
- [ ] Franja: Pausa · UNA primaria del vocabulario · Parar mantenido 1 s → hoja con lo hecho.
- [ ] Cuenta atrás 3-2-1/GO, aviso de deshacer 5 s, velo de pausa, «Sesión completada».
- [ ] Estados de enlace: GPS buscando, máquina perdida («—» + nota), sin máquina («lo dices tú»), reloj como segunda pantalla.
- [ ] Horizontal (solo ergo y cinta): sujeto a la izquierda, rejilla y acción a la derecha.
- [ ] Live Activity e Isla Dinámica con el héroe, la posición y la acción (pintada; pulsarla exige un `LiveActivityIntent`, capacidad nueva).
- [ ] Tinte de zona SOLO cuando el paso va a zona; recuperación y descanso monocromos.

## Cómo se verifica

```
cd ios && xcodegen generate
xcodebuild -project FAHYBRIK.xcodeproj -scheme FAHYBRIK -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath ./DerivedData build-for-testing CODE_SIGNING_ALLOWED=NO
TEST_RUNNER_FAHYBRIK_CAPTURAS=<carpeta> xcodebuild ... test-without-building -only-testing:FAHYBRIKTests/VivoReglasTests -only-testing:FAHYBRIKTests/VivoAdaptadorTests -only-testing:FAHYBRIKTests/VivoIphoneCapturasTests
```

`VivoReglasTests` reproduce los casos de `kit-reloj-familia`, `kit-reloj-veredicto`, `kit-reloj-motor` (parte pura) y `kit-iphone-vivo`: mismos insumos, mismas salidas. `VivoAdaptadorTests` cruza cada familia con el motor real. `VivoIphoneCapturasTests` vuelca la gramática al simulador.

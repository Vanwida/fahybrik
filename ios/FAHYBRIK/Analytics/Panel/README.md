# Analytics/Panel — las analíticas rehechas del iPhone (cimientos + portada)

Para las sesiones que ponen encima los **detalles por familia** (`correr`, `remo`, `ski`, `bici`, `fuerza`, `estaciones`, `wod`) y la **sesión**. Contrato visual: las propuestas del doble `web/components/design-twin/screens/analiticas-{portada,familia-correr,familia-ergo,familia-fuerza,familia-estaciones,sesion}/` con su kit `kit-analiticas/` (firmadas por Alex el 29-09, DECISIONS «Alex firma las analíticas rehechas»). Modelo: `docs/analiticas/modelo.md`. Contrato de datos: `shared/domain/analytics/lectura.ts` + `panel.ts`, servido por `GET /api/athlete/analytics/panel?ventana=`.

## La idea en una frase

**Un cálculo, dos pintores (A1).** El servidor calcula el panel entero (ocho bloques, una ventana) y lo sirve como listas de `Lectura`; el iPhone lo PINTA y no calcula nada — ni un umbral, ni un veredicto, ni una palabra. Lo que no conoce lo ignora sin romperse; lo que el servidor declara `pendiente` se pinta como «muy pronto», sin inventar.

## Qué hay

| Fichero | Qué es |
|---|---|
| `PanelAnaliticas.swift` | El sobre Codable del panel: `ventana` (clave · desde · hasta · anterior · cubre_todo), `historia`, `metodo` (solo lo que se lee), `anclas`, `bloques` (ocho `[LecturaAnalitica]` con `@LossyArray`), `pendientes`, `hechos`. Tolerante: bloque/ventana/unidad/familia/ancla nuevos → `desconocid…`; lectura rota → se pierde sola; campo del método ausente → nulo. |
| `../Lecturas.swift` (ampliado) | `LecturaAnalitica` es el ÚNICO espejo de `lectura.ts`: el 29-09 gana `familia`, `comparacion`, `veredicto`, `serie.plan`, `serie.referencias`, `procedencia.ancla`, `cobertura.ultimoDato` y las unidades `watts · reps · dias`. `Falta` (en `RunningProgress.swift`) gana `objetivo · esfuerzo · plan`. |
| `AnalyticsService+Panel.swift` | `fetchPanel(ventana:bearer:)`. |
| `AppDataStore` (ampliado) | `panelAnaliticas(_:)` · `refreshPanelAnaliticas(_:force:)` · `setPanelAnaliticas(_:ventana:)`: una porción por ventana, SWR + disco (v9), como el resto de la app. |
| `Kit/AnaliticasTokens.swift` | La piel del iPhone: grises del vivo, paleta de familias validada (correr `#3F9DDA` · ergo `#41AB77` · fuerza `#764EC7` · estaciones y WOD `#9D466A` · otro = tinta2), zonas por el espectro del coach, escala con suelo 15 pt, numeral SF tabular, radios, trazos. `FamiliaGrande` (las cuatro que caben en una barra). |
| `Kit/AnaliticasFormato.swift` | Un formateador por unidad (`formatear · cifra · unidadCorta · formatearDelta · esCero`), etiqueta del periodo y de la referencia, fechas legibles. Sobre `Formato` y `FechaES`. |
| `Kit/AnaliticasEscala.swift` | Fechas ISO en UTC (`AnaliticasFechas`), escala «bonita» con pasos de reloj, rótulos del eje X que caben, agrupación de semanas. |
| `Kit/AnaliticasEstados.swift` | Los cuatro estados de un bloque (`vacio · poco · lleno · viejo`) DERIVADOS del panel y del método; la prosa de cada hueco con su salida (`DestinoDeSalida`); el «muy pronto» de un bloque pendiente. |
| `Kit/AnaliticasPiezas.swift` | Texto, `AnaliticasSeccion` (título-pregunta + chevrón), superficie, celda (cifra + unidad + delta + ancla), delta ▲▼≈, chip de ancla (discontinuo si estimada), punto de familia, sello «Nuevo», botón (el ÚNICO naranja), plazo, hueco, leyenda, `AnaliticasFlujo` (flex-wrap). |
| `Kit/AnaliticasSelectorVentana.swift` | Las seis píldoras (ninguna corta su texto a 390) y `AnaliticasSegmento` (Carga · Horas). |
| `Kit/AnaliticasEstadoFijo.swift` · `AnaliticasGlosa.swift` | La cabecera fija (palabra + Forma/Fatiga/Frescura/Disposición + nota) y la glosa a un toque (A5) con los días del método. |
| `Kit/AnaliticasGraficoLineas.swift` | `AnaliticasGraficoLineas` (forma/fatiga, proyección discontinua desde el último punto, marcas «hoy» y carrera, rótulo final con halo) y `AnaliticasGraficoDivergente` (frescura en barras alrededor de cero, proyección en trazo fino). Swift Charts a escala real; un `v` nulo corta la línea. |
| `Kit/AnaliticasGraficoColumnas.swift` | Columnas apiladas (familias o zonas) con el plan en CONTORNO dibujado con las posiciones reales del gráfico (`ChartProxy`); discontinuo en el cubo en curso. |
| `Kit/AnaliticasGraficosMenores.swift` | Chispa (huecos reales, banda basal), barra de reparto al 100 % con el objetivo del coach, barras de hueco por tramo. |
| `Kit/AnaliticasFilas.swift` | La fila de progreso (familia · métrica · cifra · delta · chispa) y la de récord (prueba · fecha · antes · Nuevo · valor). |
| `AnaliticasDerivados.swift` | De lecturas a entradas de gráfico: series de forma, cubos de carga/horas por familia grande, cubos apilados por forma, partes de un reparto, el delta ya interpretado, las celdas del Estado, la frase de forma (solo palabras del servidor). |
| `Bloques/` | `AnaliticasBloques` (contexto, hueco, despacho), `AnaliticasBloqueForma`, `AnaliticasBloqueSemanas`, `AnaliticasBloquesPorForma` (intensidad, progreso, récords, carrera, recuperación: pintados POR FORMA cuando lleguen lecturas). |
| `AnaliticasPortadaView.swift` | La pantalla: título + selector fijos, Estado fijo (`LazyVStack(pinnedViews:)`), los siete bloques, pull-to-refresh, glosa, salidas (pestañas, Dispositivos y apps, chat, tests). |
| `AnaliticasDetalleView.swift` | Placeholders navegables del detalle de un bloque o de una familia (la segunda tanda los rellena). |
| `AnaliticasBandera.swift` | Debug ON, Release OFF; forzable por `UserDefaults` (`fahybrid.analiticas.panel`). `AppShell` monta la portada o `AnalyticsView` (la vieja, intacta). |

Tests: `FAHYBRIKTests/Analytics/Panel/` — decodificación (los cinco atletas del contrato, las seis ventanas, valores nuevos, ida y vuelta a disco), estados y huecos, formato y escala, y las **capturas** (`AnaliticasCapturasTests`: la portada a 390 × 844 página a página; adjuntos del `.xcresult` de `ios.yml`). Los fixtures (`Fixtures/panel-*.json`) los genera el motor REAL de shared (`scratchpad/analiticas-ios/generar-fixtures.mts`; no viaja: es un script sobre `shared/domain/analytics`).

## Cómo se pinta un bloque (la regla)

1. **Su estado** sale de `AnaliticasEstados.estado(de:hoy:metodo:)`: vacío si nada tiene dato ni historia empezada; poco si espera historia (`falta.historia` con `llevas > 0`, también en una lectura medida en arranque en frío) o no llega a `muestras_minimas` / `cobertura_poco_pct`; viejo si el `ultimo_dato` más reciente supera `dato_viejo_dias`; lleno si no. **Sin umbral del coach no hay juicio**: los campos que el servidor aún no sirve llegan nulos y ese criterio no se aplica.
2. **Su hueco** (`AnaliticasHuecoDeBloque`): pendiente → «Muy pronto»; vacío/poco/viejo → la prosa de `huecos` con su salida (`DestinoDeSalida` → pestaña, Dispositivos, chat, tests). Nunca una silueta muda.
3. **Su cuerpo**, solo con lo que hay: gráficos por forma del dato, celdas con su delta (`AnaliticasDerivados.delta`: contra el periodo anterior si hay `comparacion`; si no, contra la `referencia`) y su ancla.

## Cómo se añade un detalle (segunda tanda)

1. Lee el contrato de tu familia (`screens/analiticas-familia-*/` y sus capturas) y el endpoint que lo sirve (`…/analytics/familia/{f}`, `…/records`, `…/sesion/[id]`).
2. El sobre del detalle se decodifica con el MISMO `LecturaAnalitica` (una lista de lecturas): añade el Codable del sobre junto a `PanelAnaliticas.swift` y su `fetch` en `AnalyticsService+Panel.swift`; su porción en `AppDataStore` si se cachea.
3. Sustituye el placeholder en `AnaliticasPortadaView.navigationDestination` (`AnaliticasDestino.familia(_)` / `.bloque(_)`) por tu vista. Las piezas y gráficos del kit ya están; si te falta una pieza, va al kit con tokens, no a tu vista.
4. Los bloques pendientes de la portada (`AnaliticasBloquesPorForma`) se afinan cuando su contrato se cierre: cambia la composición, no la regla (sigue pintándose por forma).
5. Capturas: añade tu escenario a un `…CapturasTests` con un fixture JSON del contrato y compáralo con las capturas del doble.

## Lo que NO se toca

- **Nada del panel se decide en la vista.** Ni un `fontSize`, ni un hex, ni un umbral, ni una palabra de veredicto. Todo es token, dato del servidor o `AnaliticasEstados`.
- **Ningún `switch` sobre ids** para decidir cómo se dibuja (solo para reconocer una lectura concreta: `carga.fondo`, `semanas.carga`).
- **Naranja = la salida de un hueco y nada más.** El veredicto NO cambia de color: cambia ▲▼ y la palabra.
- **`null` ≠ 0.** Un hueco corta la línea; una barra sin dato no se pinta.
- **Nada por debajo de 15 pt**, ejes incluidos.
- **Copy de box**: «Disposición», no «readiness»; «ppm», no «bpm».

## Lo que el servidor aún no sirve y el contrato firmado pide

`cobertura.ultimo_dato` y `metodo.{dato_viejo_dias, muestras_minimas, cobertura_poco_pct, semanas_minimas_forma, ventana_basal_dias, reciente_dias}` (`kit-analiticas/contrato.ts` y `metodo.ts`). El cliente ya los lee; hasta que viajen, ningún bloque sale «viejo» ni «poco por muestras». Y los cinco bloques `pendientes`: cuando lleguen sus lecturas se pintan por forma.

## Cómo se verifica

```
cd ios && xcodegen generate
xcodebuild -project FAHYBRIK.xcodeproj -scheme FAHYBRIK -destination 'generic/platform=iOS Simulator' -derivedDataPath ./DerivedData build-for-testing CODE_SIGNING_ALLOWED=NO
# Los tests y las capturas corren en GitHub Actions (ios.yml sube el .xcresult):
xcodebuild ... test-without-building -only-testing:FAHYBRIKTests/PanelAnaliticasDecodeTests -only-testing:FAHYBRIKTests/AnaliticasEstadosTests -only-testing:FAHYBRIKTests/AnaliticasFormatoTests -only-testing:FAHYBRIKTests/AnaliticasCapturasTests
```

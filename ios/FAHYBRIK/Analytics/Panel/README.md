# Analytics/Panel — las analíticas rehechas del iPhone (cimientos y portada; el detalle vive en `../Detalle/`)

Esta carpeta es la **portada** y los cimientos que comparten todas las pantallas de la pestaña (`AnaliticasPantalla`, el kit, los formatos). Los **detalles** (correr, ergo, fuerza, estaciones, la sesión y los tres bloques con «›») están en `../Detalle/`. Contrato visual: las propuestas del doble `web/components/design-twin/screens/analiticas-*/` con su kit `web/components/design-twin/kit-analiticas/`.

## La idea en una frase

**Un cálculo, dos pintores (A1).** El servidor calcula el panel entero (ocho bloques, una ventana) y lo sirve como listas de `Lectura`; el iPhone lo PINTA y no calcula nada — ni un umbral, ni un veredicto, ni una palabra. Lo que no conoce lo ignora sin romperse; lo que el servidor declara `pendiente` (hoy nada: sirve los ocho bloques) se pinta como «muy pronto», sin inventar.

## Qué hay

| Fichero | Qué es |
|---|---|
| `PanelAnaliticas.swift` | El sobre Codable del panel: `ventana` (clave · desde · hasta · anterior · cubre_todo; `VentanaClave.frase` es la ventana dicha en una frase), `historia`, `metodo` (solo lo que el servidor sirve Y esta pantalla lee), `anclas`, `bloques` (ocho `[LecturaAnalitica]` con `@LossyArray`), `pendientes`, `hechos`, y los ids servidos (`IdsDelPanel`). Tolerante: bloque/ventana/unidad/familia/ancla/falta nuevos → `desconocid…`; lectura rota → se pierde sola; campo del método ausente → nulo. |
| `../Lecturas.swift` (ampliado) | `LecturaAnalitica` es el ÚNICO espejo de `lectura.ts` (y `sePinta` decide si una lectura existe o se calla): el 29-09 gana `familia`, `comparacion`, `veredicto`, `serie.plan`, `serie.referencias`, `procedencia.ancla`, `dato.rango` y las unidades nuevas (`watts · reps · dias · pp · rpe · rir · tramos · s_1000m · spm · rpm · series · cm · rondas`); los campos opcionales llevan `= nil` para poder construir una lectura a mano. `Falta` (en `../Falta.swift`, con `seCalla`) gana `objetivo · esfuerzo · plan · viejo · marcas · pareja`, y una razón que este binario no conoce decodifica a `desconocida`. |
| `AnalyticsService+Panel.swift` | `fetchPanel(ventana:bearer:)`. |
| `AppDataStore` (ampliado) | `panelAnaliticas(_:)` · `refreshPanelAnaliticas(_:force:)` · `setPanelAnaliticas(_:ventana:)`: una porción por ventana, SWR + disco (v9), como el resto de la app. |
| `AnaliticasSujetoEstado.swift` | `SujetoEstado.desde(panel, bloque:)`: lo que dice el sujeto de la portada en los cuatro estados (título, apoyo, cifras, disposición, plazo, salida), PURO y sin vista. Traducción de `kit-analiticas/sujeto.ts`; sus casos, en `AnaliticasSujetoEstadoTests`. El color de estado (`MarcaEstado`) va en la marca y en el arco, nunca en una cifra. |
| `AnaliticasSujetoView.swift` | `AnaliticasSujeto`: el Estado sobre `SujetoDia` (kit de «El día»), con la marca de estado, las tres cifras en insertos y la disposición con su anillo. Sin acento sólido: nada es «haz esto ahora». |
| `AnaliticasPantalla.swift` | El cascarón de TODAS las pantallas de la pestaña (`AnaliticasPantalla`, con su `AnaliticasCabecera` y el `AtrasDia` del kit): sobretítulo de acento, título, selector de ventana que se pega arriba al bajar (una sola ventana rige toda la pestaña), «‹ Analíticas» fijo en un detalle y pull-to-refresh. Una sesión es un día y no lleva ventana. |
| `AnaliticasPortadaView.swift` · `AnaliticasPortadaCuerpo.swift` | La pantalla (glosa, salidas, las rutas de los detalles y el guardado de la ventana elegida, sobre `AnaliticasPantalla`) y su cuerpo sin máquinas (sujeto y siete bloques) con sus cuatro estados: datos, esqueleto de la misma forma, error con reintento. La galería y las capturas pintan el mismo cuerpo. |
| `AnaliticasGaleria.swift` (solo Debug) | La portada en plano para las `#Preview` y las pruebas de captura. Lee los fixtures del árbol de fuentes por su ruta: una sola fuente para pruebas y previews. |
| `Kit/AnaliticasFamilias.swift` | `FamiliaGrande` (las cuatro que caben en una barra) y los nombres de familia. El COLOR de cada una es un token de tema con su variante clara y oscura: `Theme.Color.familiaCorrer…`, en `Theme/Theme+Datos.swift`, con las zonas del coach (`Theme.Color.zona(_:de:)`) y la geometría de un gráfico (`Theme.Chart`). |
| `Kit/AnaliticasFormato.swift` | Un formateador por unidad (`formatear · cifra · unidadCorta · formatearDelta · esCero · entero`), etiqueta del periodo y de la referencia, fechas legibles. Sobre `Formato` y `FechaES`. |
| `Kit/AnaliticasEscala.swift` | Fechas ISO en UTC (`AnaliticasFechas`), escala «bonita» con pasos de reloj, rótulos del eje X que caben, agrupación de semanas. |
| `Kit/AnaliticasEstados.swift` | Los cuatro estados de un bloque (`vacio · poco · lleno · viejo`) DERIVADOS de las faltas que sirve cada lectura; la nota de cada falta; la prosa de cada hueco con su salida (`DestinoDeSalida`); el «muy pronto» de un bloque pendiente. |
| `Kit/AnaliticasPiezas.swift` | Texto (`.papel`), `AnaliticasSeccion` (`TituloSeccionDia` + pregunta + «›»), `AnaliticasSuperficie` (tarjeta, con el filete de «dato viejo») y `ListaDia` (tarjeta con filas), `AnaliticasCelda` (una `TeselaDia`), delta ▲▼≈ (el color en la marca, nunca en la cifra), chip de ancla (discontinuo si estimada), punto de familia, sello «Nuevo» (un `InfoPill(.velo)`), botón (acento del CLUB; el primario es `BotonAccionDia`), plazo (`RegletaDia`), hueco, leyenda. El flujo (flex-wrap) es `FlowLayout`. |
| `Kit/AnaliticasSelectorVentana.swift` | El conmutador de contorno con el elegido en el acento del club (`SegmentoDia`, del kit); las seis ventanas, y si no caben, la tira se desliza. |
| `Kit/AnaliticasGlosa.swift` | La glosa a un toque (A5) con los días del método. |
| `Kit/AnaliticasGraficoLineas.swift` | `AnaliticasGraficoLineas` (forma/fatiga, proyección discontinua desde el último punto, marcas «hoy» y carrera rotuladas en franjas PROPIAS fuera del rango de los datos, valor final con halo del lado contrario a la otra serie) y `AnaliticasGraficoDivergente` (frescura en barras alrededor de cero). Swift Charts a escala real; un `v` nulo corta la línea. |
| `Kit/AnaliticasGraficoColumnas.swift` | Columnas apiladas (familias o zonas) con el plan en CONTORNO dibujado con las posiciones reales del gráfico (`ChartProxy` + `plotFrame`); discontinuo en el cubo en curso. |
| `Kit/AnaliticasGraficosMenores.swift` | Chispa (huecos reales, banda basal), barra de reparto al 100 % con el objetivo del coach, barras de hueco por tramo. |
| `Kit/AnaliticasFilas.swift` | La fila de progreso (familia · métrica · cifra · delta · chispa) y la de récord (prueba · fecha · antes · Nuevo · valor). |
| `AnaliticasDerivados.swift` | De lecturas a entradas de gráfico: series de forma, cubos de carga/horas por familia grande, cubos apilados por forma, partes de un reparto, el delta ya interpretado, el veredicto de forma en una frase (solo palabras del servidor). |
| `Bloques/` | `AnaliticasBloques` (contexto, hueco, despacho), `AnaliticasBloqueForma`, `AnaliticasBloqueSemanas`, `AnaliticasBloquesPorForma` (intensidad, progreso, récords, carrera, recuperación: pintados POR FORMA de la lectura, no por id). |

Tests: `FAHYBRIKTests/Analytics/Panel/` — decodificación (los cinco atletas, las seis ventanas, valores nuevos, ida y vuelta a disco), estados y huecos, formato y escala, el sujeto (`AnaliticasSujetoEstadoTests`), la piel (`AnaliticasPielTests`: contraste medido en claro y oscuro, paleta validada por ΔE, nada clavado en los ficheros) y las **capturas**: `AnaliticasGaleriaRenderTests` (la portada en plano, en claro y oscuro con el acento de fábrica y con otros dos clubes) y `AnaliticasCapturasTests` (la pantalla real a 390 × 844 página a página, con el selector pegado y la barra de pestañas). Los fixtures (`Fixtures/panel-*.json`) son la respuesta REAL de `cargarPanel` (`web/lib/analytics/panel.ts`) sobre una rama Neon desechable con cinco atletas sembrados (lleno: un año; mixto: sin reloj; poco: tres semanas sin carrera; vacío; viejo: parado desde hace semanas). Ningún JSON se escribe a mano ni sale de un cálculo aparte: si el contrato cambia, se vuelven a volcar.

## Cómo se pinta un bloque (la regla)

1. **Su estado** sale de `AnaliticasEstados.estado(de:)`, solo de las faltas que el servidor ya sirve en cada lectura: vacío si nada tiene número ni historia empezada; poco si algo espera historia (`historia` con `llevas > 0`), sesiones sin puntuar (`esfuerzo`), marcas por medir (`marcas`) o una pareja por configurar (`pareja`); viejo si TODOS los números llevan la falta `viejo` (hoy solo el progreso); lleno si no. **El cliente no cuenta días ni compara contra ningún umbral**: el corte lo decide el servidor al emitir la falta.
2. **Su hueco** (`AnaliticasHuecoDeBloque`): pendiente → «Muy pronto»; vacío/poco/viejo → la prosa de `huecos` con su salida (`DestinoDeSalida` → pestaña, Dispositivos, chat, tests). Nunca una silueta muda.
3. **Su cuerpo**, solo con lo que hay: gráficos por forma del dato, celdas con su delta (`AnaliticasDerivados.delta`: contra el periodo anterior si hay `comparacion`; si no, contra la `referencia`) y su ancla.

## Los detalles (`../Detalle/`, segunda tanda)

`AnaliticasPortadaView` empuja `AnaliticasDestino` (`.familia` · `.bloque` · `.sesion`) sobre un `NavigationStack`; cada destino es una pantalla con la misma arquitectura que la portada: un sobre Codable (`DetalleAnaliticas`, `CumplimientoAnaliticas`, `DetalleDeSesion`), una **lectura pura** (`LecturaDe<Pantalla>.desde`, con sus pruebas: aquí se decide qué se dice y qué se calla) y una **vista** que pinta lo ya decidido (`AnaliticasCuerpoDe<Pantalla>`), con cuatro estados (datos, esqueleto de la misma forma, error con reintento, vacío con su salida). El sujeto de un detalle es la MISMA fila que la portada (`progreso.<familia>`). Las galerías en plano (`AnaliticasDetalleGaleria`, solo Debug) pintan exactamente el cuerpo de cada pantalla y son lo que comparan las capturas del doble.

Para añadir uno: sobre y `fetch` junto a su modelo (`extension AnalyticsService`), porción en `AppDataStore` (en memoria), `LecturaDe…` con su prueba sobre un fixture del motor (`FAHYBRIKTests/Analytics/Detalle/Fixtures`, volcados por `web/scripts/volcar-analiticas-*.ts`), cuerpo con el kit (si falta una pieza, va al kit con tokens, no a la vista) y su caso en `AnaliticasDetalleGaleriaRenderTests`.

## Lo que NO se toca

- **Nada del panel se decide en la vista.** Ni un `fontSize`, ni un hex, ni un umbral, ni una palabra de veredicto. Todo es papel tipográfico (`.papel`), token de `Theme`, dato del servidor o `AnaliticasEstados`.
- **Ningún `switch` sobre ids** para decidir cómo se dibuja (solo para reconocer una lectura concreta: `carga.fondo`, `semanas.carga`).
- **El acento es el del CLUB** (marca y acción: el conmutador elegido, la salida de un hueco) y nunca un color de familia ni de dato. El veredicto NO cambia de color: cambia ▲▼ y la palabra; el color de estado va en la marca y en el arco, jamás en una cifra.
- **El tema es uno y lo elige el atleta.** Nada fuerza claro ni oscuro; todo sale de `Theme` y del kit `Theme/Dia`.
- **`null` ≠ 0.** Un hueco corta la línea; una barra sin dato no se pinta.
- **Nada por debajo de 15 pt**, ejes incluidos.
- **Copy de box**: «Disposición», no «readiness»; «ppm», no «bpm».

## Lo que el contrato firmado propone y el servidor NO sirve (descartado, DECISIONS 29-09)

`cobertura.ultimo_dato` y `metodo.{dato_viejo_dias, muestras_minimas, cobertura_poco_pct, semanas_minimas_forma, ventana_basal_dias, reciente_dias}` (`kit-analiticas/contrato.ts` y `metodo.ts`) eran propuestas del doble: el servidor decidió otra cosa (las faltas `viejo`, `marcas`, `pareja`, `historia`) y el cliente sigue lo servido. Los estados no se recalculan aquí.

## Cómo se verifica

```
cd ios && xcodegen generate
xcodebuild -project FAHYBRIK.xcodeproj -scheme FAHYBRIK -destination 'generic/platform=iOS Simulator' -derivedDataPath ./DerivedData build-for-testing CODE_SIGNING_ALLOWED=NO
# Los tests y las capturas corren en GitHub Actions (ios.yml sube el .xcresult):
xcodebuild ... test-without-building -only-testing:FAHYBRIKTests/PanelAnaliticasDecodeTests -only-testing:FAHYBRIKTests/AnaliticasEstadosTests -only-testing:FAHYBRIKTests/AnaliticasFormatoTests -only-testing:FAHYBRIKTests/AnaliticasCapturasTests
```

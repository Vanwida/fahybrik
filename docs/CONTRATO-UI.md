# CONTRATO DE UI — iOS y web

**Todo agente que toque una pantalla —de iOS o del dashboard— lee esto ANTES de escribir una línea.**

Las secciones 0-8 nacieron para iOS y **aplican a las dos superficies** (los componentes y formateadores concretos son los de cada stack). La **sección 9** es la parte específica de la web.

Existe porque el 28-jul nueve agentes trabajaron en paralelo sin vocabulario común y cada uno
resolvió lo mismo a su manera: el VO₂máx salió «42,4» en una pantalla y «42.4» en la de al lado,
el pulso acabó con 5 aspectos, 3 nombres y 2 unidades, y la duración con **seis** formateadores
distintos. Ninguno hizo nada irrazonable por separado. El fallo fue no darles esto.

---

## 0 · La regla que evita el 90 % del problema

**Antes de escribir un componente, un formateador o un estado vacío: `grep` si ya existe.**
Si existe, se usa. Si no existe, se crea **en el sitio compartido** (`Theme/`) y se dice en el
informe — nunca en línea dentro de la vista, nunca `private struct` si otro fichero podría
necesitarlo (así nacieron las duplicaciones del kit de HUD).

---

## 1 · Componentes — se usan, no se reinventan

| Necesitas | Usa | Vive en |
|---|---|---|
| Acción principal anclada abajo | `.anchoredAction { }` | `Theme/ScreenScaffold.swift` |
| Repartir la altura / centrar | `CenteredScreen` | `Theme/ScreenScaffold.swift` |
| Estado vacío o de error | `RedesignEmptyState` (la salida es **obligatoria por tipo**) | `Theme/ScreenScaffold.swift` |
| Hoja de 1-3 campos | `.compactSheet()` | `Theme/ScreenScaffold.swift` |
| Botón primario | `ExpertPrimaryButton` | `Theme/` |
| Tarjeta contenedora | `CardSurface` | `Theme/Atoms.swift` |
| Número grande | `HeroNumber` | `Theme/Atoms.swift` |
| Etiqueta en mayúsculas | `LabelText` · `SectionLabel` | `Theme/` |
| Cifra monoespaciada | `MonoText` | `Theme/` |
| Separador | `Hairline` | `Theme/` |
| Punto de modalidad | `ModalityDot` | `Theme/RedesignComponents.swift` |

**Prohibido**: pintar a mano un botón con `Text` + `frame` + `background`, escribir un estado
vacío con un `CardSurface` y una frase, o dibujar un `Circle()` donde va un `ModalityDot`.

## 2 · Un formateador por concepto

**Todo vive en `Theme/Formato.swift`** — una sola implementación, compilada también en
el reloj (lista explícita del target en `ios/project.yml`), para que muñeca y teléfono
no puedan escribir el mismo dato de dos maneras.

| Concepto | Canónico | Formato |
|---|---|---|
| Ritmo | `Formato.ritmo(_:_:)` | `4:15/km` · `1:52/500m` — **sin espacio**, con la `m`. `Formato.ritmoCifras` cuando la unidad la pinta el layout aparte |
| Distancia prescrita | `Formato.distancia(_:)` | `2,5 km` · `450 m` |
| Distancia medida | `Formato.distanciaCubierta(_:)` | `2,00 km` — en una medida los ceros SON el dato |
| Duración | `Formato.clock(_:)` | `5:00` — sin cero delante |
| Decimales | `Formato.esDecimal(_:)` | `42,4` — **jamás** `String(format:"%.1f")` en texto de cara al atleta |
| Carga | `Formato.kg(_:)` | `82,5 kg` |
| Unidad de ritmo | `Formato.UnidadRitmo` | `/km` · `/500m` · `/mi` |

**Las variantes se piden POR PARÁMETRO, nunca escribiendo una segunda función** — la
segunda función es exactamente como nació este problema:

- `anchoFijo: true` → `05:00`. **Solo** el cronómetro que corre, para que el layout no
  baile al pasar de 9:59. Lo que se lee después (resumen, log, marcas) va sin el cero.
- `subMinuto: .segundos` → `45s` en vez de `0:45`. Descansos y topes.
- `enHoras: false` → `63:45` en vez de `1:03:45`. El marcador de carrera, que habla en
  minutos («sub-60»).
- `siempreDecimales: true` → `12,0`. Lecturas que cambian en pasos de 0,1 en vivo.
- `decimales:` → precisión de la distancia.

Si encuentras otro formateador del mismo concepto, **es un duplicado**: no lo uses,
bórralo. El 28-jul había **catorce** implementaciones de la duración, tres grafías del
ritmo y dos `esDecimal` `private` en dos pantallas distintas — de ahí el «42,4» y el
«42.4». `MarkFormat.clock`, `StatsFormat.*`, `PrescriptionRenderer.format*`,
`WorkoutSession.formatElapsed`, `TreadmillMath.clock`, `DoblesLiveFormat.clock`,
`DurationLabel.mmss` y `TimeMinSecRow.format` ya no existen: no los busques.

### 2.1 · Y si el formateador que necesitas NO existe

Esta tabla dice qué usar cuando existe, y **no decía nada de cuándo falta**. Ahí cada
uno improvisa, que es como se generan los duplicados de mañana. La prueba: el 29-jul
tres agentes que **habían leído este contrato** escribieron la misma dosis de fuerza de
tres formas distintas el mismo día — `2×10`, `10 reps × 2` y `2×10 reps`.

**La regla: si un concepto de cara al atleta no tiene canónico, creas el canónico** en
el sitio compartido (`Formato`/`Vocab` en `Theme/`), **lo añades a esta tabla en el mismo
lote**, y lo dices en el informe. Nunca lo resuelves en línea dentro de tu vista «porque
es solo esta pantalla»: no hay ninguna que sea solo una.

Lo fija `FAHYBRIKTests/App/FormatoTests.swift`. Si cambias una grafía, salta ahí y no
en la pantalla de un atleta.

## 3 · Vocabulario — español, siempre

Las palabras viven en **`Vocab`** (mismo fichero, `Theme/Formato.swift`): `Vocab.fc`,
`.ppm`, `.fcMedia`, `.fcMax`, `.fcReposo`, `.ritmo`, `.distancia`, `.vuelta`, `.total`.
Úsalas — un literal suelto es lo que hace que el siguiente no lo encuentre.

- **Pulso**: se llama `FC` (o «pulso»), la unidad es `ppm`. **Nunca** `HR` ni `bpm` ni `Avg HR`.
- **Cadencia**: la unidad es `pasos/min` (`Vocab.cadencia`), **nunca** `ppm` — se escribía
  igual que el pulso y en las mismas pantallas.
- Nada en inglés en texto de cara al atleta. Ni una etiqueta. (`Lap`, `Zone`, `Pace`,
  `Dist Tgt` y `Avg HR` ya se fueron; no vuelvas a meterlos.)
- Español natural de gimnasio: lo entiende alguien del box a la primera, sin jerga técnica.

## 4 · Tipografía

- Tamaños **del sistema de tokens** (`Theme.Typography`), no números sueltos.
- `scaledFont` en **todo**, incluidos los números. Si la prosa escala y el dato no, a tamaño
  accesible la etiqueta adelanta al dato.
- **El dato pesa más que su etiqueta.** Siempre. Si la etiqueta es 16, el dato no puede ser 16.
- **Pero un valor CATEGÓRICO no es una cifra.** «Español», «HYROX» o «Intermedio» a 22 pt
  monoespaciado es absurdo: el monoespaciado es para lo que se compara columna a columna. Un
  valor categórico gana a su etiqueta **por peso y un escalón de tamaño en la tipografía de
  texto**, no convirtiéndose en un instrumento de medida.
- Nada de medios puntos ni de dos niveles separados por 1 pt: eso no es jerarquía, es ruido.

## 5 · Toda pantalla resuelve sus cuatro estados

**Con datos · cargando · vacío · error.** Los tres últimos con las piezas compartidas, no a mano.
El 60 % de los problemas de la app viven en el vacío, que es lo que ve un atleta nuevo.
Y un estado vacío **siempre lleva salida**: o una acción, o una frase que declare por qué no la hay.

## 6 · Composición — toda pantalla declara qué hace con su altura

Las cuatro reglas (`docs/design/pantallas-que-ganan-su-altura.html`) son de obligado cumplimiento:
**(1)** toda pantalla tiene un sujeto y se ve primero · **(2)** el hueco se gana o no existe ·
**(3)** la acción vive abajo, siempre visible · **(4)** lo secundario se pliega.

Pero las reglas solas no bastaron: se escribieron el 27-jul y la app sigue apilando desde arriba.
Faltaba lo que las hace aplicables — **los arquetipos**. Sin ellos cada pantalla vuelve a decidirlo
todo desde cero, y por eso salen distintas aunque nadie haga nada irrazonable.

### 6.1 · Las cuatro estrategias de altura

**Toda pantalla declara la suya. Alinear arriba y dejar el resto muerto NO es una de ellas.**

| Estrategia | Cuándo | Qué hace con el sobrante |
|---|---|---|
| `llena` | Hay contenido, y **cuánto depende del dato** | Si no llega al alto, **reparte**; si desborda, scrollea desde arriba |
| `centra` | No hay contenido, o es **una sola decisión** | Centra el bloque; el aire es simétrico, no una cola |
| `previsualiza` | Estás decidiendo algo | El sobrante **se convierte en el sujeto**: enseña lo que estás montando |
| `gobierna` | En vivo | Un dato manda y **escala** hasta llenar; el resto se subordina |

**`llena` NO significa «esto llenará».** Significa «esto se adapta a lo que haya». La cantidad de
contenido es dato-dependiente y **no la sabes al diseñar**: la misma sección de Analíticas llena con
cuatro tarjetas y deja 250 pt muertos con dos. Por eso `llena` reparte cuando falta y scrollea
cuando sobra, en vez de obligarte a acertar de antemano. Fijar la estrategia a priori es justo lo
que hace que luego el dato real te desmienta.

**Y el sobrante entra EN LAS FILAS, nunca en una cola debajo.** Cuatro filas de 60 pt en un hueco
de 460 no «ocupan el alto» por estar en un contenedor que sí: se apilan arriba y dejan 220 pt de
cola. Que esto haya que escribirlo lo demuestra el 29-jul: **los tres agentes que construyeron los
arquetipos cometieron en su primera propuesta el mismo hueco que venían a arreglar.**

**Las cuatro estrategias no son excluyentes: se componen.** `previsualiza` y `gobierna` **degradan
a `centra`** cuando se acaba la verdad que enseñar (un solo ítem sin más datos) o cuando el número
ya no puede crecer sin dejar de leerse. Una envuelve a la otra; no se elige una y se descarta el
resto.

**Prohibido en la raíz de una pantalla: `VStack { contenido; Spacer() }`.** Ese `Spacer()` es la
firma del problema — declara que sobra alto y que nadie decidió qué hacer con él. `Spacer()` solo
es legítimo *dentro* de una estrategia declarada (empujar la acción al fondo, repartir una fila).

**Un `ScrollView` con contenido que no llega al alto es el mismo fallo con otra cara:** da inercia
sobre nada y delata que no se pensó el caso corto. Si el contenido real no llena, la estrategia es
`centra` o `previsualiza`, no `llena`.

### 6.2 · Los cinco arquetipos

Toda pantalla de la app es uno de estos cinco. Si crees que la tuya no encaja, **el modelo está mal
y hay que arreglarlo aquí** — no inventes un sexto en tu vista.

| Arquetipo | El sujeto es… | Altura | La acción | Se pliega |
|---|---|---|---|---|
| **Configurar** | El **resultado** que vas a producir, nunca los campos | `previsualiza` | Anclada; se puede empezar **sin tocar nada** | Todo lo que casi nadie cambia |
| **Lista** | El conjunto **y su estado** de un vistazo | `llena` + scroll | La fila; la global anclada | Los filtros |
| **Detalle** | El dato que te trajo a abrirla | `llena` con **contexto** | Anclada | Lo que no cambia la decisión |
| **Vacío** | **Qué falta y por qué** | `centra` | **La salida — obligatoria** | — |
| **En vivo** | El número que gobierna el esfuerzo **ahora** | `gobierna` | Enorme, anclada, a una mano y sudando | Todo lo demás |

**El hueco del Detalle se gana con lo que da sentido al dato** — su historia, contra qué se compara,
de dónde sale — **no con aire**. Un detalle que enseña un número y deja media pantalla vacía no está
terminado: le falta el porqué, que es justo lo que el atleta abrió a buscar.

**Un arquetipo se degrada, no se rompe:** una Lista sin elementos **es** un Vacío, y se pinta como
Vacío (centrado, con salida), no como una lista de cero filas con el encabezado colgando arriba.

### 6.2 bis · Un hueco se declara o se calla — la regla

El §7 dice «lo que no se sabe **no se pinta**» y el §6.2 dice «el hueco **se declara**». En una
lista chocan de frente: un 1RM que falta, ¿es un hueco que se declara o algo que no se pinta?

**La regla: se declara cuando el atleta puede llenarlo con un acto concreto; se calla cuando no.**
«Te falta el press banca» es una invitación y va con su acción. «No tenemos tu VO₂máx» sin nada que
hacer es ruido gris que ocupa el sitio de lo que sí sabes. Y en corolario:

**Un CONTADOR se pinta en cero; un VALOR MEDIDO no existe hasta que se mide.** «Tus tests: 0 de 4»
es información — de hecho es cuando más falta hace. «VO₂máx: —» no lo es. Por eso hoy el contador de
calibración desaparece justo cuando vale cero, que es exactamente al revés.

### 6.3 · El caso mínimo es el caso de diseño

Se diseña para el atleta **recién dado de alta** — sin marcas, sin zonas, sin tests, sin dispositivo —
y para el que lleva un año. **El mínimo primero**: es el que ve todo el mundo el primer día y es donde
«apilado arriba y vacío abajo» duele más. Una pantalla que solo se sostiene con datos de un atleta
veterano no está diseñada, está rellena.

### 6.4 · El tema es UNO y lo elige el atleta

`ThemeMode` (claro · oscuro · sistema) se aplica **globalmente** en `AppRoot` vía
`.preferredColorScheme`. **Ninguna pantalla fuerza su propio esquema.** Si una vista se ve clara
mientras la de al lado se ve oscura, eso no es una decisión de diseño: es una vista que **clava
colores en vez de usar los tokens**, y se arregla usando `Theme.Color`.

## 7 · Honestidad del dato (ley del proyecto)

La app **mide lo que está conectado**. Lo demás solo existe si el atleta lo declara, y solo si
declararlo cuesta **un toque**. Lo que no se sabe **no se pinta** — ni con guiones, ni con una
barra vacía que insinúe progreso. Y **ningún valor por defecto puede parecer un dato del atleta**
(así se colaron un ritmo de 1:52 en todos los benchmarks y un RPE de 7 que nadie eligió).

## 8 · Antes de decir «hecho»

Recorre cada pantalla que tocaste, **estado a estado**, como el atleta que la usa — sudando, el
móvil en el suelo, a tres metros, con una mano:

1. ¿Cuál es el sujeto? ¿Se ve primero y más grande?
2. ¿Cada elemento se gana su sitio?
3. ¿El orden responde a la pregunta que trae al abrirla?
4. ¿Se lee en su situación real?
5. ¿Miente algo?
6. ¿Qué pasa si ese dato no existe?

Y si al recorrerla ves algo feo o inútil que nadie ha reportado: **arréglalo y dilo**.

---

## 9 · El dashboard del coach (web)

Existe porque hasta el 29-jul este contrato se titulaba «— iOS» y la web no tenía equivalente, así que cada agente inventó su escala. El resultado medido: **631 tamaños de fuente escritos a mano** en unos 11 escalones, de los cuales **116 son medios píxeles** (`text-[11.5px]`, `text-[10.5px]`, `text-[12.5px]`) — justo lo que el §4 prohíbe con todas las letras.

**Y el sistema ya existía.** `globals.css` tiene escala de espaciado (`--spacing-xs..xxxl`) y de tipo (`--type-display/body/small/caption`), y hay **55 tokens de color** bien hechos, respetados con cero clases crudas de Tailwind. El problema nunca fue que faltara el sistema: es que v2 no lo mira.

### 9.1 · Se usan los tokens que ya hay

- **Tipografía y espaciado: de la escala.** Ni un `text-[Npx]` nuevo. Los medios píxeles no son jerarquía, son ruido.
- **Color: token siempre, y sin fallback.** Un `var(--v2-danger, #c0362c)` con el hex dentro es una segunda fuente de verdad que diverge en silencio: hoy hay **tres fallbacks distintos** para el mismo rojo. Y peor, **un fallback tapa que el token no existe**: `--v2-success` no está declarado (el real es `--v2-ok`), así que el «Guardado» de `InlineSave` **nunca sale verde** y nadie se ha enterado. Sin fallback, eso se ve el primer día.
- **El scrim de un modal es `--v2-scrim`**, no `bg-black/60`. Ya se arregló una vez porque el negro sólido hacía ver oscuro el editor en tema claro, y volvió por 11 sitios.
- **El naranja de marca no es un color de dato.** No se usa como tinte de zona ni de serie.
- **Un solo ancho de contenedor.** Hoy conviven cuatro (`1480` ×15, `1280`, `1180` ×2): Pagos y Métricas son 300 px más estrechas que Atletas y Hoy, y se nota al cambiar de sección.

### 9.2 · Un instrumento, no un documento

El fallo de raíz del dashboard es el mismo que el del §6 en iOS, con otra cara: **cada vista es una pila vertical de secciones a ancho completo dentro de una columna centrada**, apiladas a una sola densidad. Nadie decidió para qué sirve el viewport, así que el vacío no es un bug de una pantalla — es lo que pasa cuando se acaban las secciones. Medido: **508 px muertos en `/altas` (56 % del viewport)**, 401 en `/pagos`, 389 en `/tests`, 295 bajo un roster de tres filas.

Las cuatro estrategias de altura del §6.1 aplican igual. Y en web se añade el ancho:

- **Una fila no reparte 700 px de vacío entre dos datos.** Las columnas se dimensionan al dato, no a `1fr` por defecto.
- **Lo que decide la acción es lo más grande.** Hoy está invertido: en `/hoy` la fecha pesa 36 px y «0 requieren atención» pesa 11; en `/altas` el único dato urgente («esperando 20 días») son 11 px en azul tranquilo, sin escalar con la urgencia.
- **Toda ruta resuelve sus estados** (§5). Hoy hay **cero** `loading.tsx`, `error.tsx`, `not-found.tsx` y `<Suspense>` en las 24 páginas: al navegar, la pantalla anterior se queda congelada sin ninguna señal.

### 9.3 · El responsive recompone, no esconde

390 es obligatorio: Pablo usa el móvil. Hoy el móvil **pierde información** en vez de reorganizarla — la adherencia y la última actividad, que son los dos datos de triaje del roster, sólo existen desde 1024 y 1280 px. Un dato que importa a 1440 importa a 390: cambia de sitio, no desaparece. Y un contenedor con scroll horizontal lleva **indicador** (las rails de `/hoy` lo tienen; la barra de 10 pestañas de la ficha del atleta no, y en móvil se ven 3).

### 9.4 · Se diseña para ~100 atletas

Es la escala de lanzamiento, no la de hoy. Una tabla que se lee bien con 3 filas y pinta las 100 de golpe **no está diseñada**: `/biblioteca` mide hoy **15.980 px de alto en 390** con sus 99 bloques, sin paginación ni virtualización.

### 9.5 · El patrón bueno ya existe en casa

`/mensajes` (tres columnas a altura completa con el compositor anclado), `/atletas/[id]/intake` (dos columnas con barra de acción pegada abajo) y `/metricas` están **bien compuestas**. No hay que inventar el sistema: hay que propagarlo.

### 9.6 · Nada servido que no se pinte

**29 rutas de API del coach no las llama nadie** (verificado: fuera de su propio `route.ts` sólo aparecen en la caché de `.next`). Entre ellas, la revisión semanal entera, la tabla de cohorte, el briefing, la bandeja de triaje con acciones en masa, los ajustes masivos de plan con deshacer, y **la ingesta del método por RAG** — que es el titular del proyecto. Hay incluso un `columns.ts` huérfano que define etiquetas y anchos de una tabla que nunca se construyó.

**Regla:** un endpoint sin superficie es trabajo que el coach no recibe. Si se construye un endpoint, se construye lo que lo enseña **en el mismo lote**, o se declara explícitamente como pendiente en `FOCUS.md`. Ver la memoria «círculo cerrado, nada huérfano».

---

## 10 · El lenguaje del entreno en vivo

La tanda del 29-jul (`/es/design/entreno`) acertó la **estructura**: un sujeto por formato, según quién gobierna la transición. Lo que le faltaba era **lenguaje**: siete pantallas correctas que no se reconocían como la misma app. Esto lo fija, y aplica a las diez vistas en vivo, al reloj y a lo que se construya después en Swift.

### 10.1 · La zona tiñe el lienzo. Siempre.

**Es la idea que da identidad, y hoy solo la usa el rodaje.** El fondo de una vista en vivo **es** tu zona de pulso: un tinte ambiente, oscuro y saturado apenas, que cambia contigo. Aplica a **todas** las vistas donde haya FC — correr, ergo, fuerza, EMOM, For Time, AMRAP, dobles y la muñeca.

- Sin ancla de FC **no hay tinte**: fondo neutro. El color es un dato, y lo que no se sabe no se pinta (§7).
- El tinte es **ambiente, no decoración**: nunca compite con el sujeto ni tiñe el texto.
- La escala de zona es la que ya existe (`--v2-z*`), no una nueva. Y el **naranja de marca no es un color de zona** (§9.1).

### 10.2 · Un solo numeral, y es el del cero rachado

Los números grandes de una vista en vivo se leen a tres metros, sudando y en movimiento. Van todos con **la misma cara**: la monoespaciada de cifra rachada que ya usan el EMOM y la fuerza. Nada de tres tratamientos distintos para el 139 del pulso, el 0:25 del reloj y el 5×100 de la serie. **Un numeral para toda la app.**

### 10.3 · El sujeto cae siempre a la misma altura

En una familia de vistas que se turnan durante el mismo entreno, **el sujeto no puede bailar**: si en una está centrado y en la siguiente 200 pt más abajo, el atleta reencuadra cada vez que cambia el formato. Se fija **una banda del sujeto** y todas las vistas la respetan, sea cual sea el dato que caiga dentro.

### 10.4 · El sujeto no puede ser un widget entre widgets

**Corregido el 29-jul al mirar `vivo-erg`, que es la vista más evolucionada de la tanda.** La regla decía «el sujeto vive sobre el fondo, nunca dentro de una tarjeta», y es demasiado absoluta: el erg mete su `1:54` en una superficie y funciona, porque **esa superficie ES la pantalla** — ocupa el centro, la corona una regla de acento y todo lo demás se le subordina.

Lo que falla en el AMRAP no es la caja: es que su caja **pesa lo mismo que las tres tarjetas de movimientos de debajo**, así que el sujeto se lee como un ítem más de una lista. La regla real:

**El sujeto es la superficie dominante de la pantalla, o no lleva superficie ninguna.** Un contenedor alrededor del protagonista solo se gana si manda sobre todo lo demás en tamaño y en jerarquía. Si comparte aspecto con lo secundario, fuera la caja y el número directo sobre el lienzo (como el rodaje).

### 10.5 · La acción no pesa como el sujeto

«Terminar rodaje» o «Serie hecha» son la **acción**, y hoy pesan igual que el dato que gobierna la pantalla. Se anclan abajo y se alcanzan con una mano (§6.2), pero **no compiten en peso**: el sujeto es lo que miras, la acción es lo que tocas.

### 10.6 · Lo que de verdad haces no va en gris

Corolario de §6.2: en un EMOM el sujeto es el minuto drenando, pero **el trabajo es «10 de 12 cal»** — y hoy está más pequeño que el reloj y metido en un panel gris aparte. Lo secundario se pliega (regla 4), pero **el trabajo no es secundario**: es lo segundo más importante de la pantalla y tiene que leerse como tal.

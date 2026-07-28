# CONTRATO DE UI — iOS

**Todo agente que toque una pantalla de iOS lee esto ANTES de escribir una línea.**

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

| Concepto | Canónico | Formato |
|---|---|---|
| Ritmo | `PrescriptionRenderer.paceString` | `4:15/km` · `1:52/500m` — **sin espacio**, con la `m` |
| Distancia | `PrescriptionRenderer.formatDistance` | `2,00 km` · `450 m` |
| Duración | `MarkFormat.clock` | `5:00` — sin cero delante. En cronómetro en vivo se permite ancho fijo **solo** para que no baile el layout, y se pide por parámetro, no con otra función |
| Decimales | coma española (`esDecimal`) | `42,4` — **jamás** `String(format:"%.1f")` en texto de cara al atleta |

Si encuentras otro formateador del mismo concepto, **es un duplicado**: úsalo no, repórtalo.
Hoy existen seis funciones `clock` distintas y tres grafías del ritmo.

## 3 · Vocabulario — español, siempre

- **Pulso**: se llama `FC` (o «pulso»), la unidad es `ppm`. **Nunca** `HR` ni `bpm` ni `Avg HR`.
- Nada en inglés en texto de cara al atleta. Ni una etiqueta.
- Español natural de gimnasio: lo entiende alguien del box a la primera, sin jerga técnica.

## 4 · Tipografía

- Tamaños **del sistema de tokens** (`Theme.Typography`), no números sueltos.
- `scaledFont` en **todo**, incluidos los números. Si la prosa escala y el dato no, a tamaño
  accesible la etiqueta adelanta al dato.
- **El dato pesa más que su etiqueta.** Siempre. Si la etiqueta es 16, el dato no puede ser 16.
- Nada de medios puntos ni de dos niveles separados por 1 pt: eso no es jerarquía, es ruido.

## 5 · Toda pantalla resuelve sus cuatro estados

**Con datos · cargando · vacío · error.** Los tres últimos con las piezas compartidas, no a mano.
El 60 % de los problemas de la app viven en el vacío, que es lo que ve un atleta nuevo.
Y un estado vacío **siempre lleva salida**: o una acción, o una frase que declare por qué no la hay.

## 6 · Las cuatro reglas de pantalla

Están en `docs/design/pantallas-que-ganan-su-altura.html` y son de obligado cumplimiento:
**(1)** toda pantalla tiene un sujeto y se ve primero · **(2)** el hueco se gana o no existe ·
**(3)** la acción vive abajo, siempre visible · **(4)** lo secundario se pliega.

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

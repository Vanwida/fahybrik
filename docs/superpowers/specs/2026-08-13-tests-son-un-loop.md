# Tests son un loop

**Fecha:** 2026-08-13  
**Estado:** firmada.  
**Qué se construye:** la unidad de ocurrencia, el informe (misma pantalla atleta y coach), el archivo por familia, la comparativa de homólogos y su publicación por Del coach. El CMJ es el primer informe completo.

## Principio

Esto es un loop entre atleta y coach. Si un lado tiene un dato que el otro no puede abrir, o si el coach tiene que contarlo por chat porque la pantalla no existe, el producto es mediocre.

HOY manda. La ficha entiende. El test **cierra**: se programa, se hace, se guarda como ocurrencia, se lee, se compara, se publica. Cada uno con su prioridad:

| Quién | Pregunta |
|---|---|
| Coach | ¿Qué le pido, qué salió, contra la vez anterior, y cómo se lo digo? |
| Atleta | ¿Qué tengo que preparar, qué hice, y qué me ha dicho? |

Un dato, un sitio. Las dos caras leen el mismo informe. El canal de decirlo es Del coach (publicar ≠ chat).

## El loop

```
Coach programa (ficha → Fuerza, o Método › Tests)
  → Atleta prepara (briefing) y ejecuta (cámara o sesión)
    → Nace una OCURRENCIA con su informe
      → Los dos la leen (misma pantalla)
        → El archivo de esa familia crece (todos los CMJ, todos los 5K, …)
          → Semanas después, nueva batería = nuevas ocurrencias
            → Comparativa de homólogos (esta vs aquella)
              → Coach publica la evolución (Del coach, nota con la comparativa embebida)
                → Atleta la recibe en comunicados, no en el chat
```

Si un eslabón se cae a «un número en una lista» o a «te lo cuento por mensaje», el loop está roto.

## La unidad: ocurrencia

Una ocurrencia = **un assignment de un protocolo en un día**.

No es el último valor del slug. Hoy `result_captured` y `jump_profile` leen el último `athlete_benchmarks` de ese slug: dos CMJ hechos muestran el mismo informe. Eso rompe archivo, comparativa e informe.

**Decidido:**

- `athlete_benchmarks.assignment_id` (nullable FK, `on delete set null`). Las filas viejas (onboarding, Marcas, Ritmos) se quedan a null: no son ocurrencias de batería.
- Al guardar un resultado de batería (salto, sesión, «añadir resultado», API del coach) se escribe el `assignment_id`.
- El estado de una assignment se resuelve **solo** con los slugs de ESA assignment.
- El informe se construye al leer, de esa ocurrencia + el método del coach. No se guarda un póster.

Homólogos = dos ocurrencias del **mismo** `calibration_slug` del mismo atleta. Un CMJ no se compara con un 5K.

## Superficies (un dato, un sitio)

| Superficie | Dónde | Qué hace |
|---|---|---|
| Programar | Coach: Rendimiento → Fuerza (`Programar test`). Atleta: no se auto-asigna. | Crea la ocurrencia (`scheduled`). |
| Preparar / hacer | Atleta: hub de tests + tarjeta del día. Salto = briefing → cámara. Resto = sesión. | Cierra la ocurrencia. |
| Informe | Coach: Fuerza, toca la fila. Atleta: hub, «VER RESULTADO». Misma pantalla. | Lee ESA ocurrencia. |
| Archivo | Coach: Fuerza, por familia (Saltos, Correr, Ergo, …). Atleta: hub, agrupado igual. | Lista todas las ocurrencias de un protocolo. |
| Comparativa | Desde el archivo o desde un informe: «contra otra vez». | Dos homólogos. |
| Publicar evolución | Desde la comparativa: «Dar feedback». Abre Del coach con la sección ya montada. | El atleta lo recibe en comunicados. |

No sexta pestaña. No segundo canal. Mensajes no es el sitio.

## Contrato del informe

Toda ocurrencia tiene un informe. No es un diálogo de tres cifras.

```
identidad     protocolo · fecha de la medición · atleta
héroe         la medida que el test mide (cm | tiempo | kg | ppm)
contexto      el resto de medidas de ESA ocurrencia
método        nivel / banda si el coach tiene baremo para esa medida
lectura       frase COMPUESTA de los números, cero texto libre del modelo
snapshot      peso (si aplica), carga (si aplica), condiciones que ya existen
```

Filtro de cada campo: el atleta lo entiende sin ambigüedad; la app calcula con él; el coach lo publica. Si acaba en prosa suelta, está mal.

Precisión honesta: se guarda el valor fino; se enseña la resolución real del instrumento. En salto: **47 cm**, no 47,33.

## Informe CMJ (primer renderer completo)

Fuente: informe de salto ago-2026 (47,33 / 39,38 / +15 kg / 76 kg / LRI 0,85). No se clona el póster ni su marca. Se enseña **más** y mejor, en la app.

| Bloque | Qué sale | De dónde |
|---|---|---|
| Identidad | «Perfil de salto» · fecha medida | assignment + `recorded_at` de la ocurrencia |
| Explosivo | cm sin carga · nivel 1–5 · escala de bandas con marca · etiqueta del nivel | `cmj` de ESA assignment + `coach_jump_method.height_bands` (las bandas ganan `label`; es método) |
| Respuesta a la carga | cm con carga · nivel · caída abs (los dos cm) · caída relativa · carga relativa (% peso) | `cmj` + `cmj_loaded` + `load_kg` + `body_mass_kg` |
| LRI | índice · nivel · escala con posición · etiqueta | derivado; cortes de `coach_jump_method.lri_bands` |
| Lectura | una frase con los % y la etiqueta, no un ensayo | plantilla sobre números |
| Snapshot | peso del día · carga usada | snapshot de la sesión, no el peso de hoy |
| Intentos (nuestro) | n hechos · el que se queda · calidad | `jump_attempts` de ESA assignment |

Si no hubo serie cargada: el bloque de carga y el LRI no se inventan. La explosiva se enseña igual.

La lectura se COMPONE. Ejemplo con esos números: *Capacidad explosiva muy alta. Al añadir una carga equivalente al 20 % de su peso pierde un 17 % de altura. Respuesta a la carga: correcta.*

Mecanismo (código): `h = g·t²/8`, despegue = último pie, aterrizaje = primer pie.  
Método (dato): bandas, carga por defecto, intentos, keep. `coach_jump_method` se LEE de verdad. Cero cortes cableados en Swift.

## Cáscara del resto de familias

Sin informe-fuente de 3′-9′, 30′, 2-1-2 o trineo **no se inventa un póster**. Sí entra en el loop:

- Identidad + héroe (el `result_label` de ESA ocurrencia) + medidas de esa assignment + archivo + comparativa (delta del héroe + sparkline de homólogos).
- Si el test calibra zonas (`derives: run_zones | row_zones | ski_zones | hr_zones`): la comparativa enseña además la escalera de bandas entonces → ahora (la propuesta `test-comparativa` del 2-ago). Un CMJ no calibra: no hay escalera.
- El día que llegue el protocolo de un test, se añade su renderer. El modelo no cambia.

## Archivo

Agrupado por familia del catálogo (`saltos`, `correr`, `ergo`, `fuerza`, `estaciones`, `simulacion`). Dentro, por protocolo. Dentro, ocurrencias nuevas primero.

Cada fila: fecha · héroe · estado (programado / falta / hecho). Tocar una hecha abre el informe. Desde el informe o el archivo: «comparar».

Vacío = una línea, no un empty state de icono.

## Comparativa de homólogos

Dos ocurrencias del mismo `calibration_slug`.

Se guarda la **config** (ids de las dos assignments), se resuelve al leer. Si más tarde se corrige un frame o llega un histórico, la nota no cuenta un fantasma.

```
antes          ocurrencia A (la vieja)
ahora          ocurrencia B (la nueva)
delta          del héroe, con signo honesto (en salto, más cm es mejor)
cuerpo         lo que el renderer de esa familia sabe comparar
             · CMJ: cm, carga, LRI, lectura de los dos
             · el que calibra: héroe + escalera de zonas
             · el resto: héroe + medidas
```

El delta **no opina** (ni verde ni rojo de producto). El coach escribe si está bien. Misma regla que la comparativa de zonas.

Sin homólogo: no hay pantalla de comparativa. El CTA no se pinta.

## Del coach

No hay un sexto `kind`. «Dar feedback» es una **nota** con una sección de datos. Ya está decidido (`coach-communications.ts`).

Nueva forma de sección: `test_compare` (no reutilizar `comparativa`: aquella son **minutos por zona en meses**, otra pregunta).

- Se guarda: `a_assignment_id`, `b_assignment_id` (homólogos, mismo atleta).
- Se resuelve al servir: el DTO de comparativa de ESA familia.
- Ancla: `test` | `plan` | `week` | `general`. Habla de dos días de test, no de meses: colgarla de `session` / `race` / `checkin` está prohibido.
- El compositor se abre **desde la comparativa**, con la sección ya montada y el capítulo «Lo que veo» vacío. Igual que zonas.
- iOS pinta la forma. Una forma que el coach publica y el atleta no ve es el loop roto (hoy le pasa a `comparativa` de zonas: el DTO viaja y Swift la salta — no se copia ese fallo).

El coach no teclea los cm. Si los teclea en una `cifra`, eso no es este loop.

## Datos

**Migración 0195** (aditiva, eslabón 1): `athlete_benchmarks.assignment_id bigint references workout_assignments(id) on delete set null` + índice `(assignment_id, exercise_slug)`. Backfill conservador: un assignment por slug, o mismo día.

**Migración posterior** (eslabón Del coach): forma `test_compare` en el CHECK de `display` + dos columnas de config (`test_a_assignment_id`, `test_b_assignment_id`). Mismas reglas que 0170: se guarda config, se resuelve al servir. CHECK: las dos van juntas o ninguna; distintas.

**Lectores que cambian:** `loadBatteryStatus`, `recordTestBenchmark` (acepta `assignment_id`), el puente de batería, `recordJumpResults`. Los lectores de Marcas / onboarding / Ritmos no tocan `assignment_id`.

**`coach_jump_method`:** se lee al construir el informe y al capturar (carga, intentos, keep). Si el coach no tiene fila, el defecto actual. Nunca se duplican los cortes en Swift.

## iOS · web · doble

Un DTO compartido por ocurrencia / informe / comparativa. iOS y el panel pintan el mismo contrato. El doble:

- `test-informe` (propuesta, luego espejo): el informe CMJ y la cáscara genérica.
- `test-comparativa` (ya existe, 2-ago): se reescribe para homólogos + escalera cuando calibra. No nace una segunda comparativa.
- `tests-calibracion` se actualiza: VER RESULTADO abre el informe de ESA ocurrencia.

Cambio de Swift del informe = el espejo en el mismo lote.

## Contra qué se rompe (cero texto libre)

| # | Caso | Cómo entra |
|---|---|---|
| 1 | Informe de salto: 47,33 / 39,38 / +15 / 76 / LRI 0,85 | Una ocurrencia, dos medidas de altura, LRI derivado |
| 2 | Solo CMJ, sin barra | Sin bloque de carga ni LRI |
| 3 | Tres intentos basura el mismo día | Una ocurrencia; `kept` elige; los demás se ven en intentos |
| 4 | Segundo CMJ a las 6 semanas | Dos ocurrencias. Cada una su informe. Comparativa de homólogos |
| 5 | Coach publica la evolución | Nota + `test_compare`. El atleta la ve en comunicados |
| 6 | 5K de semana 1 y 5K de mes 3 | Homólogos de `tt_5k`. Héroes + escalera de zonas |
| 7 | Coach pide «todos los umbral» | Archivo familia correr / protocolo umbral. No un cajón suelto |
| 8 | Resultado de Marcas (sin assignment) | Benchmark sin `assignment_id`. No es ocurrencia. No entra al archivo de batería |
| 9 | «Falta el resultado»: corrió y no hay número | Ocurrencia `result_pending`. Informe no existe todavía |
| 10 | Atleta mira un test de hace meses para recordar | Hub → familia → ocurrencia → informe. No el último slug |

## Dónde puede fallar

- Si el informe se deriva del último slug, el archivo miente. La 0195 es la raíz.
- Si Del coach congela cm, la nota envejece. Se resuelve al servir.
- Si se reutiliza `comparativa` (minutos/zona) para fingir un test, las dos preguntas se pudren.
- Si iOS no pinta `test_compare`, el loop se rompe en el último paso.
- Si se inventa el póster de un test sin fuente, el modelo se llena de prosa.

## NO hacer

- Sexta pestaña. Sexto `kind` de comunicado.
- Clonar el póster WCSE ni escribir su marca, ni «Pablo», ni «Fabrik» en producto.
- Auto-test desde Marcas. El atleta no se programa el CMJ.
- Enseñar 47,33 como si hubiera platillo.
- Reutilizar `time`/`seconds` para el vuelo.
- Chat como canal de la evolución.
- Un informe distinto para el coach y para el atleta.
- Comparar protocolos distintos.
- Hardcodear bandas en Swift.

## Orden de obra

1. Ocurrencia (0195 + lectores). Sin esto el resto miente.
2. DTO de informe + renderer CMJ (shared) + pantallas iOS/web/doble.
3. Archivo por familia en Fuerza y en el hub.
4. Comparativa de homólogos (CMJ primero; escalera si calibra).
5. Del coach `test_compare` + «Dar feedback» desde la comparativa + pintura iOS.

Cada paso deja el loop más cerrado que el anterior. No se publica un eslabón que el otro lado no puede abrir.

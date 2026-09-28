# Un solo entreno — contrato para iOS (servidor 2026-09-28, migración 0274)

Un entreno libre y una sesión del coach son el mismo objeto: plantilla, segmentos,
asignación y ejecución cuyos tramos cuelgan de sus segmentos. El porqué está en
`docs/DECISIONS.md` (2026-09-28 «Un solo entreno»). Esto es lo que la app tiene
que hacer para guardarlos igual.

## 1. Ejecutar un plan que ya existe → la sincronización del coach

Cualquier asignación que ya existe (del coach o un libre guardado, `origin = 'self'`)
se ejecuta como una sesión del coach:

- se lee su detalle (`template_segment_id` de cada ítem) como cualquier sesión;
- al terminar: `POST /api/sync/workout-execution` con `assignment_id` y, en cada
  tramo, el `template_segment_id` del ítem que lo produjo (en un bloque plegado,
  el del primer ítem, como hoy);
- **nunca** `POST /api/athlete/workouts/free` para un plan guardado: eso lo duplicaba
  (plantilla + asignación nuevas y el plan «pendiente»).

El servidor no distingue origen: una asignación propia se guarda igual que la del
coach. Un `template_segment_id` que no sea de la plantilla de ESA asignación se
ignora (el tramo queda sin enlazar).

## 2. Libre creado en el momento → guardarlo primero y ejecutarlo como el punto 1

`POST /api/athlete/workouts/free/plan` (sin cambios en el cuerpo). La respuesta
añade los segmentos:

```json
{
  "saved": true,
  "assignment_id": "812",
  "segments": [
    { "id": "3701", "position": 1, "block_position": 1 },
    { "id": "3702", "position": 2, "block_position": 1 }
  ],
  "template_segment_ids": ["3701", "3702"],
  "origin": "self"
}
```

- `segments`: los mismos ids con su `position` y `block_position`, en el mismo orden.
  Se enlaza por el ÍNDICE en esta lista, nunca por el valor de `position`.

- `template_segment_ids`: uno por segmento de la plantilla, **en el orden de
  `items[]`** del cuerpo (calentamiento incluido, en su sitio). Un medido
  (`prescription` de row/ski/bike/run): uno. Un cronómetro funcional sin
  movimientos: `[]` (sus tramos van sin id).
- Los ids son strings, como `assignment_id`.
- Editar (`assignment_id` en el cuerpo) sustituye los segmentos: **los ids cambian**
  y vuelven en la respuesta. Un plan ya ejecutado no se edita (409).

Con eso la app arranca el libre como una asignación normal: cada `WorkoutSegment`
lleva su `templateSegmentId`, y al terminar va por el punto 1.

## 3. Libre hecho sin plan previo (sin conexión al empezar) → `POST /free`

Solo cuando no se pudo crear el plan antes de empezar. Cuerpo de hoy
(`FreeWorkoutPayload`) más:

| Campo | Dónde | Qué |
|---|---|---|
| `assignment_id` | raíz, opcional | Si el entreno era un plan que ya existe (propio o del coach), su id: se graba sobre él por el camino del coach y no se crea nada. Preferir el punto 1. |
| `item_index` | cada tramo | Índice 0-based del ítem de `items[]` que produjo el tramo. Un medido o un cronómetro: `0`. Un bloque plegado (WOD, EMOM alterno en un solo tramo): el del primer movimiento. Un tramo sin ítem (el paso manual «Calentamiento» vacío): omitirlo. |
| `pain_area`, `pain_note`, `perceived_difficulty` | raíz | Igual que la sincronización del coach (ya se admitían; `FreeWorkoutPayload` no los manda todavía). |

- Si **algún** tramo trae `item_index`, el servidor usa solo eso (un tramo sin él
  queda sin enlazar). Si **ninguno** lo trae (la app instalada), lo infiere por orden.
- `source_workout_ref` (el UUID del entreno en Salud) sigue igual: con él, y con el
  solape de horas, el servidor sustituye la copia plana que Salud haya subido antes.
- `started_at` es la llave de idempotencia: reenviar el mismo entreno (cola,
  REINTENTAR, reloj) graba sobre la misma asignación y funde lo nuevo. Tiene que ser
  el inicio que sella el motor, idéntico en todos los reenvíos, con el mismo
  `title`. Otro título con el mismo inicio se trata como otro entreno y se guarda
  fuera del plan: un inicio nuevo por entreno, siempre.

Respuesta (la misma forma que la sincronización del coach, más `origin`):

```json
{
  "saved": true,
  "assignment_id": "813",
  "execution_id": "2701",
  "segments_saved": 2,
  "segments_dropped": 0,
  "prs": [],
  "off_plan": false,
  "origin": "self"
}
```

- `off_plan: true` y `assignment_id: null`: el plan del cuerpo no casaba (esquema no
  admitido, más de 12 ejercicios, un ejercicio que ya no está…). El entreno **está
  guardado** (fuera del plan, el coach lo ve). Es 2xx: se trata como guardado.
- Un título de más de 80 caracteres se recorta; ya no es un 422.
- `segments_dropped`: tramos que se cayeron por no tener identidad (posición ≥ 0,
  modalidad). Es un fallo del cliente; el resto se guardó.

Errores que quedan: 401 (sin sesión), 400 (el cuerpo no es un objeto JSON), 404
(un «hecha» sin trabajo sobre una sesión que ya no está: recargar) y 422 solo cuando
no hay ni un plan válido ni trabajo que guardar (nada que perder).

## 4. La sincronización del coach

`POST /api/sync/workout-execution` añade `segments_dropped` a su respuesta. Nada más
cambia en su contrato.

## Qué hace el servidor con lo que ya estaba guardado (0274)

Enlaza los tramos antiguos de los libres a su segmento. Pasa a su plan un libre que
se ejecutó como copia, cuando hay evidencia. Pone en `run` los tramos de cinta. Borra
las copias de Salud duplicadas. La app no tiene que reenviar nada.

# iOS · un libre y uno del coach son el mismo objeto — y el motor, formato a formato

Decisión: `docs/DECISIONS.md` 2026-09-28. Contrato del guardado del libre (servidor):
`docs/pr/un-solo-entreno.md` (lo publica la sesión de guardado).

## Qué cambia en la app

| Pieza | Antes | Ahora |
|---|---|---|
| Libre guardado en el Plan | se abría con un contexto de libre encima y se guardaba por `POST /free` → otra plantilla + otra ejecución: sesión duplicada | se corre y se guarda como la asignación que es (`/api/sync/workout-execution`), con sus `template_segment_id` |
| Libre creado en el momento, con conexión | plan montado a mano en el móvil; `POST /free` al final | al pulsar EMPEZAR, `POST /free/plan` en segundo plano; con la respuesta la sesión es una asignación normal y se guarda por el camino del coach; cada tramo se enlaza por su `itemIndex` en el orden devuelto |
| Libre sin conexión | `POST /free` sin enlace de tramos | `POST /free` al final con `item_index` en cada tramo |
| Descartar un libre ya guardado como plan | — | se borra el plan creado al empezar (`plan/session/delete`) |
| Vivo del libre | constructores que copiaban `WorkoutPlan.from` a mano | `FreePlanDetail` construye el detalle que devolverá el servidor y el vivo sale de `WorkoutPlan.from(detail:)` |
| Editar un libre | hidratación con pérdidas; tipo por el primer ejercicio | sin pérdidas (prueba de ida y vuelta por formato); tipo por `workout.modality` |
| Bloque continuo con varias máquinas | un tramo con la máquina del primero y la duración del más largo | un tramo por ejercicio, cada uno con su máquina; dura la suma |
| HYROX por bloques (16 bloques `hyrox_sim`) | 15 puertas «Arrancar bloque» y sin tiempo final | una ruta de estaciones con crono acumulado; tiempo final capturado |
| Parciales de una ruta | una vuelta por bloque con el ritmo mezclado | un lap por estación (su ejercicio, su máquina, su tiempo, sus metros) |
| Tabata / Death By / intervalos sin máquina | cara por rondas congelada en «Ronda 1/N»; una fila tocada cerraba el bloque | cara del reloj del motor: ronda, cuenta atrás de fase, reps, objetivo del minuto |
| BikeErg | /500m, s/min, «sin remar» | /1000m, rpm, «sin pedalear»; calorías visibles en todo ergo |
| RPE / RIR por serie | solo en «ajustar serie» (0 de 94 series reales) | un toque en el descanso, en la escala que prescribió el coach |
| Cadencia de carrera | nunca | media del podómetro del móvil por lap / pierna / estación |
| «Guardar para luego» de un libre | la respuesta se decodificaba con `assignment_id` bajo `convertFromSnakeCase` → error SIEMPRE tras un guardado bueno (vibración de error, sin cerrar, y un segundo toque duplicaba el plan) | decodifica `assignmentId` (`FreePlanBinding`): guarda y cierra |

## Lo que el servidor tiene que hacer (no inventado aquí)

> **Hecho en el servidor (2026-09-28):** los puntos 1, 3, 4 y 5. La ronda llega en base
> 0 y se GUARDA + 1 (0155 reserva el 0 para «no se repite»); `execution.segments[]` la
> devuelve ya en la escala de la base (`round_index` 0 = no se repite, N ≥ 1 = ronda N).
> Ver DECISIONS 2026-09-28 «El servidor cierra el contrato del motor por formato».

1. **`round_index` en los tramos.** La app manda `round_index` (base 0) en cada tramo
   que es un bout: la ronda exterior de una ruta de estaciones, el minuto de un EMOM,
   la serie de un interválico. `segment_executions.round_index` existe (0155), pero
   `segmentInputSchema` (`web/lib/sync/segment-input-schema.ts`) no lo lee y zod lo
   descarta. Falta: `round_index: num()` en el esquema y en el `insert` de
   `ingest-execution-segments.ts`. El `on conflict (execution_id, position,
   round_index)` no necesita cambios: con bouts la app ya manda `position` único.
2. **`item_index` en `POST /free`.** La app lo manda en cada tramo (base 0 sobre
   `items[]`; en medido y cronómetro, 0). Contrato ya cerrado por el orquestador; esto
   solo confirma que iOS lo envía desde este cambio.
3. **`POST /free/plan` devuelve los segmentos.** iOS decodifica
   `{ assignment_id, segments: [{ id, position, block_position }] }` (acepta `id`
   entero o texto, y también `segment_ids: [..]`) y enlaza por el ÍNDICE de ese
   orden (`order by position, id`), nunca por el valor de `position`. Sin
   `segments` en la respuesta, la sesión se guarda por el camino del coach igual,
   pero sus tramos van sin `template_segment_id`.
4. **La modalidad del libre, guardada y servida.** La app manda `modality` en
   `/free/plan` y en `/free`; el servidor no la guarda. Falta: escribirla en
   `templates.meta_json.modality` en `create-free-workout.ts` (crear y actualizar) y
   exponerla en el detalle como `workout.modality`. Es lo que decide con qué
   constructor se edita un libre (un WOD que empieza remando no es un «remo»).
   Mientras no esté, iOS lo deduce del plan entero, no del primer ejercicio.
5. **Una ruta ya no manda la fila agregada del bloque.** Una ruta de estaciones (For
   Time / simulacro con varios movimientos) llega como una fila por estación con
   `leg_index` / `leg_role: work` / `leg_phase: main`, su `template_segment_id` y su
   modalidad. La puntuación del bloque sigue en la ejecución (`score_time_s`). Quien
   leyera «una fila por bloque» para una ruta tiene que sumar sus estaciones.

Nada de esto rompe con un servidor viejo: los campos nuevos se ignoran y el
guardado sigue entrando.

## Lo que NO se hizo

- El cronómetro pelado (funcional sin movimientos) se sigue guardando al final por
  `POST /free`: su plan no existe hasta que el atleta dice qué hizo en el resumen.
- Parciales por RONDA de una lista homogénea (10 × 250 m SkiErg): la ventana del
  aparato no se reancla por ronda, así que no hay metros honestos por ronda.
- La pantalla en vivo no se ha rediseñado: solo lo necesario para que cada formato
  enseñe su dato.
- El reloj (SetTableLiveView, finalize, AMRAP `score_reps`, plan vacío) lo lleva
  otra sesión.

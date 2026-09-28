# Lectores: un libre y uno del coach cuentan y se ven igual (2026-09-28)

Para la sesión de iOS. Todo lo de abajo es **aditivo**: la app instalada sigue
decodificando igual (campos nuevos que ignora; nada cambia de tipo ni desaparece).
Lo que la app tiene que hacer para pintarlo está en «Qué pinta iOS».

## 1. `execution.segments[]` — series serie a serie y volumen

En `GET /api/athlete/assignments/{id}/detail` (y en el nuevo detalle por ejecución,
§3), cada tramo de `execution.segments[]` (`SegmentActualDTO`) trae dos campos nuevos:

| campo | tipo | qué es |
|---|---|---|
| `sets` | array, siempre presente (`[]` si el tramo no se registró por series) | las series del tramo (`set_executions`), en orden de `set_index` |
| `volume_kg` | number \| null | tonelaje del tramo: Σ reps × kg de las series hechas (`done` o `scaled`; `skipped` no suma). Sin series, reps × kg de la línea única. Null si no hay carga (peso corporal, carrera) |

Cada elemento de `sets`:

| campo | tipo | notas |
|---|---|---|
| `set_index` | int | base 1 |
| `status` | `"done"` \| `"scaled"` \| `"skipped"` | una saltada se enseña apagada, no suma |
| `reps` | int \| null | reps hechas |
| `kg` | number \| null | carga usada |
| `reps_prescribed` | int \| null | lo pedido |
| `kg_prescribed` | number \| null | lo pedido |
| `rpe` | number \| null | 0–10, admite medio punto |
| `rir` | number \| null | 0–10, admite medio punto |
| `tempo` | string \| null | «3-1-1-0» |
| `rest_s` | int \| null | descanso tras la serie |

Con `sets` no vacío, `reps_completed` / `weight_used_kg` del tramo son un resumen
ambiguo (reps nulas y la carga de la última serie: la ejecución 138 servía
«reps null, 120 kg» para 5×100 · 5×110 · 3×115 · 3×120). La web del coach ya no
los enseña en ese caso: enseña «N series · X kg vol.» y la tabla de series.

**Parciales del PM5:** ya viajaban en este mismo DTO (`segments[].erg_splits`,
`drag_factor`, `avg_calories_per_hour`, `peak_drive_force_lbs`,
`avg_drive_force_lbs`) y `SegmentActualDTO` ya los decodifica
(`ErgSplitActual`). Comprobado en producción: los enteros (`stroke_rate_spm`,
`avg_power_w`, `calories`, `calories_per_hour`, `drag_factor`, `avg_hr`) llegan
enteros. Nada que cambiar en el contrato.

## 2. `GET /api/athlete/history?month=YYYY-MM[&include_unplanned=1]`

- **Sin el parámetro:** la respuesta de siempre (solo sesiones con asignación)
  más los campos nuevos de cada fila.
- **Con `include_unplanned=1`:** además, lo hecho SIN asignación — importaciones
  de Apple Salud que no casaron con un hueco del plan y entrenos guardados «fuera
  del plan» (0270). Para esas filas `assignment_id` es **null**: por eso es
  opt-in (la app instalada lo decodifica como `String` obligatorio). Atleta 64
  desde el 1-ago: 70 filas sin el parámetro, 133 con él (= lo que cuenta la carga).

Campos nuevos por fila (`sessions[]`):

| campo | tipo | qué es |
|---|---|---|
| `execution_id` | string, siempre | abre el detalle por ejecución (§3) |
| `assignment_id` | string \| **null** (null solo con `include_unplanned`) | abre el detalle de siempre |
| `score_rounds`, `score_reps` | int \| null | AMRAP; `score_time_s` ya estaba |
| `distance_m` | int \| null | distancia de la sesión (null si nada midió distancia o si dos modalidades lo hicieron) |
| `modality` | `run`\|`row`\|`ski`\|`bike`\|`strength`\|`other` \| null | lo que MÁS se hizo (por tiempo, luego metros); null sin tramos |
| `origin` | `coach` \| `self` \| **null** | null = sin asignación |
| `recorded_via` | `live` \| `manual` \| `imported` \| null | cómo llegó el registro |
| `off_plan_reason` | `assignment_gone` \| `not_own_assignment` \| `no_assignment` \| null | por qué no tiene asignación |

`title` de una fila sin plantilla: el nombre de lo que más se hizo («Carrera»,
«Remo», «Ski», «Bici», «Fuerza», «Entreno»).

Cambio de semántica (también sin el parámetro): **`is_rest` sale solo del plan
del coach.** Un libre (montado o hecho) ya no convierte los demás días de su
semana en «descanso», y una semana con solo libres no es una semana planificada.

## 3. Nuevo: `GET /api/athlete/executions/{id}/detail`

Abre un entreno hecho por su **ejecución**. Misma respuesta que
`/api/athlete/assignments/{id}/detail` con tres diferencias:

- `assignment`: **null** cuando la ejecución no tiene asignación (y `workout`
  también null: no hay prescripción que enseñar). Con asignación, es idéntica a
  abrirla por la asignación.
- `execution_id` (string) arriba.
- `off_plan_reason` (como en §2) arriba.

`execution` (con `segments[]`, `sets`, `trace`…) y `run_compliance` (vacío y
declarado sin prescripción) tienen la forma de siempre. Bearer del atleta; una
ejecución ajena o inexistente es 404.

## Qué pinta iOS (no hecho aquí: iOS es de otra sesión)

1. Detalle de una sesión hecha: tabla de series por tramo (reps/kg con lo pedido
   al lado, RPE, RIR, tempo, descanso; la saltada apagada) y el volumen del tramo.
2. Historial: pedir `include_unplanned=1`, decodificar `assignment_id` como
   opcional y abrir por `execution_id` cuando no hay asignación. Pintar
   `modality`, `distance_m` y el resultado AMRAP (`score_rounds` + `score_reps`).
3. `AthleteHistorySession.id` hoy es `assignmentId`: pasa a `executionId` (único
   y siempre presente).

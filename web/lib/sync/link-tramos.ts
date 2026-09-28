// A QUÉ SEGMENTO DE SU PLANTILLA PERTENECE CADA TRAMO de un entreno libre.
//
// Un entreno libre y uno del coach son EL MISMO objeto (DECISIONS 2026-09-28): una
// plantilla, sus segmentos, una asignación y una ejecución cuyos tramos cuelgan de
// esos segmentos. Del segmento sale lo que la analítica necesita del tramo —el
// ejercicio, la prescripción de ese momento, el formato del bloque— y la modalidad
// (0053). Un tramo sin segmento no dice qué ejercicio fue: no entra en la fuerza por
// ejercicio, ni en el rendimiento que ve el coach, ni en el cumplimiento de series.
//
// En el camino del coach el cliente manda el `template_segment_id` de cada tramo:
// lo leyó del detalle de la sesión. En POST /api/athlete/workouts/free la plantilla
// nace en la MISMA petición, así que el cliente no puede conocer esos ids. Aquí se
// enlazan, por ORDEN de los segmentos (nunca por el valor de `position`, que es de
// quien escribe la plantilla):
//   · el cliente dice de qué ítem es cada tramo (`item_index`, 0-based en `items[]`):
//     se usa eso, y un tramo sin él se queda sin enlazar;
//   · un cliente que no lo dice (el que ya está instalado) se infiere, y la misma
//     regla escribe la migración 0274 para lo ya guardado:
//       1. una plantilla de UN segmento: todos sus tramos son de él;
//       2. un tramo que no es una serie de carrera/EMOM lleva de `position` el orden
//          1-based de su ítem (así numera la app sus segmentos), si la modalidad
//          no lo contradice;
//       3. una serie (con atribución de tramo) es del ÚNICO ítem de su modalidad;
//       4. si nada de eso es inequívoco, sin enlazar: mejor sin ejercicio que con
//          uno que no fue.
// Un `template_segment_id` que ya traiga el tramo se respeta solo si es de ESTA
// plantilla; si es de otra (el tramo de un plan distinto), se enlaza como si no lo
// trajera. La ingesta, además, rechaza todo segmento que no sea de la plantilla de
// la asignación de su ejecución.

import type { Sql, TransactionClient } from '@/lib/db';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import { sanitizeNonNegativeInt, sanitizePositiveInt } from '@/lib/sync/sanitize-measurement';
import { legAttribution, segmentModalityOfExercise, tramoModality } from '@/lib/sync/segment-derivations';
import type { SegmentInput } from '@/lib/sync/segment-input-schema';
import type { ExecutionMetricsInput } from '@/lib/sync/record-workout-execution';

/** Un segmento de la plantilla, en su orden: su id y la modalidad de su ejercicio. */
export interface TemplateItem {
  id: number;
  modality: SegmentModality;
}

/** Un segmento tal como lo lee la base: el ítem más dónde está (lo que devuelve /free/plan). */
export interface AssignmentSegment extends TemplateItem {
  position: number;
  blockPosition: number;
}

/** ¿Puede un tramo con esta modalidad ser de este ítem? `other` es la del bloque plegado. */
function compatible(seg: SegmentInput, item: TemplateItem): boolean {
  const wire = tramoModality({ wire: seg.modality, source: seg.source, exercise: null });
  return wire === 'other' || wire === item.modality;
}

/** La inferencia para un cliente que no dice de qué ítem es cada tramo (ver cabecera). */
function inferItem(seg: SegmentInput, items: TemplateItem[]): TemplateItem | null {
  if (items.length === 1) return items[0]!;
  if (legAttribution(seg).index == null) {
    const item = items[seg.position - 1];
    return item && compatible(seg, item) ? item : null;
  }
  const wire = tramoModality({ wire: seg.modality, source: seg.source, exercise: null });
  const same = items.filter((it) => it.modality === wire);
  return same.length === 1 ? same[0]! : null;
}

/**
 * Los tramos con su `template_segment_id` puesto, según la cabecera. Puro: los
 * `items` son los segmentos de la plantilla EN ORDEN.
 */
export function linkTramos(segments: SegmentInput[], items: TemplateItem[]): SegmentInput[] {
  if (items.length === 0) return segments;
  const own = new Set(items.map((it) => it.id));
  const explicit = segments.some((s) => sanitizeNonNegativeInt(s.item_index) != null);
  return segments.map((seg) => {
    const sent = sanitizePositiveInt(seg.template_segment_id);
    if (sent != null && own.has(sent)) return seg;
    const index = sanitizeNonNegativeInt(seg.item_index);
    const item = explicit ? (index != null ? (items[index] ?? null) : null) : inferItem(seg, items);
    return { ...seg, template_segment_id: item ? item.id : null };
  });
}

/**
 * Los segmentos de la plantilla de una asignación DEL ATLETA, en orden
 * (`position`, y el id para desempatar). Para enlazar, el orden es lo único que
 * se lee de `position`; su valor y el `block_position` solo viajan en la respuesta
 * de /free/plan. Una asignación de otro atleta no devuelve nada.
 */
export async function loadAssignmentItems(
  sql: Sql | TransactionClient,
  athleteId: number,
  assignmentId: number,
): Promise<AssignmentSegment[]> {
  // tenancy: athlete-session
  const rows = await sql<
    Array<{ id: string; modality: string | null; position: number; block_position: number }>
  >`
    select ts.id::text as id, e.modality, ts.position, ts.block_position
    from workout_assignments wa
    join template_segments ts on ts.template_id = wa.template_id
    join exercises e on e.id = ts.exercise_id
    where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
    order by ts.position, ts.id
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    modality: segmentModalityOfExercise(r.modality),
    position: Number(r.position),
    blockPosition: Number(r.block_position),
  }));
}

/** El cuerpo de un guardado con sus tramos enlazados a la plantilla de `assignmentId`. */
export async function linkTramosToAssignment(
  sql: Sql | TransactionClient,
  athleteId: number,
  assignmentId: number,
  input: ExecutionMetricsInput,
): Promise<ExecutionMetricsInput> {
  if (!input.segments || input.segments.length === 0) return input;
  const items = await loadAssignmentItems(sql, athleteId, assignmentId);
  return { ...input, segments: linkTramos(input.segments, items) };
}

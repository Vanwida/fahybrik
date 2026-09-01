import 'server-only';

// De qué VA una sesión, en una línea — para cuando hay muchas y no cabe el detalle.
//
// El plan de una semana son siete días con sus sesiones, y un título («Fuerza A»)
// no dice si eso son series de 1000 o sentadillas. Sin contenido, el asistente
// tiene que pedir el detalle de todas para contestar «¿qué le toca el jueves?».
// Con estas líneas contesta de una y solo pide el detalle de la que importa.
//
// UNA CONSULTA PARA TODAS. Cargar el detalle de cada asignación serían seis
// consultas por sesión (perfiles de zona, 1RM, plantilla, segmentos, ejecución,
// tramos) — diez sesiones y son sesenta viajes para pintar un resumen. Aquí se
// leen los segmentos de todas las asignaciones a la vez y se agrupan en memoria.
//
// LA GRAFÍA NO NACE AQUÍ. La dosis se escribe con los formateadores canónicos
// (`prescriptionToText` para la prescripción estructurada,
// `formatBlockExerciseParams` para las líneas viejas que solo tienen escalares),
// así que una serie se lee igual en el conector, en el panel y en el móvil. Una
// línea sin dosis legible sale con el nombre del ejercicio a secas: es lo que hay.

import type { Sql } from '@/lib/db';
import {
  safeParsePrescription,
  prescriptionToText,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { formatBlockExerciseParams } from '@/lib/dashboard/coach/block-exercise-format';
import { joinCoachOverride } from '@/lib/exercises/coach-override';

/** Cuántas líneas de contenido lleva un resumen antes de contar el resto. */
export const CONTENT_SUMMARY_MAX_LINES = 4;

export interface SessionContentSummary {
  /** Cuántas piezas tiene la sesión (block_position distintos). */
  block_count: number;
  /** Cuántas líneas prescritas en total. */
  exercise_count: number;
  /** Las primeras líneas, ya legibles: «Carrera 4×1000m @ 4:00-4:10/km · r2'». */
  lines: string[];
  /** Cuántas líneas quedaron fuera de `lines`. 0 = están todas. */
  more: number;
}

/**
 * Resumen de contenido de varias asignaciones a la vez, indexado por
 * `assignment_id` (string, como viaja en el resto del contrato).
 *
 * Las asignaciones se leen scoped al atleta: quien llame ya ha resuelto que ese
 * atleta es del coach, y esto no puede ser la rendija por la que se lea la sesión
 * de otro. El nombre del ejercicio es el MERGED (el override del coach si renombró
 * la base), que es el único nombre que él reconoce.
 *
 * Una asignación sin plantilla, o con una plantilla sin ejercicios, simplemente no
 * aparece en el mapa: no hay contenido que resumir y fabricar un «0 ejercicios»
 * haría que el lector lo pintara como si lo hubiera.
 */
export async function loadSessionContentSummaries(params: {
  sql: Sql;
  coach_id: number | bigint;
  athlete_id: number;
  assignment_ids: readonly string[];
  max_lines?: number;
}): Promise<Map<string, SessionContentSummary>> {
  const out = new Map<string, SessionContentSummary>();
  if (params.assignment_ids.length === 0) return out;

  const ids = params.assignment_ids.map((id) => Number(id)).filter(Number.isFinite);
  if (ids.length === 0) return out;

  const maxLines = params.max_lines ?? CONTENT_SUMMARY_MAX_LINES;
  const client = params.sql;

  const rows = await client<
    Array<{
      assignment_id: string;
      block_position: number;
      exercise_name: string;
      params_json: Record<string, unknown> | null;
      prescription_json: unknown;
    }>
  >`
    select
      wa.id::text                    as assignment_id,
      ts.block_position              as block_position,
      coalesce(ceo.name, e.name)     as exercise_name,
      ts.params_json                 as params_json,
      ts.prescription_json           as prescription_json
    from workout_assignments wa
    join template_segments ts on ts.template_id = wa.template_id
    join exercises e on e.id = ts.exercise_id
    ${joinCoachOverride(client, params.coach_id)}
    where wa.id = any(${ids}::bigint[])
      and wa.athlete_id = ${params.athlete_id}
    order by wa.id asc, ts.block_position asc, ts.position asc, ts.id asc
  `;

  const blocksBySession = new Map<string, Set<number>>();
  for (const r of rows) {
    const summary =
      out.get(r.assignment_id) ??
      ({ block_count: 0, exercise_count: 0, lines: [], more: 0 } as SessionContentSummary);
    summary.exercise_count += 1;
    if (summary.lines.length < maxLines) summary.lines.push(contentLine(r.exercise_name, r));
    else summary.more += 1;
    out.set(r.assignment_id, summary);

    const blocks = blocksBySession.get(r.assignment_id) ?? new Set<number>();
    blocks.add(r.block_position);
    blocksBySession.set(r.assignment_id, blocks);
  }
  for (const [id, blocks] of blocksBySession) out.get(id)!.block_count = blocks.size;

  return out;
}

/** «Ejercicio + dosis», o el ejercicio solo cuando no hay dosis que leer. */
export function contentLine(
  exercise_name: string,
  line: { params_json: Record<string, unknown> | null; prescription_json: unknown },
): string {
  const dose = doseText(line);
  return dose ? `${exercise_name} ${dose}` : exercise_name;
}

/**
 * La dosis de una línea, en el castellano del dominio. La prescripción
 * estructurada manda; una línea vieja que solo tiene escalares degrada a su
 * resumen de parámetros. Null cuando no dice cuánto trabajo hacer — y eso se
 * enseña como lo que es (un hueco), nunca como un cero.
 */
export function doseText(line: {
  /** `object` y no `Record<string, unknown>`: los params tipados del cargador de
   *  la asignación son una interfaz, y una interfaz no encaja en un Record. */
  params_json?: object | null;
  prescription_json?: unknown;
  reps_scheme?: string | null;
}): string | null {
  const parsed =
    line.prescription_json != null ? safeParsePrescription(line.prescription_json) : null;
  if (parsed?.success) {
    const text = prescriptionToText(parsed.data as Prescription).trim();
    if (text) return text;
  }
  const fallback = formatBlockExerciseParams(
    (line.params_json ?? {}) as Record<string, unknown>,
    line.reps_scheme ?? null,
  ).trim();
  return fallback || null;
}

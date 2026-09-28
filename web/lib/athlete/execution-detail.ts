// EL DETALLE DE UN ENTRENO HECHO, POR SU EJECUCIÓN.
//
// Powers GET /api/athlete/executions/[id]/detail. Existe porque hay trabajo hecho
// que NO tiene asignación — una importación de Apple Salud que no casó con ningún
// hueco del plan (0191/0192) o un entreno guardado «fuera del plan» (0270) — y el
// único detalle que había (`/api/athlete/assignments/[id]/detail`) se abre por la
// asignación. Sin esto, el historial podía listar ese entreno pero no abrirlo.
//
// UNA SOLA FORMA. Es la MISMA respuesta que el detalle por asignación
// (`AssignmentDetailResponse`), con dos diferencias declaradas:
//   · `assignment` es null cuando la ejecución no tiene asignación (y `workout`
//     también: sin asignación no hay plantilla que enseñar como «prescrito»);
//   · `execution_id` y `off_plan_reason` viajan arriba.
// Con asignación, delega en `loadAssignmentDetail` tal cual: abrir un entreno por
// su ejecución o por su asignación da exactamente lo mismo.
//
// PROPIEDAD en el WHERE (`athlete_id` de la sesión): una ejecución ajena responde
// igual que una inexistente (null → 404), sin filtrar que existe.

import type { Sql } from '@/lib/db';
import { loadAthleteZoneProfilesForAthlete } from '@/lib/dashboard/v2/zone-profile';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import {
  buildExecutionBlock,
  loadAssignmentDetail,
  loadExecutionParts,
  loadExecutionRow,
  type AssignmentDetailResponse,
} from '@/lib/athlete/assignment-detail';

/** Por qué una ejecución no tiene asignación (CHECK de 0270), o null. */
export type OffPlanReason = 'assignment_gone' | 'not_own_assignment' | 'no_assignment';

export type ExecutionDetailResponse = Omit<AssignmentDetailResponse, 'assignment'> & {
  /** La sesión del plan a la que pertenece; null si no tiene (importación o fuera del plan). */
  assignment: AssignmentDetailResponse['assignment'] | null;
  execution_id: string;
  off_plan_reason: OffPlanReason | null;
};

const OFF_PLAN_REASONS: ReadonlySet<string> = new Set<OffPlanReason>([
  'assignment_gone',
  'not_own_assignment',
  'no_assignment',
]);

export async function loadExecutionDetail(params: {
  sql: Sql;
  athlete_id: bigint;
  execution_id: bigint;
  self_user_id?: bigint;
  gradient_retires_pace_pct?: number | null;
}): Promise<ExecutionDetailResponse | null> {
  const { sql, athlete_id, execution_id } = params;

  // tenancy: athlete-session — athlete_id sale del bearer; la ejecución se filtra por él.
  const heads = await sql<Array<{ assignment_id: string | null; off_plan_reason: string | null }>>`
    select assignment_id::text as assignment_id, off_plan_reason
    from workout_executions
    where id = ${execution_id as unknown as number}
      and athlete_id = ${athlete_id as unknown as number}
    limit 1
  `;
  const head = heads[0];
  if (!head) return null;
  const off_plan_reason =
    head.off_plan_reason != null && OFF_PLAN_REASONS.has(head.off_plan_reason)
      ? (head.off_plan_reason as OffPlanReason)
      : null;

  if (head.assignment_id != null) {
    const detail = await loadAssignmentDetail({
      sql,
      athlete_id,
      assignment_id: BigInt(head.assignment_id),
      self_user_id: params.self_user_id,
      gradient_retires_pace_pct: params.gradient_retires_pace_pct,
    });
    if (!detail) return null;
    return { ...detail, execution_id: String(execution_id), off_plan_reason };
  }

  const [execution, zoneProfiles] = await Promise.all([
    loadExecutionRow(sql, { execution_id, athlete_id }),
    loadAthleteZoneProfilesForAthlete({ athlete_id, client: sql }),
  ]);
  if (!execution) return null;
  const { segments, trace } = await loadExecutionParts({ sql, execution, zoneProfiles });
  // Sin asignación no hay estado de plan: existe porque se hizo.
  const block = buildExecutionBlock('completed', execution, segments, trace);

  return {
    assignment: null,
    workout: null,
    execution: block,
    // Sin prescripción no hay nada contra qué juzgar: resúmenes vacíos y
    // declarados, nunca un veredicto inventado (el mismo camino que un día sin
    // plantilla en el detalle por asignación).
    run_compliance: buildRunCompliance(null, segments, {
      gradient_retires_pace_pct: params.gradient_retires_pace_pct ?? null,
    }),
    execution_id: String(execution_id),
    off_plan_reason,
  };
}

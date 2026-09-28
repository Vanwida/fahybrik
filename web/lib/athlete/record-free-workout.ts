import 'server-only';

// GUARDAR UN ENTRENO LIBRE HECHO — POST /api/athlete/workouts/free.
//
// Un libre y una sesión del coach son EL MISMO objeto y se guardan igual
// (DECISIONS 2026-09-28). Tres casos, en este orden:
//
//   1. El cuerpo nombra una asignación (`assignment_id`): el atleta ejecutó un plan
//      que ya existe —suyo o de su coach—. Se graba sobre ella por el MISMO camino
//      que la sincronización del coach (`recordAthleteWorkout`), sin crear nada. Si
//      es un plan propio y los tramos no traen el id de su segmento, se enlazan por
//      orden (`link-tramos.ts`). Si ya no existe o no es suya, las reglas de 0270.
//   2. Sin asignación y con un plan que casa (título, modalidad, prescripción,
//      ejercicios del catálogo): nace la plantilla + asignación propia y se graba la
//      ejecución en la misma transacción, con cada tramo enlazado a su segmento
//      (`createFreeWorkout`). Así llega el libre hecho sin plan previo (sin conexión
//      al empezar).
//   3. Lo que no casa con un plan (esquema no admitido, más de 12 ejercicios, un
//      ejercicio que ya no está…) NO se rechaza si trae trabajo: se guarda «fuera
//      del plan» (0270, `no_assignment`), y la ruta lo avisa en el servidor. Solo un
//      cuerpo sin plan que valga Y sin trabajo vuelve con 4xx: no hay nada que perder.

import { z } from 'zod';

import { sql as defaultSql, type Sql } from '@/lib/db';
import type { RunningPR } from '@fahybrid/shared/domain/running/best-efforts';
import {
  carriesWorkEvidence,
  recordAthleteWorkout,
  recordOffPlanExecution,
  wireAssignmentId,
} from '@/lib/sync/record-athlete-workout';
import type { ExecutionMetricsInput } from '@/lib/sync/record-workout-execution';
import { linkTramosToAssignment } from '@/lib/sync/link-tramos';
import { captureRouteError } from '@/lib/observability/capture';
import {
  createFreeWorkout,
  FreeWorkoutError,
  type SaveFreeWorkoutPlanInput,
} from '@/lib/athlete/create-free-workout';
import {
  validateFreeWorkout,
  FREE_WORKOUT_MODALITIES,
  type FreeWorkoutModality,
  type FreeWorkoutPlan,
} from '@/lib/athlete/free-workout-validate';

/** El título de una plantilla libre: lo que cabe en la lista del plan. */
export const FREE_TITLE_MAX = 80;

/** Un ítem del cuerpo tal como llega (la prescripción la valida `validateFreeWorkout`). */
export const freeWorkoutItemWireSchema = z.object({
  exercise_id: z.number().int().positive(),
  prescription: z.unknown(),
  // "warmup" marca los ejercicios del calentamiento opcional; ausente = principal.
  part: z.enum(['warmup']).optional(),
});

export const freeWorkoutModalitySchema = z.enum(
  FREE_WORKOUT_MODALITIES as unknown as [FreeWorkoutModality, ...FreeWorkoutModality[]],
);

/** La parte «plan» del cuerpo de /free: todo lo que no es la ejecución. */
const freePlanWireSchema = z.object({
  title: z.string(),
  modality: freeWorkoutModalitySchema,
  prescription: z.unknown().optional(),
  items: z.array(freeWorkoutItemWireSchema).optional(),
});

export type FreePlanRead =
  | { ok: true; title: string; plan: FreeWorkoutPlan }
  | { ok: false; code: string; message: string; details?: unknown };

/**
 * El plan que describe el cuerpo de un libre HECHO. Un título largo se recorta (es
 * el nombre de la fila, no motivo para perder la estructura); lo demás lo decide
 * `validateFreeWorkout`, el mismo validador que el de guardar un plan.
 */
export function readFreePlan(raw: unknown): FreePlanRead {
  const parsed = freePlanWireSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_body', message: 'Invalid request body', details: parsed.error.flatten() };
  }
  const title = parsed.data.title.trim().slice(0, FREE_TITLE_MAX).trim();
  if (title.length === 0) return { ok: false, code: 'title_required', message: 'A free workout needs a title' };
  const validation = validateFreeWorkout({
    modality: parsed.data.modality,
    prescription: parsed.data.prescription,
    ...(parsed.data.items !== undefined ? { items: parsed.data.items } : {}),
  });
  if (!validation.ok) return validation;
  return { ok: true, title, plan: validation.plan };
}

type PlanBase = Omit<SaveFreeWorkoutPlanInput, 'kind' | 'modality' | 'prescription' | 'items' | 'scheme'>;

/** Un plan validado en la forma que persiste `create-free-workout.ts`. */
export function freePlanInput(base: PlanBase, plan: FreeWorkoutPlan): SaveFreeWorkoutPlanInput {
  if (plan.kind === 'measured') {
    return { ...base, scheme: plan.scheme, kind: 'measured', modality: plan.modality, prescription: plan.prescription };
  }
  if (plan.kind === 'clock') {
    return { ...base, scheme: plan.scheme, kind: 'clock', prescription: plan.prescription };
  }
  return {
    ...base,
    scheme: plan.scheme,
    kind: 'items',
    items: plan.items.map((it) => ({
      exerciseId: it.exercise_id,
      prescription: it.prescription,
      ...(it.part ? { part: it.part } : {}),
    })),
  };
}

export type FreeWorkoutResult =
  | {
      ok: true;
      off_plan: false;
      assignment_id: string;
      execution_id: string;
      segments_saved: number;
      prs: RunningPR[];
    }
  | { ok: true; off_plan: true; execution_id: string; segments_saved: number; prs: RunningPR[] }
  /** «Marcar como hecha» sin trabajo sobre una sesión que ya no está (0270): la app recarga. */
  | { ok: false; reason: 'not_found' }
  /** Ni un plan que valga ni trabajo que guardar. */
  | { ok: false; reason: 'nothing_to_save'; code: string; message: string; details?: unknown };

/**
 * Los tramos de un guardado sobre un plan PROPIO (origin self), enlazados a su
 * plantilla si no traen el id de su segmento. Sobre una sesión del coach el
 * cliente ya lo manda (lo leyó del detalle); y sobre la de otro atleta, nada.
 */
async function linkToOwnSelfPlan(
  db: Sql,
  athleteId: number,
  assignmentId: number,
  input: ExecutionMetricsInput,
): Promise<ExecutionMetricsInput> {
  const own = await db<Array<{ id: string }>>`
    select id::text as id from workout_assignments
    where id = ${assignmentId} and athlete_id = ${athleteId} and origin = 'self'
    limit 1
  `;
  return own[0] ? linkTramosToAssignment(db, assignmentId, input) : input;
}

/** Guarda un entreno libre hecho. Ver la cabecera del fichero. */
export async function recordFreeWorkout(args: {
  athleteId: number;
  coachId: number | null;
  body: Record<string, unknown>;
  metrics: ExecutionMetricsInput;
  sql?: Sql;
}): Promise<FreeWorkoutResult> {
  const db = args.sql ?? defaultSql;
  const { athleteId, metrics } = args;

  // 1. Un plan que ya existe: el mismo camino que la sesión del coach.
  const assignmentId = wireAssignmentId(args.body.assignment_id);
  if (assignmentId != null) {
    const input = await linkToOwnSelfPlan(db, athleteId, assignmentId, metrics);
    return recordAthleteWorkout({ athleteId, rawAssignmentId: assignmentId, input, sql: db });
  }

  // 2. Sin plan previo: nace aquí, en la misma transacción que la ejecución.
  const read = readFreePlan(args.body);
  let failure: { code: string; message: string; details?: unknown };
  if (read.ok) {
    try {
      const saved = await createFreeWorkout({
        ...freePlanInput({ athleteId, coachId: args.coachId, title: read.title, sql: db }, read.plan),
        metrics,
      });
      return { ok: true, off_plan: false, ...saved };
    } catch (err) {
      if (!(err instanceof FreeWorkoutError)) throw err;
      failure = { code: err.code, message: err.message };
    }
  } else {
    failure = read;
  }

  // 3. Lo que no casa con un plan se guarda fuera del plan (0270), si trae trabajo.
  if (!carriesWorkEvidence(metrics)) {
    return {
      ok: false,
      reason: 'nothing_to_save',
      code: failure.code,
      message: failure.message,
      ...(failure.details !== undefined ? { details: failure.details } : {}),
    };
  }
  // Dicho en voz alta en el servidor: es un fallo de NUESTRO cliente o del catálogo.
  captureRouteError(new Error(`workouts/free: el plan no casa (${failure.code}); guardado fuera del plan`), {
    route: 'api/athlete/workouts/free.POST',
    meta: { athlete_id: athleteId, code: failure.code },
  });
  return recordOffPlanExecution({
    athleteId,
    reason: 'no_assignment',
    claimedAssignmentId: null,
    input: metrics,
    sql: db,
  });
}

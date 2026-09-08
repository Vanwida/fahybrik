import { z } from 'zod';

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  saveFreeWorkoutPlan,
  updateFreeWorkoutPlan,
  FreeWorkoutError,
} from '@/lib/athlete/create-free-workout';
import {
  validateFreeWorkout,
  FREE_WORKOUT_MODALITIES,
  type FreeWorkoutModality,
} from '@/lib/athlete/free-workout-validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/workouts/free/plan — persist a self-origin workout PLAN only
// (template + segments + scheduled assignment). No workout_executions row.
// Distinct from POST …/free which always records an execution after live work.
// When `assignment_id` is present, replaces the body of an editable scheduled plan.

const itemSchema = z.object({
  exercise_id: z.number().int().positive(),
  prescription: z.unknown(),
  part: z.enum(['warmup']).optional(),
});

const freePlanBodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  modality: z.enum(
    FREE_WORKOUT_MODALITIES as unknown as [FreeWorkoutModality, ...FreeWorkoutModality[]],
  ),
  prescription: z.unknown().optional(),
  items: z.array(itemSchema).optional(),
  assignment_id: z.number().int().positive().optional(),
  scheduled_for: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);
  const athleteId = Number(auth.athlete_id);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'Invalid JSON body', 400);
  }

  const parsed = freePlanBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', 'Invalid request body', 422, parsed.error.flatten());
  }
  const body = parsed.data;

  const validation = validateFreeWorkout({
    modality: body.modality,
    prescription: body.prescription,
    ...(body.items !== undefined ? { items: body.items } : {}),
  });
  if (!validation.ok) {
    return jsonError(validation.code, validation.message, 422, validation.details);
  }

  const coachRows = await sql<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${athleteId} limit 1
  `;
  const coachIdStr = coachRows[0]?.coach_id ?? null;
  const coachId = coachIdStr === null ? null : Number(coachIdStr);

  const plan = validation.plan;
  const base = {
    athleteId,
    coachId,
    title: body.title,
    scheme: plan.scheme,
    ...(body.scheduled_for ? { scheduledFor: body.scheduled_for } : {}),
  };

  const planInput =
    plan.kind === 'measured'
      ? { ...base, kind: 'measured' as const, modality: plan.modality, prescription: plan.prescription }
      : plan.kind === 'clock'
        ? { ...base, kind: 'clock' as const, prescription: plan.prescription }
        : {
            ...base,
            kind: 'items' as const,
            items: plan.items.map((it) => ({
              exerciseId: it.exercise_id,
              prescription: it.prescription,
              ...(it.part ? { part: it.part } : {}),
            })),
          };

  try {
    const result = body.assignment_id
      ? await updateFreeWorkoutPlan({ ...planInput, assignmentId: body.assignment_id })
      : await saveFreeWorkoutPlan(planInput);

    return jsonOk({
      saved: true,
      assignment_id: result.assignment_id,
      origin: 'self',
    });
  } catch (err) {
    if (err instanceof FreeWorkoutError) {
      const status = err.code === 'plan_not_editable' ? 409 : 422;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}

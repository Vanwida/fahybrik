import { z } from 'zod';

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { executionMetricsSchema } from '@/lib/sync/record-workout-execution';
import { createFreeWorkout, FreeWorkoutError } from '@/lib/athlete/create-free-workout';
import {
  validateFreeWorkout,
  FREE_WORKOUT_MODALITIES,
  type FreeWorkoutModality,
} from '@/lib/athlete/free-workout-validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/workouts/free — the athlete saves their OWN ("entreno libre /
// no prescrito") workout. The body branches on modality:
//   • MEASURED (row|ski|bike|run): one top-level `prescription` (a measured scheme).
//   • strength: `items[]` — N exercises, each a 'sets' set-table prescription.
//   • functional: `items[]` — N exercises sharing ONE metcon scheme (a WOD), or NO
//     items and one top-level metcon `prescription` — the box CLOCK, a session
//     whose format and duration are real even though no movement was named.
// The structured validation (schemes, per-set measures, item counts) lives in the
// DB-free `validateFreeWorkout` helper; the exercise resolution + persistence in
// create-free-workout.ts. Execution metrics are merged in unchanged.

const itemSchema = z.object({
  exercise_id: z.number().int().positive(),
  // Validated by validateFreeWorkout (the typed domain parser).
  prescription: z.unknown(),
  // "warmup" marca los ejercicios del calentamiento opcional; ausente = principal.
  part: z.enum(['warmup']).optional(),
});

const freeWorkoutBodySchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    modality: z.enum(
      FREE_WORKOUT_MODALITIES as unknown as [FreeWorkoutModality, ...FreeWorkoutModality[]],
    ),
    // The session's own prescription: required for the MEASURED modalities and
    // for a functional CLOCK (no items); ignored when items are declared.
    prescription: z.unknown().optional(),
    // Required for strength and for an item-built functional (order = execution
    // order); ignored otherwise. Absent/empty on a functional body = the CLOCK.
    items: z.array(itemSchema).optional(),
  })
  .merge(executionMetricsSchema);

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

  const parsed = freeWorkoutBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', 'Invalid request body', 422, parsed.error.flatten());
  }
  const body = parsed.data;

  // Structured branch validation (schemes, per-set measures, item counts) — the
  // single, DB-free source of the free-workout rules.
  const validation = validateFreeWorkout({
    modality: body.modality,
    prescription: body.prescription,
    ...(body.items !== undefined ? { items: body.items } : {}),
  });
  if (!validation.ok) {
    return jsonError(validation.code, validation.message, 422, validation.details);
  }
  const plan = validation.plan;

  // The libre surfaces to the athlete's coach when they HAVE one (the
  // workout_libre attention signal). A FREE athlete (coach_id null) saves the
  // same workout with no one to notify — the coach notice is best-effort
  // accessory, never part of the save contract, so null flows through:
  // exercise resolution falls back to the BASE catalog (visibleToCoach) and the
  // attention recompute no-ops without a coach.
  const coachRows = await sql<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${athleteId} limit 1
  `;
  const coachIdStr = coachRows[0]?.coach_id ?? null;
  const coachId = coachIdStr === null ? null : Number(coachIdStr);

  // Execution metrics only (strips title/modality/prescription/items — the metrics
  // schema is non-strict, so re-parsing the validated body keeps exactly the
  // recorder's fields, single-sourced from executionMetricsSchema).
  const metrics = executionMetricsSchema.parse(body);

  const base = { athleteId, coachId, title: body.title, scheme: plan.scheme, metrics };

  try {
    const result = await createFreeWorkout(
      plan.kind === 'measured'
        ? { ...base, kind: 'measured', modality: plan.modality, prescription: plan.prescription }
        : plan.kind === 'clock'
          ? { ...base, kind: 'clock', prescription: plan.prescription }
          : {
              ...base,
              kind: 'items',
              items: plan.items.map((it) => ({
                exerciseId: it.exercise_id,
                prescription: it.prescription,
                ...(it.part ? { part: it.part } : {}),
              })),
            },
    );

    return jsonOk({
      saved: true,
      assignment_id: result.assignment_id,
      execution_id: result.execution_id,
      origin: 'self',
    });
  } catch (err) {
    if (err instanceof FreeWorkoutError) {
      return jsonError(err.code, err.message, 422);
    }
    throw err;
  }
}

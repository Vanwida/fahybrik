import { z } from 'zod';

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { executionMetricsSchema } from '@/lib/sync/record-workout-execution';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import {
  createFreeWorkout,
  FreeWorkoutError,
  FREE_WORKOUT_MODALITY_SLUGS,
} from '@/lib/athlete/create-free-workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/workouts/free — the athlete saves their OWN ("entreno libre /
// no prescrito") workout. The body carries the chosen modality + the structured
// prescription it built + the execution metrics; the server persists it as a
// self-origin assignment through the existing path (see create-free-workout.ts).

// The MEASURED schemes a free workout may use — the four modalities are measured
// disciplines, so only measured-format schemes are accepted. Each is also a
// valid `templates.format` enum value (shared catalog), so it maps 1:1.
const MEASURED_SCHEMES = ['intervals', 'steady', 'emom', 'amrap', 'for_time', 'rounds'] as const;

const freeWorkoutBodySchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    modality: z.enum(
      Object.keys(FREE_WORKOUT_MODALITY_SLUGS) as [
        keyof typeof FREE_WORKOUT_MODALITY_SLUGS,
        ...Array<keyof typeof FREE_WORKOUT_MODALITY_SLUGS>,
      ],
    ),
    // Validated separately via safeParsePrescription (the typed domain parser).
    prescription: z.unknown(),
    // Optional client hint; the authoritative scheme is read from the prescription.
    format: z.string().optional(),
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

  // Validate the prescription with the typed domain parser (no free text).
  const pres = safeParsePrescription(body.prescription);
  if (!pres.success) {
    return jsonError('invalid_prescription', 'Invalid prescription', 422, pres.error.flatten());
  }
  const prescription = pres.data;
  const scheme = prescription.scheme;

  // The scheme must be a MEASURED format (which is also a valid templates.format).
  if (!(MEASURED_SCHEMES as readonly string[]).includes(scheme)) {
    return jsonError(
      'invalid_format',
      `Unsupported scheme for a free workout: '${scheme}'`,
      422,
    );
  }

  // A libre workout still needs a coach to surface to (the workout_libre signal).
  const coachRows = await sql<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${athleteId} limit 1
  `;
  const coachIdStr = coachRows[0]?.coach_id ?? null;
  if (!coachIdStr) {
    return jsonError('no_coach', 'Athlete has no coach to receive the workout', 422);
  }
  const coachId = Number(coachIdStr);

  // Execution metrics only (strips title/modality/prescription/format — the
  // metrics schema is non-strict, so re-parsing the validated body keeps exactly
  // the recorder's fields, single-sourced from executionMetricsSchema).
  const metrics = executionMetricsSchema.parse(body);

  try {
    const result = await createFreeWorkout({
      athleteId,
      coachId,
      title: body.title,
      modality: body.modality,
      scheme,
      prescriptionJson: prescription,
      metrics,
    });

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

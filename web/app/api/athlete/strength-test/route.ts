import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { STRENGTH_LIFT_SLUGS } from '@fahybrid/shared/schema/strength';
import { estimateOneRm, strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import { insertStrengthMaxVersion, loadCoachOneRmMethod } from '@/lib/strength/strength-max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/strength-test
// -------------------------------
// The athlete self-enters a strength test (a lift × weight × reps) from the app,
// feeding their 1RM. The ATHLETE-auth twin of /api/coach/athletes/[id]/strength-
// test: it REUSES the same estimate+store seam — estimateOneRm against the
// athlete's COACH's formula (coach_methodology.one_rm_estimation), then
// insertStrengthMaxVersion — so it produces an identical max. The latest version
// per lift is current, so it reflects immediately; the coach can override by
// recording their own test (a newer version wins). A true single (reps=1)
// resolves to the lifted weight exactly (the estimator short-circuits).

const bodySchema = z.object({
  exercise_slug: z.enum(STRENGTH_LIFT_SLUGS),
  weight_kg: z.number().positive().max(1000),
  reps: z.number().int().min(1).max(20),
});

export async function POST(req: Request) {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Bearer token required', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const { exercise_slug, weight_kg, reps } = parsed.data;
  const athlete_id = Number(athlete.athlete_id);

  // The estimator uses the athlete's COACH's formula — derive the coach.
  const coachRows = await sql<{ coach_id: string | null }[]>`
    select coach_id::text from athletes where id = ${athlete_id}
  `;
  const coachId = coachRows[0]?.coach_id ? Number(coachRows[0].coach_id) : null;
  if (!coachId) {
    return jsonError('precondition_failed', 'Tu cuenta aún no tiene coach asignado.', 409);
  }

  let inserted: { id: string; version: number; recorded_at: Date };
  let one_rm_kg: number;
  try {
    const method = await loadCoachOneRmMethod(sql, coachId);
    one_rm_kg = estimateOneRm(weight_kg, reps, method);
    inserted = await insertStrengthMaxVersion(
      {
        athlete_id,
        exercise_slug,
        one_rm_kg,
        // Athlete-recorded test: applied immediately (latest version wins). The
        // coach can override with their own test. Not pending review.
        source: 'athlete_test',
        test_weight_kg: weight_kg,
        test_reps: reps,
        one_rm_method: method,
        needs_review: false,
      },
      sql,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo estimar el 1RM';
    return jsonError('unprocessable', msg, 422);
  }

  return jsonOk(
    {
      max: {
        exercise_slug,
        exercise_label: strengthLiftLabel(exercise_slug),
        one_rm_kg,
        unit: 'kg',
        source: 'athlete_test',
        version: inserted.version,
        recorded_at: inserted.recorded_at.toISOString(),
        test_weight_kg: weight_kg,
        test_reps: reps,
      },
    },
    201,
  );
}

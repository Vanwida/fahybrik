import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { STRENGTH_LIFT_SLUGS } from '@fahybrid/shared/schema/strength';
import { estimateOneRm, strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import { insertStrengthMaxVersion, loadCoachOneRmMethod } from '@/lib/strength/strength-max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/strength-test
// -------------------------------------------
// Record / override an athlete's 1RM for one lift. The coach can enter it DIRECTLY
// (one_rm_kg — a true single they witnessed) or as a test set (weight_kg × reps),
// in which case it's estimated by the COACH's formula (coach_methodology.one_rm_
// estimation). Either way a new versioned athlete_strength_maxes row is written;
// the newest version is current, so a coach entry naturally wins over an
// onboarding/athlete value. The coach owns the athlete (gate) and the formula.

const bodySchema = z
  .object({
    exercise_slug: z.enum(STRENGTH_LIFT_SLUGS),
    weight_kg: z.number().positive().max(1000).optional(),
    reps: z.number().int().min(1).max(20).optional(),
    one_rm_kg: z.number().positive().max(1000).optional(),
  })
  .refine(
    (b) => b.one_rm_kg !== undefined || (b.weight_kg !== undefined && b.reps !== undefined),
    {
      message: 'Indica un 1RM directo (one_rm_kg) o un set de test (weight_kg + reps).',
    },
  );

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const athlete_id = Number(id);
  if (!Number.isFinite(athlete_id) || athlete_id <= 0) {
    return jsonError('bad_request', 'Atleta inválido', 400);
  }

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

  const { exercise_slug, weight_kg, reps, one_rm_kg: directOneRm } = parsed.data;
  const coach_id = Number(session.coach_id);

  // Ownership gate: the athlete must belong to this coach.
  const owned = await sql<{ id: string }[]>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id}
  `;
  if (owned.length === 0) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }

  let inserted: { id: string; version: number; recorded_at: Date };
  let one_rm_kg: number;
  let test_weight_kg: number | null;
  let test_reps: number | null;
  try {
    if (directOneRm !== undefined) {
      // Direct entry: a witnessed single. No estimation, no test set recorded.
      one_rm_kg = directOneRm;
      test_weight_kg = null;
      test_reps = null;
      inserted = await insertStrengthMaxVersion(
        {
          athlete_id,
          exercise_slug,
          one_rm_kg,
          source: 'coach_test',
          test_weight_kg: null,
          test_reps: null,
          one_rm_method: null,
          needs_review: false,
        },
        sql,
      );
    } else {
      // Estimated from a test set via the coach's formula.
      const method = await loadCoachOneRmMethod(sql, coach_id);
      // The refine guarantees both are present here.
      one_rm_kg = estimateOneRm(weight_kg as number, reps as number, method);
      test_weight_kg = weight_kg as number;
      test_reps = reps as number;
      inserted = await insertStrengthMaxVersion(
        {
          athlete_id,
          exercise_slug,
          one_rm_kg,
          source: 'coach_test',
          test_weight_kg,
          test_reps,
          one_rm_method: method,
          needs_review: false,
        },
        sql,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo registrar el 1RM';
    return jsonError('unprocessable', msg, 422);
  }

  return jsonOk(
    {
      max: {
        exercise_slug,
        exercise_label: strengthLiftLabel(exercise_slug),
        one_rm_kg,
        unit: 'kg',
        source: 'coach_test',
        version: inserted.version,
        recorded_at: inserted.recorded_at.toISOString(),
        test_weight_kg,
        test_reps,
      },
    },
    201,
  );
}

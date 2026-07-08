import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { recordBatteryResults } from '@/lib/coach/test-battery-bridge';
import { testResultEntrySchema } from '@fahybrid/shared/schema/test-battery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/test-results
// ------------------------------------------
// The coach records a calibration TEST session's result(s) on the athlete's
// behalf (they did it in the box). The COACH twin of the athlete self-entry
// bridge: same ejecución→benchmark loop, tagged source='coach_test' (the coach's
// number is the validated source of record and wins). Ownership-gated on the
// athlete; the assignment must belong to that athlete (enforced in the bridge).

const bodySchema = z.object({
  assignment_id: z.union([z.string(), z.number()]),
  results: z.array(testResultEntrySchema).min(1).max(10),
});

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

  // Ownership gate: the athlete must belong to this coach.
  const coach_id = Number(session.coach_id);
  const owned = await sql<{ id: string }[]>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  if (!owned[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  const result = await recordBatteryResults({
    athlete_id,
    assignment_id: Number(parsed.data.assignment_id),
    entries: parsed.data.results,
    source: 'coach_test',
  });

  if (!result.ok) {
    const status = result.error === 'assignment_not_found' ? 404 : 422;
    return jsonError(result.error ?? 'unprocessable', 'No se pudo registrar el test', status);
  }
  return jsonOk(result, 201);
}

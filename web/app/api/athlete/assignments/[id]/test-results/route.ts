import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { recordBatteryResults } from '@/lib/coach/test-battery-bridge';
import { recordTestResultsBodySchema } from '@fahybrid/shared/schema/test-battery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/assignments/[id]/test-results
// -----------------------------------------------
// The athlete finishes a calibration TEST session and confirms the measured
// number(s) inline (#34, Fork C). This is the ejecución→benchmark bridge on the
// athlete side: it records the result(s) as ground-truth benchmarks (source =
// 'athlete_test'), derives zones/maxes, and re-runs the level suggestion — the
// real number supersedes the self-declared/onboarding estimate. The COACH twin
// (source 'coach_test') lives at /api/coach/athletes/[id]/test-results.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Bearer token required', 401);

  const { id } = await ctx.params;
  const assignment_id = Number(id);
  if (!Number.isFinite(assignment_id)) return jsonError('bad_request', 'Asignación inválida', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = recordTestResultsBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const result = await recordBatteryResults({
    athlete_id: Number(athlete.athlete_id),
    assignment_id,
    entries: parsed.data.results,
    source: 'athlete_test',
  });

  if (!result.ok) {
    const status = result.error === 'assignment_not_found' ? 404 : 422;
    return jsonError(result.error ?? 'unprocessable', 'No se pudo registrar el test', status);
  }
  return jsonOk(result, 201);
}

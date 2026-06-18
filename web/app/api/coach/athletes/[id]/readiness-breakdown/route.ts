// GET /api/coach/athletes/[id]/readiness-breakdown — the readiness contributor
// breakdown for the /hoy AthleteSidePanel (SPEC §4 zone 4: "desglose readiness
// por contribuyentes"). Thin read over the athlete's latest daily-readiness
// snapshot (breakdown_json), mapped to coach-facing contributor rows. Lazy-
// loaded by the side panel on open. Coach-scoped; never leaks another coach's
// athletes.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { getLatestReadiness } from '@/lib/coach/athlete-daily-readiness';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface ReadinessContributor {
  label: string;
  /** 0–100 component score, or null when no data backs it. */
  score: number | null;
}

export interface ReadinessBreakdownResponse {
  score: number | null;
  contributors: ReadinessContributor[];
}

async function athleteBelongsToCoach(
  athlete_id: number,
  coach_id: bigint,
): Promise<boolean> {
  const rows = await sql<Array<{ id: string }>>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  return rows.length > 0;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  const athleteId = Number(parsedId.data.id);
  if (!(await athleteBelongsToCoach(athleteId, session.coach_id))) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }

  try {
    const snapshot = await getLatestReadiness({ athlete_id: athleteId });
    if (!snapshot) {
      return jsonOk<ReadinessBreakdownResponse>({ score: null, contributors: [] });
    }

    const b = snapshot.breakdown;
    const contributors: ReadinessContributor[] = [
      { label: 'Subjetivo', score: b.sub_score },
      { label: 'HRV', score: b.hrv_component },
      { label: 'Sueño', score: b.sleep_component },
      { label: 'FC reposo', score: b.rhr_component },
      { label: 'Recuperación', score: b.recovery_component },
    ];

    return jsonOk<ReadinessBreakdownResponse>({
      score: snapshot.score,
      contributors,
    });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/athletes/[id]/readiness-breakdown.GET' });
    return jsonError('internal', 'No se pudo cargar el desglose', 500);
  }
}

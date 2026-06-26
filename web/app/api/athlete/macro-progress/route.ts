import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteMacroSummary, buildAthleteMacroProgress } from '@/lib/coach/macro-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  // AGNOSTIC athlete views — microciclo NAME + "semana N de M" + per-week
  // compliance, sourced from athlete_month_assignments + workout_assignments.
  // No periodization tables read; `block` stays null (iOS shape parity).
  const [summary, progress] = await Promise.all([
    buildAthleteMacroSummary({ athlete_id: auth.athlete_id }),
    buildAthleteMacroProgress({ athlete_id: auth.athlete_id }),
  ]);

  return jsonOk({
    macro: {
      block: summary.block,
      week_label: summary.week_label,
      a_event_days: summary.a_event_days,
      current_week_start: summary.current_week_start,
      current_week_end: summary.current_week_end,
      assigned_weeks: progress.total_assigned_weeks,
    },
    macro_progress: {
      block: progress.block,
      total_assigned_weeks: progress.total_assigned_weeks,
      weeks: progress.weeks.map((w) => ({
        week_start: w.week_start,
        status: w.status,
        compliance_pct: w.compliance_pct,
      })),
    },
  });
}

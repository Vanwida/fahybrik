import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteMacroSummary, buildAthleteMacroProgress } from '@/lib/coach/macro-progress';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { isValidTimezone, startOfDayInTz } from '@fahybrid/shared/domain/coach/coach-timezone';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  // AGNOSTIC athlete views — microciclo NAME + "semana N de M" + per-week
  // compliance, sourced from athlete_month_assignments + workout_assignments.
  // No periodization tables read; `block` stays null (iOS shape parity).
  // «Hoy» es el del ATLETA (lo vive él; DECISIONS 2026-09-23, «Qué día es en
  // cada sitio»); un huso guardado que no se puede usar cae al defecto.
  const tz = await loadAthleteTimezone(sql, auth.athlete_id);
  const on_date = startOfDayInTz(new Date(), isValidTimezone(tz) ? tz : BOX_TIMEZONE);
  const [summary, progress] = await Promise.all([
    buildAthleteMacroSummary({ athlete_id: auth.athlete_id, on_date }),
    buildAthleteMacroProgress({ athlete_id: auth.athlete_id, on_date }),
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
        // Fracción 0–1 bajo el nombre histórico del cable: iOS lo lee así
        // (FAHYBRIKCore/Theme/Formato.swift). No cambiar sin cambiar la app.
        compliance_pct: w.compliance_ratio,
      })),
    },
  });
}

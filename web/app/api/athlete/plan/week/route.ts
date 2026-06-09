import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteMacroSummary } from '@/lib/coach/macro-progress';
import { addDays, isoDateString, mondayOfWeek, startOfDayInBox } from '@fahybrid/shared/domain/atr/dates';
import { getNextRace, getTargetRace } from '@/lib/races/next-race';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const summary = await buildAthleteMacroSummary({ athlete_id: auth.athlete_id });
  const week = await buildAthleteWeekPlan(auth.athlete_id);

  // RACE countdown. `target_race` = the goal the plan peaks to; `next_race` =
  // the soonest race on the calendar (may be an intermediate tune_up). They can
  // be the same object when the target is also the soonest. Both null when the
  // athlete has no upcoming race. ADDITIVE — does not alter week/macro_summary.
  const [target_race, next_race] = await Promise.all([
    getTargetRace(auth.athlete_id),
    getNextRace(auth.athlete_id),
  ]);

  return jsonOk({ week, macro_summary: summary, target_race, next_race });
}

async function buildAthleteWeekPlan(athlete_id: number | bigint) {
  // "Today" must resolve in the box timezone (Europe/Madrid), not UTC —
  // otherwise between 00:00–02:00 BCN the athlete is shown yesterday's week.
  const today = startOfDayInBox(new Date());
  const weekStart = mondayOfWeek(today);
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(addDays(weekStart, 6));

  const rows = await sql<
    Array<{
      assignment_id: string;
      iso_date: string;
      template_name: string | null;
      template_format: string | null;
      template_day_position: string | null;
      status: string;
      notes: string | null;
      partner_visibility: 'shared' | 'self_only';
    }>
  >`
    select
      wa.id::text as assignment_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      t.name as template_name,
      t.format::text as template_format,
      t.day_position as template_day_position,
      wa.status::text as status,
      wa.notes,
      wa.partner_visibility as partner_visibility
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id as number}
      and wa.scheduled_for >= ${weekStartIso}::date
      and wa.scheduled_for <= ${weekEndIso}::date
    order by wa.scheduled_for asc, wa.id asc
  `;

  // C35 — partner_visibility is exposed as-is. The DB filter by athlete_id
  // already isolates each user's sessions, so the only rows here belong to
  // the caller. iOS uses this field to render the "shared with partner"
  // badge. No additional server-side filtering needed.
  const days = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
    const dayDate = isoDateString(addDays(weekStart, dow - 1));
    const daySessions = rows.filter((r) => r.iso_date === dayDate);
    return {
      day_of_week: dow,
      iso_date: dayDate,
      sessions: daySessions.map((s) => ({
        assignment_id: s.assignment_id,
        slot: slotFromNotes(s.notes, s.template_day_position),
        title: s.template_name ?? 'Sesión',
        modality: s.template_format,
        status: s.status,
        partner_visibility: s.partner_visibility,
      })),
      is_rest: daySessions.length === 0,
    };
  });

  return {
    week_start: weekStartIso,
    week_end: weekEndIso,
    today_iso: isoDateString(today),
    days,
  };
}

function slotFromNotes(notes: string | null, dayPos: string | null): 'am' | 'pm' {
  if (notes?.includes('pm')) return 'pm';
  if (notes?.includes('am')) return 'am';
  if (dayPos?.toUpperCase().includes('PM')) return 'pm';
  return 'am';
}

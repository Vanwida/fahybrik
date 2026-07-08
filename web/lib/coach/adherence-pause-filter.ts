// #13 — ADHERENCE PAUSE EXCLUSION (single source of truth).
//
// A paused/baja athlete is FROZEN: the days inside a pause interval were never
// "due", so they must be EXCLUDED from the adherence denominator — NOT counted as
// a punitive 0%. Every `scheduled_for`-bounded completion count (roster, ficha,
// deep-dive, cohort) wraps its ROW SOURCE with the fragment below so the four can
// never drift apart.
//
// WHY on the row source (not per count): each adherence % is completed/scheduled
// where BOTH the numerator and denominator read the SAME rows. Excluding paused
// days from the shared row source keeps them consistent — a session completed on a
// paused day can never survive in `completed` while dropping out of `scheduled`
// (which would push adherence > 100%). When a WHOLE window is paused the row source
// empties → scheduled becomes 0 → adherencePct() returns null (shown as "—"),
// exactly the "undefined, not 0%" contract in shared/domain/adherence/completion.ts.
//
// Set-based exclusion (documented alongside getAthletePauseIntervals in
// athlete-lifecycle-reads.ts) — an open pause (end_date null) runs up to today:
//   and not exists (
//     select 1 from athlete_pauses ap
//     where ap.athlete_id = <athlete>
//       and <day> >= ap.start_date
//       and <day> <= coalesce(ap.end_date, current_date)
//   )

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

/** A composed postgres.js SQL fragment (same idiom as coach/metrics.ts, update-exercise.ts). */
type SqlFragment = ReturnType<typeof defaultSql>;

/**
 * The `and not exists (...)` clause that removes any workout_assignment whose day
 * fell inside one of the athlete's pause intervals. Append it to the WHERE / JOIN-ON
 * of the row source feeding an adherence count.
 *
 * @param client     the same Sql client running the outer query.
 * @param athleteRef RAW column ref for the assignment's athlete, e.g. sql`wa.athlete_id`.
 * @param dayRef     RAW column ref for the assignment's day,     e.g. sql`wa.scheduled_for`.
 *
 * Both refs are pre-built fragments (not bound params) so the exclusion correlates
 * to the caller's OWN alias with zero drift. The clause is a no-op for an athlete
 * with no pauses, so active athletes are entirely unaffected.
 */
export function adherenceExclusionSql(
  client: Sql,
  athleteRef: SqlFragment,
  dayRef: SqlFragment,
  adaptationRef?: SqlFragment,
): SqlFragment {
  // #16 — exclude ONLY injury REST days; a substituted/softened session the athlete
  // executes still counts (via its execution). Omit adaptationRef → pause-only.
  const injuryRest = adaptationRef ? client`and ${adaptationRef} is distinct from 'rest'` : client``;
  return client`
    and not exists (
      select 1 from athlete_pauses ap
      where ap.athlete_id = ${athleteRef}
        and ${dayRef} >= ap.start_date
        and ${dayRef} <= coalesce(ap.end_date, current_date)
    )
    ${injuryRest}`;
}

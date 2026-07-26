// Lifecycle transitions that fall due on a date (#13, 0136).
//
// Two things in this product are promised for "a day that has not arrived yet", and
// until now nobody was watching the calendar for either of them:
//
//   • THE RETURN FROM A PAUSE. `athlete_pauses.end_date` has always been able to hold
//     a planned return, and nothing ever read it — the athlete stayed pausado, with
//     Stripe voiding invoices, until a human remembered. Harmless while pauses were
//     coach-made and rare; a revenue leak the moment the athlete can pause themself.
//
//   • THE SCHEDULED BAJA. The athlete keeps everything they paid for until the period
//     ends, and on that day the baja has to actually land.
//
// Both sweeps are idempotent: they re-read the state and the underlying transitions
// guard it (`resumeAthlete` demands pausado, `bajaAthlete` refuses an athlete already
// de baja), so a double run is a no-op rather than a mess. One athlete failing never
// stops the rest — the error is captured and the loop continues.

import { sql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';
import {
  bajaAthlete,
  resumeAthlete,
  type PauseReason,
} from '@/lib/coach/athlete-lifecycle';
import { alertCoachAthleteReturned } from '@/lib/athlete/lifecycle-coach-alerts';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';

export interface LifecycleRunReport {
  /** The box-local day the sweep ran for. */
  day: string;
  resumed: number;
  bajas_applied: number;
  failures: number;
}

/**
 * Bring back everyone whose planned pause has elapsed.
 *
 * `end_date` is the LAST day paused, so the athlete is due back the day after: the
 * condition is `end_date < today`, not `<=`. An indefinite pause (end_date null) is
 * never touched here — only a human ends one of those.
 */
async function resumeDuePauses(todayIso: string): Promise<{ done: number; failed: number }> {
  const due = await sql<{ athlete_id: string }[]>`
    select distinct a.id::text as athlete_id
    from athletes a
    join athlete_pauses p on p.athlete_id = a.id
    where a.lifecycle_status = 'pausado'
      and p.end_date is not null
      and p.end_date < ${todayIso}::date
  `;
  let done = 0;
  let failed = 0;
  for (const row of due) {
    const athlete_id = BigInt(row.athlete_id);
    try {
      await resumeAthlete({ athlete_id });
      done += 1;
      await alertCoachAthleteReturned(athlete_id).catch(() => undefined);
    } catch (err) {
      failed += 1;
      captureRouteError(err, {
        route: 'lib/cron/lifecycle-runner.resumeDuePauses',
        meta: { athlete_id: row.athlete_id },
      });
    }
  }
  return { done, failed };
}

/** Apply every baja whose day has come. The reason + author were stamped when it was asked for. */
async function applyDueBajas(todayIso: string): Promise<{ done: number; failed: number }> {
  const due = await sql<
    { athlete_id: string; reason: string | null; by_user_id: string | null }[]
  >`
    select id::text as athlete_id, baja_reason as reason, baja_by_user_id::text as by_user_id
    from athletes
    where lifecycle_status <> 'baja'
      and baja_scheduled_for is not null
      and baja_scheduled_for <= ${todayIso}::date
  `;
  let done = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await bajaAthlete({
        athlete_id: BigInt(row.athlete_id),
        // `otro` only as a floor: the reason is always stamped when the baja is asked
        // for, so this is a guard against a hand-edited row, not a real default.
        reason: (row.reason as PauseReason | null) ?? 'otro',
        by_user_id: row.by_user_id === null ? null : BigInt(row.by_user_id),
        by_kind: 'athlete',
      });
      done += 1;
    } catch (err) {
      failed += 1;
      captureRouteError(err, {
        route: 'lib/cron/lifecycle-runner.applyDueBajas',
        meta: { athlete_id: row.athlete_id },
      });
    }
  }
  return { done, failed };
}

/** Run both sweeps for the box-local today. */
export async function runDueLifecycleTransitions(): Promise<LifecycleRunReport> {
  const day = isoDateString(startOfDayInBox(new Date()));
  const resumed = await resumeDuePauses(day);
  const bajas = await applyDueBajas(day);
  return {
    day,
    resumed: resumed.done,
    bajas_applied: bajas.done,
    failures: resumed.failed + bajas.failed,
  };
}

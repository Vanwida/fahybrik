import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BENCH_LTHR } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  resolveHrZones,
  type AthleteHrZones,
  type HrAnchors,
} from '@fahybrid/shared/domain/methodology';

// THE athlete's heart-rate zones, loaded once — the only server-side entry point.
//
// Every surface that needs to know what "Z3" means in beats per minute for a
// given athlete comes through here: the phone (which no longer computes zones at
// all), the watch encoders, the coach's time-in-zone and polarization. One read,
// one resolver, one answer.
//
// Returns NULL when the athlete has no anchor. Callers must render that as "aún
// no tiene zonas" and point at the threshold test — never as a zero, never as a
// band derived from a number nobody measured.

/** Athlete-level HR anchor columns. `dob` drives the last-resort age estimate. */
type AthleteHrRow = {
  max_hr_bpm: number | null;
  dob: string | null;
  lthr_bpm: number | null;
};

/** Milliseconds in an average year, leap years amortised. */
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Whole years from an ISO `YYYY-MM-DD` birth date. Null when absent/unparseable. */
export function ageYearsFrom(dob: string | null): number | null {
  if (!dob) return null;
  const then = Date.parse(dob);
  if (Number.isNaN(then)) return null;
  const years = Math.floor((Date.now() - then) / MS_PER_YEAR);
  return years > 0 && years < 120 ? years : null;
}

/**
 * The athlete's HR anchors, straight from storage. Kept separate from the resolve
 * so a caller that already holds the athlete row (the watch source does) can
 * resolve without a second query.
 */
export async function loadHrAnchors(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<HrAnchors> {
  const rows = await client<AthleteHrRow[]>`
    select
      a.max_hr_bpm,
      to_char(a.dob, 'YYYY-MM-DD') as dob,
      -- A recorded threshold-HR test, if the athlete has ever done one. It is the
      -- only anchor that is not an estimate, so it wins whenever present.
      (
        select b.value::int
        from athlete_benchmarks b
        where b.athlete_id = a.id and b.exercise_slug = ${BENCH_LTHR}
        order by b.recorded_at desc
        limit 1
      ) as lthr_bpm
    from athletes a
    where a.id = ${Number(athlete_id)}
    limit 1
  `;
  const row = rows[0];
  return {
    lthr_bpm: row?.lthr_bpm ?? null,
    max_hr_bpm: row?.max_hr_bpm ?? null,
    age_years: ageYearsFrom(row?.dob ?? null),
  };
}

/**
 * The athlete's five HR bands, or null when nothing anchors them.
 *
 * Null is a legitimate, common answer: as of today not one athlete in the
 * database has a measured max HR, and only three have a birth date. Surfaces are
 * expected to handle it, because handling it is the honest behaviour.
 */
export async function loadAthleteHrZones(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<AthleteHrZones | null> {
  return resolveHrZones(await loadHrAnchors(athlete_id, client));
}

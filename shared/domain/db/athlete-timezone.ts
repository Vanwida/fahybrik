import type { Sql } from 'postgres';
import { BOX_TIMEZONE, zonedDayString } from '../dates';

// "Which calendar day is it FOR THIS ATHLETE" — one lookup, because every
// biometric window in the app is a local-day window and each surface used to
// answer it its own way (some with the athlete's tz, some with the box tz, some
// with UTC, which silently moves a 00:0x local reading to the previous day).

/**
 * Until an athlete's device reports its IANA timezone (HealthKit sync batch →
 * `athletes.timezone`), fall back to the deployment default (`BOX_TIMEZONE`).
 * It is a FALLBACK, not an assumption — the column wins the moment it is
 * populated, and it is the only tz link that exists today: there is no
 * `coaches.timezone`, so a coach outside the default zone still reads a clock
 * that is not his. See the note on `BOX_TIMEZONE` in `../dates.ts`.
 */
export const LAUNCH_FALLBACK_TIMEZONE = BOX_TIMEZONE;

/** The athlete's IANA timezone, or the launch fallback when unset. */
export async function loadAthleteTimezone(
  client: Sql,
  athlete_id: number | bigint,
): Promise<string> {
  const rows = await client<Array<{ timezone: string | null }>>`
    select timezone from athletes where id = ${athlete_id as number} limit 1
  `;
  return rows[0]?.timezone ?? LAUNCH_FALLBACK_TIMEZONE;
}

/** Same, for a cohort — one query, keyed by athlete id as a string. Ids with no
 *  row are simply absent; callers apply the fallback themselves. */
export async function loadAthleteTimezones(
  client: Sql,
  athlete_ids: ReadonlyArray<number | bigint>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(athlete_ids.map((x) => Number(x))));
  if (ids.length === 0) return out;
  const rows = await client<Array<{ id: string; timezone: string | null }>>`
    select id::text as id, timezone from athletes where id = any(${ids}::bigint[])
  `;
  for (const r of rows) out.set(r.id, r.timezone ?? LAUNCH_FALLBACK_TIMEZONE);
  return out;
}

/** The athlete's own "today" as YYYY-MM-DD. */
export async function loadAthleteLocalDay(params: {
  athlete_id: number | bigint;
  now?: Date;
  client: Sql;
}): Promise<string> {
  const tz = await loadAthleteTimezone(params.client, params.athlete_id);
  return zonedDayString(params.now ?? new Date(), tz);
}

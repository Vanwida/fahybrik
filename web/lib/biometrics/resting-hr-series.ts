import 'server-only';

import type { Sql } from '@/lib/db';
import {
  loadRestingHrDays,
  resolveRestingHrOn,
  type RestingHrDay,
} from '@fahybrid/shared/domain/biometrics/resting-hr';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import { addDays, isoDateString, parseIsoDate, zonedDayString } from '@fahybrid/shared/domain/dates';

// Web-side shaping of THE resting-HR resolver (`shared/domain/biometrics/resting-hr`).
// The domain module owns what a resting HR IS — local calendar day, last revision
// wins, age carried. This file only turns that into the two shapes the dashboard
// renders, so no surface re-queries `biometric_streams` for `hr_resting` itself.

/** A dense day slot, matching the `BodyPoint` shape the deep-dive charts expect. */
export type RestingHrPoint = { iso_date: string; value: number | null };

export type RestingHrBodySection = {
  /** `days` slots ending on the athlete's local today, nulls where no reading.
   *  History — it keeps every reading in the window, however old. */
  daily: RestingHrPoint[];
  /** The value to HEADLINE: null once nothing is recent enough to still describe
   *  the athlete now (`RESTING_HR_SHOWABLE_DAYS`). A chart may show old history;
   *  a headline number may not pass it off as current. */
  last_bpm: number | null;
};

/**
 * The athlete's resting HR over the last `days` local days, densified for a chart,
 * plus the resolved headline value with its age.
 *
 * Anchored on the athlete's OWN calendar day, not the server's: readings land at
 * 00:0x local, which is the previous day in UTC, so a UTC-anchored window put every
 * one of them on the wrong slot and averaged two days together whenever a second
 * reading arrived mid-morning.
 */
export async function loadRestingHrBodySection(params: {
  athlete_id: number | bigint;
  now: Date;
  days: number;
  client: Sql;
}): Promise<RestingHrBodySection> {
  const tz = await loadAthleteTimezone(params.client, params.athlete_id);
  const todayIso = zonedDayString(params.now, tz);
  const fromIso = isoDateString(addDays(parseIsoDate(todayIso), -(params.days - 1)));

  const read = await loadRestingHrDays({
    athlete_id: params.athlete_id,
    from_iso: fromIso,
    to_iso: todayIso,
    client: params.client,
  });

  const headline = resolveRestingHrOn(read, todayIso);
  return {
    daily: densify(read, fromIso, params.days),
    last_bpm: headline ? Math.round(headline.bpm) : null,
  };
}

/** One slot per local day in the window, `null` where the athlete has no reading —
 *  the chart needs the gaps to stay gaps, never interpolated. */
function densify(days: ReadonlyArray<RestingHrDay>, fromIso: string, count: number): RestingHrPoint[] {
  const byDay = new Map(days.map((d) => [d.on, d.bpm]));
  const start = parseIsoDate(fromIso);
  const out: RestingHrPoint[] = [];
  for (let i = 0; i < count; i++) {
    const iso = isoDateString(addDays(start, i));
    out.push({ iso_date: iso, value: byDay.get(iso) ?? null });
  }
  return out;
}

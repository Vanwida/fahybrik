import type { Sql } from 'postgres';
import { BOX_TIMEZONE, addDays, diffDays, isoDateString, parseIsoDate } from '../dates';

// THE resting heart rate. One reader, one truth — every surface that shows "FC en
// reposo" (readiness, la ficha del atleta, el cohorte, las tendencias, analíticas)
// goes through this file. It exists because six surfaces each wrote their own
// `select ... from biometric_streams where metric_type = 'hr_resting'` and, on the
// SAME athlete on the SAME day, answered 51, 52 and 53 — and disagreed about which
// day the reading even belonged to.
//
// What resting HR actually IS (the model, not the query):
//
//   1. A DAILY AGGREGATE, not a moment. The platform publishes one value per
//      calendar day, computed over that whole day. It therefore belongs to the
//      athlete-LOCAL calendar day of its stamp — never to a UTC day. In Barcelona
//      most stamps land at 00:0x local, which is 22:0x UTC of the day BEFORE: every
//      reader that bucketed by `date_trunc('day', recorded_at)` was showing the
//      athlete's resting HR shifted a full day back, and averaging two days'
//      readings together whenever a second one landed mid-morning.
//      (The stamp roams: a real athlete's history carries 00:0x, 05:09, 09:33,
//      11:19, 14:32 and 15:19 local. No window narrower than the day survives it.)
//
//   2. REVISED IN PLACE. The platform rewrites the day's value as the day fills in,
//      re-sending it under the SAME `recorded_at` — a real athlete has 51 → 50 → 52
//      ppm for one night. Rows are never updated, only appended, so the truth for a
//      day is the LAST ONE WRITTEN (`created_at desc`), not the average of the
//      revisions and not whichever row the planner happened to return first.
//
//   3. LATE AND GAPPY. It arrives 6-13 h after the day it describes (stamped 09:33,
//      written at 18:50 and again at 22:48) and is simply absent on days the watch
//      was off the wrist. So "today's" reading normally does NOT exist yet, and a
//      blank row on an athlete with weeks of history reads as broken rather than as
//      pending. The honest answer is the last one WITH ITS AGE — which is why
//      `resolveRestingHrOn` returns `age_days`/`is_for_day` and never a bare number.
//
// Only a reading whose local day IS the day being asked about (`is_for_day`) may
// ever SCORE. Anything older is display-only, and the surface must say how old it
// is (contrato §7: lo que no se sabe no se pinta, y nada por defecto puede parecer
// un dato del atleta).

/** `biometric_streams.metric_type` this module owns. Exported so a reader that
 *  bulk-loads several metrics at once can EXCLUDE it from its own query and take
 *  it from here instead — resting HR is the one metric a plain daily average gets
 *  wrong. */
export const RESTING_HR_METRIC = 'hr_resting';

// Until an athlete's device reports its IANA timezone (HealthKit sync batch →
// `athletes.timezone`), fall back to Fabrik's box timezone.
const FALLBACK_TIMEZONE = BOX_TIMEZONE;

/**
 * How stale a reading may be and still be SHOWN as "your resting HR" (never
 * scored). Past this it stops describing the athlete now and becomes history.
 * Chosen to absorb the two real gap causes — the 6-13 h publication delay and a
 * week or two without wearing the watch — without ever letting a month-old value
 * sit on screen unlabelled.
 */
export const RESTING_HR_SHOWABLE_DAYS = 14;

/** Widen the indexed `recorded_at` filter by a day on each side so no timezone
 *  offset can clip a local day at the edges; the exact cut is made on the
 *  computed local day. Keeps the range scan on the index instead of forcing a
 *  per-row function over the whole table. */
const UTC_SLACK_DAYS = 1;

/** One athlete-local day's resting HR: the revision that won, with the two
 *  instants that let a caller reason about lateness. */
export type RestingHrDay = {
  /** Athlete-local calendar day the reading describes (YYYY-MM-DD). */
  on: string;
  bpm: number;
  /** When the platform says the reading happened. */
  recorded_at: Date;
  /** When we received the winning revision — always later, often by hours. */
  received_at: Date;
};

/** A resting HR resolved AGAINST a particular day, carrying whether it is that
 *  day's (the only case that may score) and how old it is otherwise. */
export type ResolvedRestingHr = {
  bpm: number;
  /** Athlete-local day the value belongs to. */
  on: string;
  /** Local days between `on` and the day asked about. 0 → it IS that day's. */
  age_days: number;
  /** `age_days === 0`. The ONLY case a score may use. */
  is_for_day: boolean;
};

type DayRow = { on: string; bpm: number; recorded_at: Date; created_at: Date };

function toDays(rows: ReadonlyArray<DayRow>): RestingHrDay[] {
  return rows.map((r) => ({
    on: r.on,
    bpm: Number(r.bpm),
    recorded_at: new Date(r.recorded_at),
    received_at: new Date(r.created_at),
  }));
}

/**
 * Every athlete-local day with a resting HR in `[from_iso, to_iso]`, ascending,
 * one row per day carrying the winning revision. Days without a reading are simply
 * absent — an honest series of what exists, never gap-filled.
 *
 * The bucketing uses each athlete's OWN `athletes.timezone` (box tz when unset), so
 * this is correct for a roster spread across timezones, not just for Barcelona.
 */
export async function loadRestingHrDays(params: {
  athlete_id: number | bigint;
  /** Inclusive athlete-local day bounds (YYYY-MM-DD). */
  from_iso: string;
  to_iso: string;
  client: Sql;
}): Promise<RestingHrDay[]> {
  const utcFrom = addDays(parseIsoDate(params.from_iso), -UTC_SLACK_DAYS);
  const utcTo = addDays(parseIsoDate(params.to_iso), 1 + UTC_SLACK_DAYS);

  const rows = await params.client<DayRow[]>`
    select distinct on (s.local_day)
      to_char(s.local_day, 'YYYY-MM-DD') as on,
      s.bpm,
      s.recorded_at,
      s.created_at
    from (
      select
        date_trunc('day', bs.recorded_at at time zone coalesce(a.timezone, ${FALLBACK_TIMEZONE})) as local_day,
        bs.value_numeric::float as bpm,
        bs.recorded_at,
        bs.created_at
      from biometric_streams bs
      join athletes a on a.id = bs.athlete_id
      where bs.athlete_id = ${params.athlete_id as number}
        and bs.metric_type = ${RESTING_HR_METRIC}
        and bs.recorded_at >= ${utcFrom}
        and bs.recorded_at < ${utcTo}
    ) s
    where s.local_day >= ${params.from_iso}::date
      and s.local_day < (${params.to_iso}::date + 1)
    order by s.local_day desc, s.recorded_at desc, s.created_at desc
  `;
  return toDays(rows).reverse(); // query is newest-first (distinct on); callers want ascending
}

/**
 * The resting HR to show ON `iso`: that day's reading when it has landed, else the
 * most recent one within `max_age_days` — flagged with its age so the surface can
 * say "52 ppm · ayer" instead of pretending it is today's. `null` when nothing is
 * recent enough to honestly attribute to the athlete.
 *
 * Pure: `days` is whatever `loadRestingHrDays` returned, so a caller that already
 * has the series (a trend, a deep dive) resolves the headline value from the SAME
 * rows it charts instead of issuing a second, subtly different query.
 */
export function resolveRestingHrOn(
  days: ReadonlyArray<RestingHrDay>,
  iso: string,
  options?: { max_age_days?: number },
): ResolvedRestingHr | null {
  const maxAge = options?.max_age_days ?? RESTING_HR_SHOWABLE_DAYS;
  const target = parseIsoDate(iso);
  let best: RestingHrDay | null = null;
  for (const d of days) {
    if (d.on > iso) continue; // never let a future-stamped row speak for today
    if (best == null || d.on > best.on) best = d;
  }
  if (best == null) return null;
  const age = diffDays(target, parseIsoDate(best.on));
  if (age > maxAge) return null;
  return { bpm: best.bpm, on: best.on, age_days: age, is_for_day: age === 0 };
}

/**
 * `loadRestingHrDays` + `resolveRestingHrOn` for a caller that only wants the one
 * value (readiness, a KPI tile). Looks back exactly as far as a reading may still
 * be shown.
 */
export async function loadRestingHrOn(params: {
  athlete_id: number | bigint;
  /** The athlete-local day being asked about (YYYY-MM-DD). */
  iso: string;
  max_age_days?: number;
  client: Sql;
}): Promise<ResolvedRestingHr | null> {
  const maxAge = params.max_age_days ?? RESTING_HR_SHOWABLE_DAYS;
  const days = await loadRestingHrDays({
    athlete_id: params.athlete_id,
    from_iso: isoDateString(addDays(parseIsoDate(params.iso), -maxAge)),
    to_iso: params.iso,
    client: params.client,
  });
  return resolveRestingHrOn(days, params.iso, { max_age_days: maxAge });
}

/**
 * The cohort flavour: one resolved resting HR per athlete, in ONE query — a coach
 * roster must not turn into an N+1. Each athlete is bucketed in their OWN timezone
 * and resolved against their OWN local "today", both taken from the join, so the
 * caller never has to look a timezone up to ask this question.
 *
 * Returns a Map keyed by athlete id as a string; athletes with nothing recent
 * enough are simply absent (the surface renders its own honest empty).
 */
export async function loadRestingHrOnBatch(params: {
  athlete_ids: ReadonlyArray<number | bigint>;
  /** The instant "today" is resolved from; each athlete's own tz turns it into a day. */
  now?: Date;
  max_age_days?: number;
  client: Sql;
}): Promise<Map<string, ResolvedRestingHr>> {
  const out = new Map<string, ResolvedRestingHr>();
  const ids = Array.from(new Set(params.athlete_ids.map((x) => Number(x))));
  if (ids.length === 0) return out;
  const maxAge = params.max_age_days ?? RESTING_HR_SHOWABLE_DAYS;
  const now = params.now ?? new Date();

  // One UTC range covering every athlete's lookback, widened for timezone offsets;
  // the exact per-athlete cut happens on the resolved local days below.
  const nowIso = isoDateString(now);
  const utcFrom = addDays(parseIsoDate(nowIso), -(maxAge + UTC_SLACK_DAYS));
  const utcTo = addDays(parseIsoDate(nowIso), 1 + UTC_SLACK_DAYS);

  const rows = await params.client<Array<DayRow & { athlete_id: string; today: string }>>`
    select distinct on (s.athlete_id, s.local_day)
      s.athlete_id,
      s.today,
      to_char(s.local_day, 'YYYY-MM-DD') as on,
      s.bpm,
      s.recorded_at,
      s.created_at
    from (
      select
        bs.athlete_id::text as athlete_id,
        to_char(${now}::timestamptz at time zone coalesce(a.timezone, ${FALLBACK_TIMEZONE}), 'YYYY-MM-DD') as today,
        date_trunc('day', bs.recorded_at at time zone coalesce(a.timezone, ${FALLBACK_TIMEZONE})) as local_day,
        bs.value_numeric::float as bpm,
        bs.recorded_at,
        bs.created_at
      from biometric_streams bs
      join athletes a on a.id = bs.athlete_id
      where bs.athlete_id = any(${ids}::bigint[])
        and bs.metric_type = ${RESTING_HR_METRIC}
        and bs.recorded_at >= ${utcFrom}
        and bs.recorded_at < ${utcTo}
    ) s
    order by s.athlete_id, s.local_day desc, s.recorded_at desc, s.created_at desc
  `;

  const byAthlete = new Map<string, { today: string; days: RestingHrDay[] }>();
  for (const r of rows) {
    const entry: { today: string; days: RestingHrDay[] } =
      byAthlete.get(r.athlete_id) ?? { today: r.today, days: [] };
    entry.days.push(...toDays([r]));
    byAthlete.set(r.athlete_id, entry);
  }
  for (const [athleteId, { today, days }] of byAthlete) {
    const resolved = resolveRestingHrOn(days, today, { max_age_days: maxAge });
    if (resolved) out.set(athleteId, resolved);
  }
  return out;
}

import type { Sql } from 'postgres';
import {
  BOX_TIMEZONE,
  addDays,
  isoDateString,
  parseIsoDate,
  zonedDayString,
  zonedWallClockToUtc,
} from '../dates';

// Until an athlete's device reports its IANA timezone (via the HealthKit sync
// batch → athletes.timezone), fall back to Fabrik's box timezone. Single-coach
// launch reality: everyone trains in Barcelona.
const LAUNCH_FALLBACK_TIMEZONE = BOX_TIMEZONE;

// Overnight signals (sleep, resting HR) belong to the readiness of the day the
// athlete WAKES. iOS keys a night's `sleep_duration` to wake-day local-midnight and
// Apple writes the daily resting-HR sample just after local midnight, so a window
// from the previous evening to the early afternoon captures exactly last night —
// and nothing from the night before. Wall-clock hours in the athlete's own tz.
const OVERNIGHT_WINDOW_START_HOUR = 18; // previous local day, 18:00
const OVERNIGHT_WINDOW_END_HOUR = 14; // this local day, 14:00

// HRV baseline: a trailing 14–60 local-day average. Excluding the most recent 14
// days keeps an acute HRV dip from dragging down the very baseline it's compared to.
const HRV_BASE_FROM_DAYS = 60;
const HRV_BASE_TO_DAYS = 14;

// The sleep duration (hours) that scores a FULL sleep component. Named so the
// athlete detail sheet can surface it as the reference ("objetivo 8 h") instead
// of a magic divisor — this is the ONLY sleep reference the model uses (there is
// no personal sleep average).
const SLEEP_TARGET_HOURS = 8;

// Span of the athlete readiness trend (today + the prior days) for the sheet.
const TREND_DAYS = 7;

export type ReadinessBreakdown = {
  sub_score: number | null;
  sub_score_weight: number;
  hrv_component: number | null;
  sleep_hours: number | null;
  sleep_component: number | null;
  rhr_component: number | null;
  recovery_component: number | null;
  // Raw inputs the athlete detail sheet renders as "value vs reference". Set on
  // every snapshot written since the readiness-detail feature; OPTIONAL so legacy
  // rows (which predate them) still decode and the UI simply hides what's absent.
  // These are the SAME values the compute already reads to score — surfaced, not
  // recomputed. RHR is scored against a fixed floor, so there is NO personal RHR
  // baseline to expose; sleep's only reference is the target below (no media).
  hrv_ms?: number | null; // the day's mean HRV (the "value")
  hrv_baseline_ms?: number | null; // 14–60d trailing mean (the "reference")
  rhr_bpm?: number | null; // resting-HR reading (the "value")
  sleep_target_h?: number | null; // sleep hours that score a full component (the "reference")
};

export type ReadinessTrendPoint = { recorded_for: string; score: number };

export type DailyReadinessSnapshot = {
  athlete_id: string;
  recorded_for: string;
  score: number;
  breakdown: ReadinessBreakdown;
  delta_7d: number | null;
  // Ascending (oldest→today) score series from persisted snapshots, for the
  // athlete detail sheet's mini chart. Only attached by `getAthleteReadinessToday`
  // — undefined on the coach-facing readers.
  trend?: ReadinessTrendPoint[];
};

const WEIGHTS = {
  sub_score: 0.35,
  hrv: 0.25,
  sleep: 0.2,
  rhr: 0.1,
  recovery: 0.1,
} as const;

const EMPTY_BREAKDOWN: ReadinessBreakdown = {
  sub_score: null,
  sub_score_weight: WEIGHTS.sub_score,
  hrv_component: null,
  sleep_hours: null,
  sleep_component: null,
  rhr_component: null,
  recovery_component: null,
  hrv_ms: null,
  hrv_baseline_ms: null,
  rhr_bpm: null,
  sleep_target_h: null,
};

/**
 * The ONE deserializer for a stored `breakdown_json` — every read of the
 * snapshot table maps through this so `breakdown` is ALWAYS an object, matching
 * the shape the fresh-compute path returns (DRY: one canonical form, never a
 * JSON string). postgres.js parses a proper jsonb object into a JS object, but
 * legacy rows were double-encoded (a JSON *string* inside jsonb) and read back
 * as a string — the athlete Inicio card and the coach side-panel both silently
 * broke on those. Normalize: string → JSON.parse; non-object/garbage → the
 * canonical empty breakdown. Never throws.
 */
function readBreakdown(raw: unknown): ReadinessBreakdown {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...EMPTY_BREAKDOWN };
    }
  }
  if (value != null && typeof value === 'object') {
    return value as ReadinessBreakdown;
  }
  return { ...EMPTY_BREAKDOWN };
}

/** The athlete's IANA timezone, or the launch fallback (box tz) when unset. */
async function loadAthleteTimezone(client: Sql, athlete_id: number | bigint): Promise<string> {
  const rows = await client<Array<{ timezone: string | null }>>`
    select timezone from athletes where id = ${athlete_id as number} limit 1
  `;
  return rows[0]?.timezone ?? LAUNCH_FALLBACK_TIMEZONE;
}

export async function computeAthleteDailyReadiness(params: {
  athlete_id: number | bigint;
  recorded_for: string;
  /** Athlete IANA tz; when omitted it's loaded from athletes.timezone (fallback box tz). */
  timezone?: string;
  client: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  const client = params.client;
  const tz = params.timezone ?? (await loadAthleteTimezone(client, params.athlete_id));
  const day = parseIsoDate(params.recorded_for);
  const weekAgoIso = isoDateString(addDays(day, -7));

  // Biometric windows as absolute UTC instants, bucketed by calendar day in the
  // athlete's timezone (see dates.ts). Passing Date objects binds them as
  // timestamptz, so the `recorded_at >= start and < end` comparison is exact.
  const overnightStart = zonedWallClockToUtc(day, tz, { days: -1, hours: OVERNIGHT_WINDOW_START_HOUR });
  const overnightEnd = zonedWallClockToUtc(day, tz, { days: 0, hours: OVERNIGHT_WINDOW_END_HOUR });
  const dayStart = zonedWallClockToUtc(day, tz, { days: 0, hours: 0 });
  const dayEnd = zonedWallClockToUtc(day, tz, { days: 1, hours: 0 });
  const hrvBaseFrom = zonedWallClockToUtc(day, tz, { days: -HRV_BASE_FROM_DAYS, hours: 0 });
  const hrvBaseTo = zonedWallClockToUtc(day, tz, { days: -HRV_BASE_TO_DAYS, hours: 0 });

  const checkin = await client<Array<{ sub_score: number }>>`
    select sub_score from daily_checkins
    where athlete_id = ${params.athlete_id as number}
      and recorded_for = ${params.recorded_for}::date
    limit 1
  `;
  let subScore = checkin[0]?.sub_score ?? null;
  if (subScore == null) {
    const last = await client<Array<{ sub_score: number }>>`
      select sub_score from daily_checkins
      where athlete_id = ${params.athlete_id as number}
        and recorded_for < ${params.recorded_for}::date
      order by recorded_for desc limit 1
    `;
    subScore = last[0]?.sub_score ?? null;
  }

  const bio = await client<
    Array<{ hrv_recent: number | null; hrv_base: number | null; sleep_h: number | null; rhr: number | null; recovery: number | null }>
  >`
    select
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hrv'
          and recorded_at >= ${dayStart} and recorded_at < ${dayEnd}) as hrv_recent,
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hrv'
          and recorded_at >= ${hrvBaseFrom} and recorded_at < ${hrvBaseTo}) as hrv_base,
      (select avg(value_numeric)::float / 3600.0 from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'sleep_duration'
          and recorded_at >= ${overnightStart} and recorded_at < ${overnightEnd}) as sleep_h,
      (select value_numeric::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hr_resting'
          and recorded_at >= ${overnightStart} and recorded_at < ${overnightEnd}
        order by recorded_at desc limit 1) as rhr,
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'recovery'
          and recorded_at >= ${dayStart} and recorded_at < ${dayEnd}) as recovery
  `;
  const b = bio[0];

  const complianceRows = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*)::int as scheduled,
      count(*) filter (where status = 'completed')::int as completed
    from workout_assignments
    where athlete_id = ${params.athlete_id as number}
      and scheduled_for >= ${weekAgoIso}::date
      and scheduled_for <= ${params.recorded_for}::date
  `;
  const compliance =
    complianceRows[0] && complianceRows[0].scheduled > 0
      ? complianceRows[0].completed / complianceRows[0].scheduled
      : null;

  const hrvComponent =
    b?.hrv_recent != null && b?.hrv_base != null && b.hrv_base > 0
      ? clampScore(50 + ((b.hrv_recent - b.hrv_base) / b.hrv_base) * 100)
      : null;

  const sleepComponent =
    b?.sleep_h != null
      ? clampScore(Math.min(100, (b.sleep_h / SLEEP_TARGET_HOURS) * 100))
      : null;

  const rhrComponent = b?.rhr != null ? clampScore(100 - Math.max(0, b.rhr - 50) * 2) : null;

  const recoveryComponent =
    b?.recovery != null ? clampScore(b.recovery) : null;

  const breakdown: ReadinessBreakdown = {
    sub_score: subScore,
    sub_score_weight: WEIGHTS.sub_score,
    hrv_component: hrvComponent,
    sleep_hours: b?.sleep_h ?? null,
    sleep_component: sleepComponent,
    rhr_component: rhrComponent,
    recovery_component: recoveryComponent,
    // Raw values the detail sheet renders vs their references — the very inputs
    // scored just above, surfaced (not recomputed).
    hrv_ms: b?.hrv_recent ?? null,
    hrv_baseline_ms: b?.hrv_base ?? null,
    rhr_bpm: b?.rhr ?? null,
    sleep_target_h: SLEEP_TARGET_HOURS,
  };
  // NOTE: `compliance` is still computed below as a SCORE MODIFIER, but it's no
  // longer carried in the breakdown DTO — adherence-over-7d is a progression
  // concept, not a "how you arrive today" readiness contributor, and no surface
  // renders it as a chip.

  const parts: Array<{ w: number; v: number }> = [];
  if (subScore != null) parts.push({ w: WEIGHTS.sub_score, v: subScore });
  if (hrvComponent != null) parts.push({ w: WEIGHTS.hrv, v: hrvComponent });
  if (sleepComponent != null) parts.push({ w: WEIGHTS.sleep, v: sleepComponent });
  if (rhrComponent != null) parts.push({ w: WEIGHTS.rhr, v: rhrComponent });
  if (recoveryComponent != null) parts.push({ w: WEIGHTS.recovery, v: recoveryComponent });

  // Zero real signals (no check-in ever recorded AND no wearable component) →
  // there is nothing to score. We must NOT invent a 50 and persist it: a
  // fabricated number reads as a real readiness on Today and suppresses the
  // honest "Sin datos · haz tu check-in" empty state. Return null so the UI
  // renders the empty state instead. (`compliance` is a modifier, not a
  // signal, so it is intentionally excluded from this check.)
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  if (totalW === 0) return null;

  let score = Math.round(parts.reduce((s, p) => s + p.v * (p.w / totalW), 0));
  if (compliance != null && compliance < 0.6) score = Math.min(score, score - 5);
  score = clampScore(score);

  const prevRows = await client<Array<{ score: number }>>`
    select score from athlete_daily_readiness_snapshots
    where athlete_id = ${params.athlete_id as number}
      and recorded_for = ${weekAgoIso}::date
    limit 1
  `;
  const delta7d = prevRows[0] ? score - prevRows[0].score : null;

  await client`
    insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
    values (
      ${params.athlete_id as number},
      ${params.recorded_for}::date,
      ${score},
      ${JSON.stringify(breakdown)}::jsonb
    )
    on conflict (athlete_id, recorded_for) do update set
      score = excluded.score,
      breakdown_json = excluded.breakdown_json,
      computed_at = now()
  `;

  return {
    athlete_id: String(params.athlete_id),
    recorded_for: params.recorded_for,
    score,
    breakdown,
    delta_7d: delta7d,
  };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function getLatestReadiness(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  const client = params.client;
  const tz = await loadAthleteTimezone(client, params.athlete_id);
  const iso = zonedDayString(params.on_date ?? new Date(), tz);
  const rows = await client<Array<{ recorded_for: string; score: number; breakdown_json: unknown }>>`
    select
      to_char(recorded_for, 'YYYY-MM-DD') as recorded_for,
      score,
      breakdown_json
    from athlete_daily_readiness_snapshots
    where athlete_id = ${params.athlete_id as number}
      and recorded_for <= ${iso}::date
    order by recorded_for desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    try {
      return await computeAthleteDailyReadiness({
        athlete_id: params.athlete_id,
        recorded_for: iso,
        timezone: tz,
        client,
      });
    } catch {
      return null;
    }
  }
  return {
    athlete_id: String(params.athlete_id),
    recorded_for: row.recorded_for,
    score: row.score,
    breakdown: readBreakdown(row.breakdown_json),
    delta_7d: null,
  };
}

/**
 * Ascending (oldest→today) score series for the athlete's last `days` days,
 * today inclusive, straight from persisted snapshots. Days with no snapshot are
 * simply absent — an honest series of what was recorded, no gap-filling.
 */
export async function getReadinessTrend(params: {
  athlete_id: number | bigint;
  /** The athlete-local "today" ISO date (inclusive upper bound). */
  iso: string;
  days?: number;
  client: Sql;
}): Promise<ReadinessTrendPoint[]> {
  const days = params.days ?? TREND_DAYS;
  const fromIso = isoDateString(addDays(parseIsoDate(params.iso), -(days - 1)));
  const rows = await params.client<Array<{ recorded_for: string; score: number }>>`
    select to_char(recorded_for, 'YYYY-MM-DD') as recorded_for, score
    from athlete_daily_readiness_snapshots
    where athlete_id = ${params.athlete_id as number}
      and recorded_for >= ${fromIso}::date
      and recorded_for <= ${params.iso}::date
    order by recorded_for asc
  `;
  return rows.map((r) => ({ recorded_for: r.recorded_for, score: r.score }));
}

/**
 * The athlete's OWN readiness for today — computed FRESH from the live inputs
 * (biometrics + check-in) on every read, persisted via the compute's upsert so
 * the stored snapshot coach surfaces read can never lag the athlete's own view,
 * plus `trend` — the last-7-day score series for the sheet's mini chart.
 *
 * Why compute-on-read and not read-the-stored-row: snapshots have no daily
 * scheduler — a stored row only exists when something computed it. Reading
 * "latest ≤ today" froze the sheet on whatever day computed last (the 16-jul
 * frozen-sheet bug: an 11-day-old rhr-only snapshot shown as current while
 * fresh sleep/HRV sat in biometric_streams). The compute is a handful of
 * indexed reads + one upsert — fine at athlete-read frequency.
 *
 * When today has NO signal at all the compute returns null and we fall back to
 * the stored latest (dated honestly as the day it was computed for); with no
 * history either, null → the app's "Sin datos" empty state. The coach batch
 * readers keep using `getLatestReadiness` untouched.
 */
export async function getAthleteReadinessToday(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  const client = params.client;
  const tz = await loadAthleteTimezone(client, params.athlete_id);
  const iso = zonedDayString(params.on_date ?? new Date(), tz);

  let snap: DailyReadinessSnapshot | null = null;
  try {
    snap = await computeAthleteDailyReadiness({
      athlete_id: params.athlete_id,
      recorded_for: iso,
      timezone: tz,
      client,
    });
  } catch {
    // best-effort — fall back to the stored read below.
  }
  if (!snap) {
    snap = await getLatestReadiness({
      athlete_id: params.athlete_id,
      ...(params.on_date ? { on_date: params.on_date } : {}),
      client,
    });
  }
  if (!snap) return null;
  const trend = await getReadinessTrend({ athlete_id: params.athlete_id, iso, client });
  return { ...snap, trend };
}

/**
 * Data-arrival hook: recompute-and-persist TODAY's snapshot (athlete-local day)
 * after a HealthKit batch or a check-in lands, so stored-snapshot readers (the
 * coach roster/resumen/attention sweep) reflect the data that just arrived
 * without waiting for the athlete to open the app. Best-effort by design —
 * ingest must never fail because scoring did.
 */
export async function refreshAthleteReadinessToday(params: {
  athlete_id: number | bigint;
  now?: Date;
  client: Sql;
}): Promise<void> {
  try {
    const tz = await loadAthleteTimezone(params.client, params.athlete_id);
    await computeAthleteDailyReadiness({
      athlete_id: params.athlete_id,
      recorded_for: zonedDayString(params.now ?? new Date(), tz),
      timezone: tz,
      client: params.client,
    });
  } catch {
    // best-effort — a scoring hiccup must not break the ingest path.
  }
}

/**
 * Batched `getLatestReadiness` for a cohort — the roster/resumen reader, so coach
 * surfaces show the SAME compute-on-miss score the athlete's own surface does (no
 * raw `select score limit 1` that reads '—' where a live score exists), without
 * an N+1. One indexed read returns the latest snapshot (recorded_for <= today,
 * the same future-guard as the single getter) per athlete; athletes with NO
 * snapshot are computed-on-miss individually (best-effort) — which after the first
 * pass is zero, so steady-state is a single query. Returns a Map keyed by
 * athlete_id string.
 */
export async function getLatestReadinessBatch(params: {
  athlete_ids: Array<number | bigint>;
  on_date?: Date;
  client: Sql;
}): Promise<Map<string, DailyReadinessSnapshot>> {
  const client = params.client;
  const out = new Map<string, DailyReadinessSnapshot>();
  const ids = Array.from(new Set(params.athlete_ids.map((x) => Number(x))));
  if (ids.length === 0) return out;
  const now = params.on_date ?? new Date();

  // Per-athlete IANA tz (fallback box tz) so each athlete's "today" and compute
  // windows use their own calendar day — one query, no N+1.
  const tzRows = await client<Array<{ id: string; timezone: string | null }>>`
    select id::text as id, timezone from athletes where id = any(${ids}::bigint[])
  `;
  const tzById = new Map<string, string>();
  for (const r of tzRows) tzById.set(r.id, r.timezone ?? LAUNCH_FALLBACK_TIMEZONE);

  // The snapshot read's future-guard is coarse (a snapshot can only be for a past or
  // current day), so resolving "today" in the box tz here is fine and keeps it one query.
  const guardIso = zonedDayString(now, LAUNCH_FALLBACK_TIMEZONE);

  const rows = await client<
    Array<{ athlete_id: string; recorded_for: string; score: number; breakdown_json: unknown }>
  >`
    select distinct on (athlete_id)
      athlete_id::text as athlete_id,
      to_char(recorded_for, 'YYYY-MM-DD') as recorded_for,
      score,
      breakdown_json
    from athlete_daily_readiness_snapshots
    where athlete_id = any(${ids}::bigint[])
      and recorded_for <= ${guardIso}::date
    order by athlete_id, recorded_for desc
  `;
  for (const r of rows) {
    out.set(r.athlete_id, {
      athlete_id: r.athlete_id,
      recorded_for: r.recorded_for,
      score: r.score,
      breakdown: readBreakdown(r.breakdown_json),
      delta_7d: null,
    });
  }

  for (const id of ids) {
    if (out.has(String(id))) continue;
    const tz = tzById.get(String(id)) ?? LAUNCH_FALLBACK_TIMEZONE;
    try {
      const snap = await computeAthleteDailyReadiness({
        athlete_id: id,
        recorded_for: zonedDayString(now, tz),
        timezone: tz,
        client,
      });
      if (snap) out.set(String(id), snap);
    } catch {
      // best-effort compute-on-miss — a bad athlete just stays absent ('—').
    }
  }
  return out;
}

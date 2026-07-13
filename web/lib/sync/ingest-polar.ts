// Polar AccessLink webhook ingest — REAL implementation.
//
// A Polar webhook NOTIFIES that new data exists; it never carries the data. The
// route (app/api/polar/webhook) has already authenticated the request and
// resolved the Polar user id → athlete_id, then hands us the parsed body. We
// switch on the event, FETCH the referenced entity from AccessLink with the
// athlete's stored token, and map it into the SAME tables ingest-garmin writes,
// with the SAME data-integrity guards. Precedence, matching and idempotency are
// deliberately identical to ingest-garmin.ts (read it side-by-side): Garmin and
// manual entries are authoritative and never clobbered; a passive Polar import
// never files a phantom second execution over a session already accounted for.
//
// Events handled:
//   * EXERCISE → workout_executions (matched to the day's assignment) + an `hr`
//     biometric_streams row (the exercise AVERAGE — same single-value fidelity
//     Garmin/HealthKit store; we do NOT synthesise a dense per-second series) +
//     ONE whole-session segment_executions row carrying the modality + native
//     pace so a Polar run/erg is visible to the run-vs-row analytics (the exact
//     purpose of the segment modality columns). Polar summaries expose no laps
//     (splits need TCX parsing) — that finer per-split breakdown is a follow-up.
//   * SLEEP → sleep_duration + sleep_score, and — because Polar has NO nightly
//     recharge webhook — we ALSO pull that night's nightly recharge (recovery +
//     hrv) for the same date, the only moment both are freshly available.
// Other event types (CONTINUOUS_HEART_RATE, ACTIVITY_SUMMARY, …) are ignored.
//
// Idempotency: re-delivery of the same webhook is a no-op — biometric_streams
// dedupe on (athlete, source='polar', metric, source_workout_id, recorded_at);
// executions on the (assignment, source, ref) guard; the whole-session segment is
// delete-then-insert scoped to source='polar'.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { markAssignmentDoneFromDevice } from '@/lib/sync/assignment-status';
import { existsOverlappingExecution } from '@/lib/sync/execution-time-dedupe';
import { deriveLapIntensity } from '@/lib/garmin/lap-mapping';
import { polarSportToModality } from '@/lib/polar/sport-mapping';
import { parseIso8601DurationSeconds, polarStartToUtcIso } from '@/lib/polar/parse';
import {
  AccessLinkClient,
  type PolarReadClient,
  type PolarExercise,
} from '@/lib/polar/accesslink';
import { loadPolarConfig } from '@/lib/polar/config';
import {
  loadWearableConnection,
  updateWearableTokens,
  markConnectionStatus,
} from '@/lib/wearables/token-store';

const POLAR_SOURCE = 'polar';

// Test seam: inject a fake read client + sql. Production passes neither and we
// build a real client from the athlete's stored connection.
export type IngestPolarDeps = {
  sql?: Sql;
  client?: PolarReadClient;
};

/**
 * Ingest a single Polar AccessLink webhook payload for the given athlete.
 *
 * @param athlete_id resolved by the webhook route (findConnectionByProviderUser)
 * @param payload    the parsed Polar webhook body ({ event, entity_id|date, … })
 */
export async function ingestPolar(
  athlete_id: bigint,
  payload: unknown,
  deps?: IngestPolarDeps,
): Promise<void> {
  const sql = deps?.sql ?? defaultSql;
  const evt = readEvent(payload);
  if (!evt) return;

  // Only stand up a client (and hit the network) for events we actually map.
  if (evt.event !== 'EXERCISE' && evt.event !== 'SLEEP') return;

  const client = deps?.client ?? (await buildAthletePolarClient(athlete_id, sql));
  if (!client) return; // no usable connection (revoked / missing tokens)

  if (evt.event === 'EXERCISE') {
    if (!evt.entity_id) return;
    await ingestExercise(sql, athlete_id, evt.entity_id, client);
    return;
  }
  // SLEEP
  if (!evt.date) return;
  await ingestSleepAndRecharge(sql, athlete_id, evt.date, client);
}

// ── event parsing ────────────────────────────────────────────────────────────

type PolarEvent = { event: string; entity_id?: string; date?: string };

function readEvent(payload: unknown): PolarEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  const event = typeof o.event === 'string' ? o.event : null;
  if (!event) return null;
  return {
    event,
    entity_id: typeof o.entity_id === 'string' ? o.entity_id : undefined,
    date: typeof o.date === 'string' ? o.date : undefined,
  };
}

// ── EXERCISE ─────────────────────────────────────────────────────────────────

async function ingestExercise(
  sql: Sql,
  athlete_id: bigint,
  exerciseId: string,
  client: PolarReadClient,
): Promise<void> {
  const ex = await client.getExercise(exerciseId);
  if (!ex || !ex.id) return;

  const startedAt = polarStartToUtcIso(ex.start_time, ex.start_time_utc_offset);
  if (!startedAt) return;
  const durationS = parseIso8601DurationSeconds(ex.duration) ?? 0;
  const endedAt =
    durationS > 0
      ? new Date(Date.parse(startedAt) + durationS * 1000).toISOString()
      : startedAt;
  const externalId = ex.id;

  // Average HR as a single stream row (mirrors Garmin/HealthKit fidelity). This
  // ingests regardless of assignment matching and is deduped independently.
  await insertPolarStream({
    sql,
    athlete_id,
    ts: startedAt,
    metric: 'hr',
    value: ex.heart_rate?.average,
    unit: 'bpm',
    sourceId: externalId,
    raw: ex,
  });

  // TIME-WINDOW DE-DUPE (shared guard): if any execution already overlaps this
  // window, the session is accounted for — do NOT file an execution or flip an
  // assignment (a manual/phone log or an earlier HK/Garmin sync owns it).
  if (await existsOverlappingExecution(sql, athlete_id, startedAt, endedAt)) return;

  // Match the day's assignment; tiebreak id desc for determinism on multi-workout
  // days (identical to ingest-garmin).
  const day = startedAt.slice(0, 10);
  const rows = await sql<
    { id: string; existing_source: string | null; existing_ref: string | null }[]
  >`
    select wa.id::text as id,
           we.source::text as existing_source,
           we.source_workout_ref as existing_ref
    from workout_assignments wa
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
    order by wa.scheduled_for desc, wa.id desc
    limit 1
  `;
  const assign = rows[0];
  if (!assign) return; // no assignment that day → hr stream stored, no execution (like Garmin)

  // Exact re-delivery of THIS Polar exercise → no-op.
  if (assign.existing_source === POLAR_SOURCE && assign.existing_ref === externalId) return;

  // UPSERT actuals. Precedence mirrors Garmin: never clobber an authoritative
  // 'garmin' or 'manual' row; DO fill over a passive 'healthkit' one; latest
  // Polar wins over an earlier Polar row for the same assignment.
  await sql`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
      source, source_workout_ref
    ) values (
      ${assign.id}::bigint,
      ${athlete_id as unknown as number},
      ${startedAt},
      ${endedAt},
      ${durationS},
      ${POLAR_SOURCE},
      ${externalId}
    )
    on conflict (assignment_id) do update
      set started_at = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.started_at
            else excluded.started_at
          end,
          ended_at = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.ended_at
            else excluded.ended_at
          end,
          total_duration_seconds = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.total_duration_seconds
            else excluded.total_duration_seconds
          end,
          source = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.source
            else excluded.source
          end,
          source_workout_ref = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.source_workout_ref
            else excluded.source_workout_ref
          end,
          updated_at = now()
  `;

  // Close the loop: a synced Polar workout proves the session was done. Guarded to
  // never overwrite a manual/coach decision (helper flips only 'scheduled').
  await markAssignmentDoneFromDevice(sql, assign.id, athlete_id);

  // Only touch segments when WE own the execution now (i.e. we didn't preserve a
  // garmin/manual row). If a garmin/manual execution stood, leave its segments.
  const owned = await sql<{ id: string; source: string | null }[]>`
    select id::text, source::text as source
    from workout_executions where assignment_id = ${assign.id}::bigint
    limit 1
  `;
  const exec = owned[0];
  if (exec && exec.source === POLAR_SOURCE) {
    await writeWholeSessionSegment({
      sql,
      execId: exec.id,
      startedAt,
      endedAt,
      durationS,
      ex,
    });
  }
}

// One whole-session segment per Polar exercise: the honest aggregate Polar gives
// (total distance/duration + avg/max HR), tagged with the mapped modality so the
// coach run-vs-row breakdown counts it. NOT lap density — a single position-0 row.
// Skipped when the sport doesn't map to a modality (we don't assert one we can't
// derive). Delete-then-insert scoped to source='polar' keeps re-delivery clean and
// never disturbs iOS/Garmin segments (which can't coexist here — the overlap guard
// above means a polar-owned execution has no competing segment source).
async function writeWholeSessionSegment(args: {
  sql: Sql;
  execId: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  ex: PolarExercise;
}): Promise<void> {
  const { sql, execId, startedAt, endedAt, durationS, ex } = args;
  const modality = polarSportToModality(ex.detailed_sport_info, ex.sport);
  if (!modality) return;

  const intensity = deriveLapIntensity({
    modality,
    distance_meters: ex.distance,
    duration_seconds: durationS,
  });

  await sql`delete from segment_executions where execution_id = ${execId}::bigint and source = ${POLAR_SOURCE}`;
  await sql`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, avg_hr, max_hr,
      modality, avg_pace_s_per_km, avg_pace_s_per_500m,
      avg_power_w, stroke_rate_spm, run_cadence_spm, source,
      raw_lap_data_json
    ) values (
      ${execId}::bigint, 0, ${startedAt}, ${endedAt},
      ${ex.distance ?? null},
      ${ex.heart_rate?.average ?? null},
      ${ex.heart_rate?.maximum ?? null},
      ${modality},
      ${intensity.avg_pace_s_per_km},
      ${intensity.avg_pace_s_per_500m},
      ${intensity.avg_power_w},
      ${intensity.stroke_rate_spm},
      ${intensity.run_cadence_spm},
      ${POLAR_SOURCE},
      ${JSON.stringify(ex)}::jsonb
    )
  `;
}

// ── SLEEP (+ nightly recharge for the same date) ─────────────────────────────

async function ingestSleepAndRecharge(
  sql: Sql,
  athlete_id: bigint,
  date: string,
  client: PolarReadClient,
): Promise<void> {
  const sleep = await client.getSleep(date);
  if (sleep) {
    // recorded_at: the actual sleep-start instant when present, else the night's
    // date at UTC midnight (a stable per-night anchor for dedupe).
    const ts = isoOrNull(sleep.sleep_start_time) ?? `${date}T00:00:00.000Z`;
    const totalSleepS = totalSleepSeconds(sleep);
    await insertPolarStream({
      sql, athlete_id, ts, metric: 'sleep_duration', value: totalSleepS, unit: 'seconds',
      sourceId: `sleep:${date}`, raw: sleep,
    });
    await insertPolarStream({
      sql, athlete_id, ts, metric: 'sleep_score', value: sleep.sleep_score, unit: 'score',
      sourceId: `sleep:${date}`, raw: sleep,
    });
  }

  // Nightly recharge has no webhook of its own — it becomes available with the
  // night's sleep, so we pull it here. Absent for a given night → null (skip).
  const recharge = await client.getNightlyRecharge(date);
  if (recharge) {
    const ts = `${date}T00:00:00.000Z`;
    await insertPolarStream({
      sql, athlete_id, ts, metric: 'recovery', value: recharge.nightly_recharge_status, unit: 'score',
      sourceId: `recharge:${date}`, raw: recharge,
    });
    await insertPolarStream({
      sql, athlete_id, ts, metric: 'hrv', value: recharge.heart_rate_variability_avg, unit: 'ms',
      sourceId: `recharge:${date}`, raw: recharge,
    });
    await insertPolarStream({
      sql, athlete_id, ts, metric: 'hr_resting', value: recharge.heart_rate_avg, unit: 'bpm',
      sourceId: `recharge:${date}`, raw: recharge,
    });
  }
}

function totalSleepSeconds(s: {
  light_sleep?: number;
  deep_sleep?: number;
  rem_sleep?: number;
  unrecognized_sleep_stage?: number;
  sleep_start_time?: string;
  sleep_end_time?: string;
}): number | undefined {
  const parts = [s.light_sleep, s.deep_sleep, s.rem_sleep, s.unrecognized_sleep_stage].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (parts.length > 0) return parts.reduce((a, b) => a + b, 0);
  // Fallback: span between start and end when stage durations are missing.
  const start = s.sleep_start_time ? Date.parse(s.sleep_start_time) : NaN;
  const end = s.sleep_end_time ? Date.parse(s.sleep_end_time) : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.round((end - start) / 1000);
  }
  return undefined;
}

function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ── biometric_streams insert (source='polar') ───────────────────────────────
// Mirrors ingest-garmin insertStream: app-level dedupe (there is no unique index)
// keyed on the stable source id + recorded_at.
async function insertPolarStream(args: {
  sql: Sql;
  athlete_id: bigint;
  ts: string;
  metric: string;
  value: number | null | undefined;
  unit: string;
  sourceId: string;
  raw: unknown;
}): Promise<void> {
  const { sql, athlete_id, ts, metric, value, unit, sourceId, raw } = args;
  if (value == null || !Number.isFinite(value)) return;

  const dup = await sql<{ id: string }[]>`
    select id::text from biometric_streams
    where athlete_id = ${athlete_id as unknown as number}
      and source = ${POLAR_SOURCE}
      and metric_type = ${metric}::biometric_metric
      and source_workout_id = ${sourceId}
      and recorded_at = ${ts}
    limit 1
  `;
  if (dup.length > 0) return;

  await sql`
    insert into biometric_streams (
      athlete_id, source, source_workout_id, metric_type, recorded_at,
      value_numeric, unit, raw_payload_json
    ) values (
      ${athlete_id as unknown as number},
      ${POLAR_SOURCE},
      ${sourceId},
      ${metric}::biometric_metric,
      ${ts},
      ${value},
      ${unit},
      ${JSON.stringify(raw)}::jsonb
    )
  `;
}

// ── client factory (production path) ─────────────────────────────────────────
// Build an AccessLink client bound to the athlete's stored connection. Refreshed
// tokens are persisted; an unrecoverable auth failure flips the connection to
// 'error'. Returns null when there is no usable connection.
async function buildAthletePolarClient(
  athlete_id: bigint,
  sql: Sql,
): Promise<PolarReadClient | null> {
  const cfg = loadPolarConfig();
  if (!cfg.ok) return null;

  const conn = await loadWearableConnection({ athlete_id, provider: POLAR_SOURCE, client: sql });
  if (!conn) return null;

  return new AccessLinkClient({
    apiBase: cfg.config.apiBase,
    tokenEndpoint: cfg.config.tokenEndpoint,
    clientId: cfg.config.clientId,
    clientSecret: cfg.config.clientSecret,
    tokens: {
      access_token: conn.access_token,
      refresh_token: conn.refresh_token ?? null,
      expires_at: conn.expires_at ?? null,
    },
    onTokensRefreshed: async (t) => {
      await updateWearableTokens({
        athlete_id,
        provider: POLAR_SOURCE,
        tokens: {
          access_token: t.access_token,
          refresh_token: t.refresh_token ?? null,
          expires_at: t.expires_at ?? null,
          scopes: conn.scopes ?? null,
        },
        client: sql,
      });
    },
    onAuthError: async () => {
      await markConnectionStatus({ athlete_id, provider: POLAR_SOURCE, status: 'error', client: sql });
    },
  });
}

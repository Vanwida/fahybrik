// Garmin Health Activity API webhook ingest pipeline.
//
// Handles the union of summary types Garmin pushes:
//   * dailies         → biometric_streams (steps, hr_resting, calories, body_battery, stress)
//   * sleeps          → biometric_streams (sleep_duration, sleep_score) + sleep_stages payload
//   * activities      → workout_executions (preferred over HK if HK already filed) + biometric_streams (avg HR)
//   * activityDetails → segment_executions lap data when present
//   * stressDetails   → biometric_streams (stress)
//   * bodyComps       → biometric_streams (weight, body_fat)
//   * heartRateVariabilities → biometric_streams (hrv)
//   * userMetrics     → biometric_streams (vo2max)
//
// Authoritative source for workout_executions when both HK and Garmin arrive
// for the same workout: Garmin wins (higher lap fidelity per spec).
//
// Idempotency: every insert is guarded by an existence check on
// (athlete_id, source='garmin', external_id). external_id is summaryId or
// activityId, falling back to startTimeInSeconds when missing.
//
// LAS VUELTAS NO BORRAN NADA. Esto borraba los tramos de la ejecución antes de
// reescribir los suyos, y se llevaba por delante lo que el reloj no sabe medir:
// los `zone_seconds` que congela el móvil, las filas de `segment_zone_seconds` y
// `set_executions` (cuelgan con `on delete cascade`), la atribución de la serie y
// el enlace a la prescripción. Ahora se FUSIONA por precedencia de campo —
// `planSegmentFusion` decide y `fuseDeviceLaps` escribe— con las tres reglas del
// modelo: la identidad no se destruye, el troceado lo manda quien midió los
// tramos, y las vueltas casan por tiempo, nunca por ordinal.

import type { Sql } from '@/lib/db';
import { coerceJson, toJsonValue } from '@/lib/json-column';
import { findOverlappingExecution } from '@/lib/sync/execution-time-dedupe';
import { fuseDeviceLaps, type DeviceLapRow } from '@/lib/sync/fuse-device-laps';
import { deriveLapIntensity, garminActivityToModality } from '@/lib/garmin/lap-mapping';

// Con qué firma Garmin sus filas de tramo. Es también la llave con la que la
// fusión distingue lo que midió la app de lo que trajo el reloj.
const GARMIN_SEGMENT_SOURCE = 'garmin';

export type GarminSummary = {
  userId?: string;
  userAccessToken?: string;
  summaryId?: string;
  activityId?: string | number;
  activityType?: string;
  startTimeInSeconds?: number;
  startTimeOffsetInSeconds?: number;
  durationInSeconds?: number;
  durationInMillis?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  restingHeartRateInBeatsPerMinute?: number;
  activeKilocalories?: number;
  steps?: number;
  vo2Max?: number;
  bodyBatteryChargedValue?: number;
  bodyBatteryDrainedValue?: number;
  averageStressLevel?: number;
  weightInGrams?: number;
  bodyFatInPercent?: number;
  lastNightAvg?: number;        // HRV
  laps?: GarminLap[];
  // Sleep stages (Garmin returns durations in seconds per stage).
  deepSleepDurationInSeconds?: number;
  lightSleepDurationInSeconds?: number;
  remSleepInSeconds?: number;
  awakeDurationInSeconds?: number;
  sleepScoreValue?: number;
};

export type GarminLap = {
  startTimeInSeconds?: number;
  totalDistanceInMeters?: number;
  timerDurationInSeconds?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  // Erg/cycling intensity signals Garmin emits per lap (when the device
  // supports them). Used to populate segment_executions pace/power/stroke-rate
  // (migration 0045) per-modality.
  averagePowerInWatts?: number;
  averageBikeCadenceInRoundsPerMinute?: number;
  averageRunCadenceInStepsPerMinute?: number;
  averageStrokeRateInStrokesPerMinute?: number;
  // activityType may also appear per-lap on multisport summaries; otherwise the
  // parent summary's activityType is used.
  activityType?: string;
};

export type GarminPayload = {
  dailies?: GarminSummary[];
  activities?: GarminSummary[];
  activityDetails?: GarminSummary[];
  sleeps?: GarminSummary[];
  stressDetails?: GarminSummary[];
  bodyComps?: GarminSummary[];
  heartRateVariabilities?: GarminSummary[];
  userMetrics?: GarminSummary[];
};

export type GarminIngestResult = {
  inserted_streams: number;
  inserted_activities: number;
  inserted_lap_segments: number;
  skipped_unknown_athlete: number;
  skipped_duplicate: number;
};

export async function ingestGarminPayload(args: {
  sql: Sql;
  payload: GarminPayload;
  resolveAthlete: (userAccessToken: string) => Promise<bigint | null>;
  rawBody: string;
}): Promise<GarminIngestResult> {
  const { sql, payload, resolveAthlete, rawBody } = args;
  const result: GarminIngestResult = {
    inserted_streams: 0,
    inserted_activities: 0,
    inserted_lap_segments: 0,
    skipped_unknown_athlete: 0,
    skipped_duplicate: 0,
  };

  const handle = async (s: GarminSummary, fn: (athlete_id: bigint) => Promise<void>) => {
    if (!s.userAccessToken) {
      result.skipped_unknown_athlete += 1;
      return;
    }
    const athlete_id = await resolveAthlete(s.userAccessToken);
    if (!athlete_id) {
      result.skipped_unknown_athlete += 1;
      return;
    }
    await fn(athlete_id);
  };

  for (const d of payload.dailies ?? []) {
    await handle(d, async (athlete_id) => {
      const ts = secondsToIso(d.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'hr_resting', value: d.restingHeartRateInBeatsPerMinute, unit: 'bpm',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'steps', value: d.steps, unit: 'count',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'calories_active', value: d.activeKilocalories, unit: 'kcal',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'body_battery', value: d.bodyBatteryChargedValue, unit: 'pct',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'stress', value: d.averageStressLevel, unit: 'pct',
        externalId: d.summaryId, raw: rawBody,
      });
    });
  }

  for (const s of payload.sleeps ?? []) {
    await handle(s, async (athlete_id) => {
      const ts = secondsToIso(s.startTimeInSeconds);
      if (!ts) return;
      const dur = s.durationInMillis ? s.durationInMillis / 1000 : s.durationInSeconds;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'sleep_duration', value: dur, unit: 'seconds',
        externalId: s.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'sleep_score', value: s.sleepScoreValue, unit: 'pct',
        externalId: s.summaryId, raw: rawBody,
      });
    });
  }

  for (const h of payload.heartRateVariabilities ?? []) {
    await handle(h, async (athlete_id) => {
      const ts = secondsToIso(h.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'hrv', value: h.lastNightAvg, unit: 'ms',
        externalId: h.summaryId, raw: rawBody,
      });
    });
  }

  for (const u of payload.userMetrics ?? []) {
    await handle(u, async (athlete_id) => {
      const ts = secondsToIso(u.startTimeInSeconds) ?? new Date().toISOString();
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'vo2max', value: u.vo2Max, unit: 'ml_kg_min',
        externalId: u.summaryId, raw: rawBody,
      });
    });
  }

  for (const b of payload.bodyComps ?? []) {
    await handle(b, async (athlete_id) => {
      const ts = secondsToIso(b.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'weight',
        value: b.weightInGrams ? b.weightInGrams / 1000 : undefined, unit: 'kg',
        externalId: b.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'body_fat', value: b.bodyFatInPercent, unit: 'pct',
        externalId: b.summaryId, raw: rawBody,
      });
    });
  }

  for (const st of payload.stressDetails ?? []) {
    await handle(st, async (athlete_id) => {
      const ts = secondsToIso(st.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'stress', value: st.averageStressLevel, unit: 'pct',
        externalId: st.summaryId, raw: rawBody,
      });
    });
  }

  // Activities: prefer Garmin over HK. Insert/update workout_executions
  // when an assignment exists for the day.
  const activities = [...(payload.activities ?? []), ...(payload.activityDetails ?? [])];
  for (const a of activities) {
    await handle(a, async (athlete_id) => {
      const externalId = String(a.activityId ?? a.summaryId ?? a.startTimeInSeconds ?? '');
      const ts = secondsToIso(a.startTimeInSeconds);
      if (!ts || !externalId) return;

      const inserted = await ingestGarminActivity({
        sql, athlete_id, summary: a, externalId, rawBody,
      });
      if (inserted.executionInserted) result.inserted_activities += 1;
      result.inserted_lap_segments += inserted.lapsInserted;
      result.inserted_streams += inserted.streamsInserted;
    });
  }

  return result;
}

async function ingestGarminActivity(args: {
  sql: Sql;
  athlete_id: bigint;
  summary: GarminSummary;
  externalId: string;
  rawBody: string;
}): Promise<{ executionInserted: boolean; lapsInserted: number; streamsInserted: number }> {
  const { sql, athlete_id, summary, externalId, rawBody } = args;
  const startedAt = secondsToIso(summary.startTimeInSeconds)!;
  const endedAt = summary.durationInSeconds
    ? new Date(((summary.startTimeInSeconds ?? 0) + summary.durationInSeconds) * 1000).toISOString()
    : startedAt;

  let streamsInserted = 0;
  streamsInserted += await insertStream({
    sql, athlete_id, ts: startedAt, metric: 'hr',
    value: summary.averageHeartRateInBeatsPerMinute, unit: 'bpm',
    externalId, raw: rawBody, source_workout_id: externalId,
  });

  // Las vueltas del reloj, normalizadas a nuestro vocabulario UNA vez: los tres
  // caminos de abajo funden exactamente lo mismo.
  const laps = buildGarminLaps(summary, startedAt);

  // ¿Esta actividad YA está archivada? Entonces la ejecución es suya: no se
  // archiva otra ni se toca el assignment, solo se funden sus vueltas. Sustituye
  // al viejo corte seco por (source='garmin' + ref igual), que devolvía sin mirar
  // los tramos — y por eso el `activityDetails` que llega DESPUÉS del `activities`
  // (que es como manda Garmin: el resumen primero, el detalle con las vueltas
  // después) perdía todas sus vueltas por el camino.
  const filed = await sql<{ id: string }[]>`
    select id::text from workout_executions
    where athlete_id = ${athlete_id as unknown as number}
      and source_workout_ref = ${externalId}
    limit 1
  `;
  if (filed[0]) {
    const fused = await fuseGarminLaps(sql, filed[0].id, laps, true);
    return { executionInserted: false, lapsInserted: fused, streamsInserted };
  }

  // TIME-WINDOW DE-DUPE (core data-integrity guard, shared helper — mirrors
  // HealthKit). If the athlete already has ANY execution whose window intersects
  // this activity's [started_at, ended_at], the session is already accounted for
  // (a manual/phone log, or an earlier HK/Garmin sync). Skip the execution link
  // AND the assignment-complete flip so a passive Garmin import never files a
  // phantom second execution (or flips a second same-day assignment). The hr
  // stream above still ingests (deduped independently by external_id).
  //
  // Lo que SÍ cambia: hasta ahora aquí se tiraba también todo el detalle por
  // vuelta. «Ya está contada» significa que no se archiva una segunda ejecución,
  // no que el reloj no tenga nada que aportar: sus vueltas rellenan los huecos de
  // los tramos que la app midió (la FC de un tramo corrido sin pulsómetro, por
  // ejemplo). No puede crear filas ahí — la ejecución no es suya —, así que no hay
  // forma de que esto duplique volumen.
  const overlapping = await findOverlappingExecution(sql, athlete_id, startedAt, endedAt);
  if (overlapping) {
    const fused = await fuseGarminLaps(sql, overlapping.id, laps, false);
    return { executionInserted: false, lapsInserted: fused, streamsInserted };
  }

  // Try to map to an assignment for the day; create or override execution.
  // Tiebreak on id desc so the pick is deterministic on days with >=2
  // assignments (stable + testable), not order-of-insertion dependent.
  const day = startedAt.slice(0, 10);
  const rows = await sql<{ id: string }[]>`
    select wa.id::text as id
    from workout_assignments wa
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
    order by wa.scheduled_for desc, wa.id desc
    limit 1
  `;
  let executionInserted = false;
  let lapsInserted = 0;

  if (rows[0]) {
    await sql`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, source_workout_ref, recorded_via
      ) values (
        ${rows[0].id}::bigint,
        ${athlete_id as unknown as number},
        ${startedAt},
        ${endedAt},
        -- NULL, not 0: the column is nullable and a 0 on disk is permanent. A
        -- zero-second workout is indistinguishable from a real instantaneous
        -- entry, and every reader of total_duration_seconds would inherit it
        -- forever. The laps below already null every metric they do not get.
        ${summary.durationInSeconds ?? null},
        'garmin',
        ${externalId},
        -- HOW the record came to exist. This row exists because an activity landed
        -- in the athlete's Garmin account and the webhook brought it: 'imported'.
        -- A DIFFERENT question from source above (WHAT apparatus measured it) —
        -- never conflate them. A session run inside FAHYBRID is written 'live' by
        -- recordWorkoutExecution and never reaches this insert.
        'imported'::execution_recording_method
      )
      -- QUIEN SE QUEDA CON LA CABECERA. La condicion se repite en los cinco
      -- campos porque van juntos: o se conserva la ejecucion que ya estaba, o se
      -- toma entera la de Garmin. Mezclar la mitad de cada una daria una sesion
      -- que no ocurrio.
      --
      -- La comprobacion de recorded_via es la mitad que faltaba, y es la misma
      -- mina que arreglan los tramos de abajo, un piso mas arriba. La columna
      -- source responde QUE APARATO midio (mig 0144), asi que una sesion corrida
      -- en la app con un PM5 o una cinta lleva source concept2 o treadmill --
      -- ninguno de los dos entra en esta lista, y sin esta linea un entreno de
      -- Garmin del mismo dia le sobrescribia la ventana, la duracion y la
      -- procedencia a la sesion que el atleta habia hecho de verdad en la app.
      -- QUIEN REGISTRO el entreno lo dice recorded_via, no source.
      on conflict (assignment_id) do update
        set started_at = case
              when workout_executions.source in ('garmin', 'manual')
                or workout_executions.recorded_via = 'live' then workout_executions.started_at
              else excluded.started_at
            end,
            ended_at = case
              when workout_executions.source in ('garmin', 'manual')
                or workout_executions.recorded_via = 'live' then workout_executions.ended_at
              else excluded.ended_at
            end,
            total_duration_seconds = case
              when workout_executions.source in ('garmin', 'manual')
                or workout_executions.recorded_via = 'live' then workout_executions.total_duration_seconds
              else excluded.total_duration_seconds
            end,
            source = case
              when workout_executions.source in ('garmin', 'manual')
                or workout_executions.recorded_via = 'live' then workout_executions.source
              else excluded.source
            end,
            source_workout_ref = case
              when workout_executions.source in ('garmin', 'manual')
                or workout_executions.recorded_via = 'live' then workout_executions.source_workout_ref
              else excluded.source_workout_ref
            end,
            -- Existing wins: an ingest can only ADD what nobody knew. A session
            -- already stamped 'live' or 'manual' stays that way — a later device
            -- sync of the same session does not turn it into an import.
            recorded_via = coalesce(workout_executions.recorded_via, excluded.recorded_via),
            updated_at = now()
    `;
    executionInserted = true;

    // Archivo sí; Hecho no. Un activity Garmin imported no es el Guardar del atleta.
    const exec = await sql<{ id: string; ref: string | null }[]>`
      select id::text, source_workout_ref as ref
      from workout_executions
      where assignment_id = ${rows[0].id}::bigint
      limit 1
    `;
    if (exec[0]) {
      // La ejecución es de esta actividad solo si se quedó con SU referencia. Si
      // el `on conflict` de arriba conservó un registro a mano o una sesión en
      // vivo, la referencia sigue siendo la de aquélla: entonces Garmin no manda
      // en el troceado y sus vueltas se limitan a rellenar huecos.
      lapsInserted = await fuseGarminLaps(sql, exec[0].id, laps, exec[0].ref === externalId);
    }
  }

  return { executionInserted, lapsInserted, streamsInserted };
}

/**
 * Las vueltas de un resumen de Garmin, traducidas a nuestro vocabulario de tramo.
 * Una sola vez por actividad: los tres caminos de `ingestGarminActivity` funden
 * exactamente la misma lista.
 */
function buildGarminLaps(summary: GarminSummary, fallbackStart: string): DeviceLapRow[] {
  if (!summary.laps || summary.laps.length === 0) return [];
  // Modalidad de la actividad (el `activityType` de la vuelta manda en multisport).
  const activityModality = garminActivityToModality(summary.activityType);
  return summary.laps.map((lap, index) => {
    const started_at = secondsToIso(lap.startTimeInSeconds) ?? fallbackStart;
    const ended_at = lap.timerDurationInSeconds
      ? new Date(((lap.startTimeInSeconds ?? 0) + lap.timerDurationInSeconds) * 1000).toISOString()
      : started_at;
    const modality = garminActivityToModality(lap.activityType) ?? activityModality;
    // Route the two SPM-style signals to their OWN columns (mig 0124): erg
    // stroke rate / bike rpm → stroke_rate_spm; running cadence (steps/min)
    // → run_cadence_spm. A step is not a stroke, so they must not share a
    // column (the old code funnelled run cadence into stroke_rate_spm, where
    // the running analytics never saw it).
    const ergStrokeRate =
      lap.averageStrokeRateInStrokesPerMinute ?? lap.averageBikeCadenceInRoundsPerMinute;
    const intensity = deriveLapIntensity({
      modality,
      distance_meters: lap.totalDistanceInMeters,
      duration_seconds: lap.timerDurationInSeconds,
      power_w: lap.averagePowerInWatts,
      stroke_rate_spm: modality === 'run' ? null : ergStrokeRate,
      run_cadence_spm: lap.averageRunCadenceInStepsPerMinute,
    });
    return {
      index,
      started_at,
      ended_at,
      measured: {
        distance_meters: lap.totalDistanceInMeters ?? null,
        avg_hr: lap.averageHeartRateInBeatsPerMinute ?? null,
        max_hr: lap.maxHeartRateInBeatsPerMinute ?? null,
        modality: modality ?? null,
        avg_pace_s_per_km: intensity.avg_pace_s_per_km,
        avg_pace_s_per_500m: intensity.avg_pace_s_per_500m,
        avg_power_w: intensity.avg_power_w,
        stroke_rate_spm: intensity.stroke_rate_spm,
        run_cadence_spm: intensity.run_cadence_spm,
      },
      raw: toJsonValue(lap),
    };
  });
}

/** Devuelve cuántas filas de tramo tocó la fusión (nuevas + enriquecidas). */
async function fuseGarminLaps(
  sql: Sql,
  executionId: string,
  laps: readonly DeviceLapRow[],
  deviceOwnsExecution: boolean,
): Promise<number> {
  if (laps.length === 0) return 0;
  const fused = await fuseDeviceLaps({
    sql,
    executionId,
    deviceSource: GARMIN_SEGMENT_SOURCE,
    deviceOwnsExecution,
    laps,
  });
  return fused.written + fused.merged;
}

async function insertStream(args: {
  sql: Sql;
  athlete_id: bigint;
  ts: string;
  metric: string;
  value: number | null | undefined;
  unit: string;
  externalId: string | undefined;
  /** Cuerpo tal cual lo mandó Garmin (texto JSON): se guarda como OBJETO. */
  raw: string;
  source_workout_id?: string;
}): Promise<number> {
  const { sql, athlete_id, ts, metric, value, unit, externalId, raw } = args;
  if (value == null || !Number.isFinite(value)) return 0;
  const sourceWorkoutId = args.source_workout_id ?? externalId ?? null;

  if (sourceWorkoutId) {
    const dup = await sql<{ id: string }[]>`
      select id::text from biometric_streams
      where athlete_id = ${athlete_id as unknown as number}
        and source = 'garmin'
        and metric_type = ${metric}::biometric_metric
        and source_workout_id = ${sourceWorkoutId}
        and recorded_at = ${ts}
      limit 1
    `;
    if (dup.length > 0) return 0;
  } else {
    const dup = await sql<{ id: string }[]>`
      select id::text from biometric_streams
      where athlete_id = ${athlete_id as unknown as number}
        and source = 'garmin'
        and metric_type = ${metric}::biometric_metric
        and recorded_at = ${ts}
        and value_numeric = ${value}
      limit 1
    `;
    if (dup.length > 0) return 0;
  }

  await sql`
    insert into biometric_streams (
      athlete_id, source, source_workout_id, metric_type, recorded_at,
      value_numeric, unit, raw_payload_json
    ) values (
      ${athlete_id as unknown as number},
      'garmin',
      ${sourceWorkoutId},
      ${metric}::biometric_metric,
      ${ts},
      ${value},
      ${unit},
      ${sql.json(toJsonValue(coerceJson(raw)))}
    )
  `;
  return 1;
}

function secondsToIso(seconds: number | undefined | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

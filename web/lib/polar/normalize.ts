// Pure mapping: Polar v4 API shapes → the provider-neutral structs the ingest
// layer persists. No I/O — the poller fetches, this normalizes, ingest writes.
//
// Two v4 specifics handled here:
//   * SPORT is an opaque id (SportReference), not a name. The poller loads the
//     /sports/list catalogue once and passes a Map so we can resolve id → name
//     (and parent-sport name) and map that to our Modality vocabulary.
//   * LAPS live per-EXERCISE (a session may hold several exercises, each its own
//     sport). We flatten every exercise's laps into one ordered segment list,
//     each lap tagged with its exercise's modality — so a multisport session's
//     run laps and row laps land in the right analytics buckets.

import type { Modality } from '@fahybrid/shared/domain/prescription';
import { polarSportToModality } from '@/lib/polar/sport-mapping';
import { polarLocalToUtcIso, millisToSeconds, parsePolarSecondsString } from '@/lib/polar/parse';
import {
  statAvg,
  statMax,
  type V4TrainingSession,
  type V4Lap,
  type V4NightSleep,
  type V4NightlyRechargeResult,
  type V4Sport,
} from '@/lib/polar/accesslink';

const HEART_RATE = 'STATISTICS_TYPE_HEART_RATE';
const POWER = 'STATISTICS_TYPE_POWER';
const CADENCE = 'STATISTICS_TYPE_CADENCE';

export type NormalizedSegment = {
  position: number;
  startedAt: string;
  endedAt: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgHr: number | null;
  maxHr: number | null;
  modality: Modality | null;
  powerW: number | null;
  cadenceRpm: number | null; // raw cadence/rpm; routed to run vs stroke by modality in ingest
  raw: unknown;
};

export type NormalizedSession = {
  externalId: string;
  startedAt: string; // UTC ISO
  endedAt: string; // UTC ISO
  /**
   * Null when Polar sent no duration — like every other metric in this type.
   * It used to be a non-nullable `number` defaulted to 0, so an unknown
   * duration was persisted as a zero-second workout and became permanent.
   */
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  modality: Modality | null; // session-level (drives the whole-session fallback segment)
  segments: NormalizedSegment[];
  raw: unknown;
};

export type NormalizedSleep = {
  date: string;
  recordedAt: string;
  totalSleepSeconds: number | null;
  sleepScore: number | null;
  raw: unknown;
};

export type NormalizedRecharge = {
  date: string;
  recordedAt: string;
  recovery: number | null; // recoveryIndicator 1..6
  hrvMs: number | null; // meanNightlyRecoveryRmssd
  raw: unknown;
};

// id → { name, parentId } from /sports/list.
export type SportMap = Map<string, { name?: string; parentId?: string }>;

export function buildSportMap(sports: V4Sport[]): SportMap {
  const map: SportMap = new Map();
  for (const s of sports) {
    const id = s.id?.id;
    if (id) map.set(id, { name: s.name, parentId: s.parentSport?.id });
  }
  return map;
}

// Resolve a sport reference to a Modality via the catalogue, using the sport's
// own name first and its parent-sport's name as a fallback (Polar groups e.g.
// road-cycling under cycling). null when unresolvable.
export function resolveModality(sportId: string | undefined, sports: SportMap): Modality | null {
  if (!sportId) return null;
  const entry = sports.get(sportId);
  if (!entry) return null;
  const parentName = entry.parentId ? sports.get(entry.parentId)?.name : undefined;
  return polarSportToModality(entry.name, parentName);
}

export function normalizeSession(
  session: V4TrainingSession,
  sports: SportMap,
): NormalizedSession | null {
  const externalId = session.identifier?.id;
  if (!externalId) return null;
  const startedAt = polarLocalToUtcIso(session.startTime, session.timezoneOffsetMinutes);
  if (!startedAt) return null;
  const durationSeconds = millisToSeconds(session.durationMillis);
  // `endedAt` already degraded honestly (it falls back to the start rather than
  // inventing an end); the duration column now does the same instead of writing
  // a 0 that no reader can tell apart from a measurement.
  const endedAt =
    durationSeconds != null && durationSeconds > 0
      ? new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString()
      : startedAt;

  const segments: NormalizedSegment[] = [];
  let position = 0;
  for (const ex of session.exercises ?? []) {
    const exModality = resolveModality(ex.sport?.id, sports) ?? resolveModality(session.sport?.id, sports);
    const exStartUtc = polarLocalToUtcIso(
      ex.startTime,
      ex.timezoneOffsetMinutes ?? session.timezoneOffsetMinutes,
    );
    // Prefer manual laps; fall back to automatic laps.
    const laps = ex.laps?.laps?.length ? ex.laps.laps : ex.laps?.autoLaps ?? [];
    for (const lap of laps) {
      const seg = normalizeLap(lap, exStartUtc ?? startedAt, exModality, position);
      if (seg) {
        segments.push(seg);
        position += 1;
      }
    }
  }

  return {
    externalId,
    startedAt,
    endedAt,
    durationSeconds,
    distanceMeters: numOrNull(session.distanceMeters),
    calories: numOrNull(session.calories),
    avgHr: numOrNull(session.hrAvg),
    maxHr: numOrNull(session.hrMax),
    modality: resolveModality(session.sport?.id, sports),
    segments,
    raw: session,
  };
}

function normalizeLap(
  lap: V4Lap,
  exStartUtc: string,
  modality: Modality | null,
  position: number,
): NormalizedSegment | null {
  const startMs = Date.parse(exStartUtc) + (lap.splitTimeMillis ?? 0);
  const durationSeconds = millisToSeconds(lap.durationMillis);
  const startedAt = new Date(startMs).toISOString();
  const endedAt =
    durationSeconds && durationSeconds > 0
      ? new Date(startMs + durationSeconds * 1000).toISOString()
      : startedAt;
  const stats = lap.statistics?.statistics;
  return {
    position,
    startedAt,
    endedAt,
    distanceMeters: numOrNull(lap.distanceMeters),
    durationSeconds: durationSeconds ?? null,
    avgHr: numOrNull(statAvg(stats, HEART_RATE)),
    maxHr: numOrNull(statMax(stats, HEART_RATE)),
    modality,
    powerW: numOrNull(statAvg(stats, POWER)),
    cadenceRpm: numOrNull(statAvg(stats, CADENCE)),
    raw: lap,
  };
}

export function normalizeSleep(night: V4NightSleep): NormalizedSleep | null {
  const date = night.sleepDate;
  if (!date) return null;
  const ev = night.sleepEvaluation;
  const total =
    parsePolarSecondsString(ev?.asleepDuration) ??
    sumPhaseSeconds(ev?.phaseDurations);
  return {
    date,
    recordedAt: `${date}T00:00:00.000Z`,
    totalSleepSeconds: total,
    sleepScore: roundOrNull(night.sleepScore?.sleepScore),
    raw: night,
  };
}

export function normalizeRecharge(result: V4NightlyRechargeResult): NormalizedRecharge | null {
  const date = result.date;
  if (!date) return null;
  return {
    date,
    recordedAt: `${date}T00:00:00.000Z`,
    recovery: numOrNull(result.recoveryIndicator),
    hrvMs: numOrNull(result.meanNightlyRecoveryRmssd),
    raw: result,
  };
}

function sumPhaseSeconds(
  phases: { rem?: string; light?: string; deep?: string; unknown?: string } | undefined,
): number | null {
  if (!phases) return null;
  const parts = [phases.rem, phases.light, phases.deep, phases.unknown]
    .map(parsePolarSecondsString)
    .filter((v): v is number => v != null);
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null;
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function roundOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
}

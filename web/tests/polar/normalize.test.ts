// Pure unit tests for the v4 → normalized mapping (no I/O).

import { describe, expect, test } from 'vitest';
import {
  buildSportMap,
  resolveModality,
  normalizeSession,
  normalizeSleep,
  normalizeRecharge,
} from '@/lib/polar/normalize';
import type { V4Sport, V4TrainingSession } from '@/lib/polar/accesslink';

const SPORTS: V4Sport[] = [
  { id: { id: 'sp-run' }, name: 'RUNNING', parentSport: { id: 'sp-run' } },
  { id: { id: 'sp-road-cycle' }, name: 'ROAD_CYCLING', parentSport: { id: 'sp-cycle' } },
  { id: { id: 'sp-cycle' }, name: 'CYCLING', parentSport: { id: 'sp-cycle' } },
];
const sportMap = buildSportMap(SPORTS);

describe('resolveModality', () => {
  test('resolves a sport id to modality via the catalogue', () => {
    expect(resolveModality('sp-run', sportMap)).toBe('run');
  });
  test('falls back to the parent-sport name', () => {
    // road-cycling name has no direct token match here? ROAD_CYCLING contains CYCL → bike anyway.
    expect(resolveModality('sp-road-cycle', sportMap)).toBe('bike');
  });
  test('null for an unknown id', () => {
    expect(resolveModality('nope', sportMap)).toBeNull();
    expect(resolveModality(undefined, sportMap)).toBeNull();
  });
});

describe('normalizeSession', () => {
  const session: V4TrainingSession = {
    identifier: { id: 'S1' },
    startTime: '2026-07-10T08:00:00.000',
    timezoneOffsetMinutes: 120, // UTC+2 → 06:00 UTC
    durationMillis: 1_500_000, // 1500 s = 25 min
    distanceMeters: 5000,
    calories: 400,
    hrAvg: 150,
    hrMax: 175,
    sport: { id: 'sp-run' },
    exercises: [
      {
        startTime: '2026-07-10T08:00:00.000',
        timezoneOffsetMinutes: 120,
        sport: { id: 'sp-run' },
        laps: {
          laps: [
            {
              splitTimeMillis: 0,
              durationMillis: 300_000,
              distanceMeters: 1000,
              statistics: {
                statistics: [
                  { type: 'STATISTICS_TYPE_HEART_RATE', avg: 145, max: 160 },
                  { type: 'STATISTICS_TYPE_CADENCE', avg: 170 },
                ],
              },
            },
            {
              splitTimeMillis: 300_000,
              durationMillis: 300_000,
              distanceMeters: 1000,
              statistics: { statistics: [{ type: 'STATISTICS_TYPE_HEART_RATE', avg: 150, max: 165 }] },
            },
          ],
        },
      },
    ],
  };

  test('maps session-level fields to UTC + seconds', () => {
    const n = normalizeSession(session, sportMap)!;
    expect(n.externalId).toBe('S1');
    expect(n.startedAt).toBe('2026-07-10T06:00:00.000Z');
    expect(n.endedAt).toBe('2026-07-10T06:25:00.000Z');
    expect(n.durationSeconds).toBe(1500);
    expect(n.distanceMeters).toBe(5000);
    expect(n.avgHr).toBe(150);
    expect(n.maxHr).toBe(175);
    expect(n.modality).toBe('run');
  });

  test('flattens exercise laps into ordered segments with per-lap stats', () => {
    const n = normalizeSession(session, sportMap)!;
    expect(n.segments).toHaveLength(2);
    expect(n.segments[0]).toMatchObject({
      position: 0,
      startedAt: '2026-07-10T06:00:00.000Z',
      distanceMeters: 1000,
      durationSeconds: 300,
      avgHr: 145,
      maxHr: 160,
      modality: 'run',
      cadenceRpm: 170,
    });
    // Second lap starts splitTimeMillis (5 min) after the exercise start.
    expect(n.segments[1].startedAt).toBe('2026-07-10T06:05:00.000Z');
    expect(n.segments[1].avgHr).toBe(150);
  });

  test('no laps → empty segments (ingest emits a whole-session fallback)', () => {
    const noLaps: V4TrainingSession = { ...session, exercises: [{ sport: { id: 'sp-run' } }] };
    const n = normalizeSession(noLaps, sportMap)!;
    expect(n.segments).toHaveLength(0);
    expect(n.modality).toBe('run');
  });

  test('null when the id or start time is missing', () => {
    expect(normalizeSession({ startTime: '2026-07-10T08:00:00' }, sportMap)).toBeNull();
    expect(normalizeSession({ identifier: { id: 'X' } }, sportMap)).toBeNull();
  });
});

describe('normalizeSleep', () => {
  test('uses asleepDuration + rounds the score', () => {
    const n = normalizeSleep({
      sleepDate: '2026-07-10',
      sleepScore: { sleepScore: 82.4 },
      sleepEvaluation: { asleepDuration: '27000s' },
    })!;
    expect(n).toMatchObject({
      date: '2026-07-10',
      recordedAt: '2026-07-10T00:00:00.000Z',
      totalSleepSeconds: 27000,
      sleepScore: 82,
    });
  });

  test('falls back to summing phase durations', () => {
    const n = normalizeSleep({
      sleepDate: '2026-07-10',
      sleepEvaluation: { phaseDurations: { rem: '1000s', light: '2000s', deep: '3000s', unknown: '500s' } },
    })!;
    expect(n.totalSleepSeconds).toBe(6500);
  });

  test('null without a date', () => {
    expect(normalizeSleep({})).toBeNull();
  });
});

describe('normalizeRecharge', () => {
  test('maps recovery + hrv', () => {
    const n = normalizeRecharge({ date: '2026-07-10', recoveryIndicator: 4, meanNightlyRecoveryRmssd: 68 })!;
    expect(n).toMatchObject({ recovery: 4, hrvMs: 68, recordedAt: '2026-07-10T00:00:00.000Z' });
  });
  test('null without a date', () => {
    expect(normalizeRecharge({})).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import {
  BOX_TIMEZONE,
  isoDateString,
  mondayOfWeek,
  mondayOfWeekInBox,
  startOfDayInBox,
  startOfDayUtc,
} from '@fahybrid/shared/domain/dates';

// M17 — timezone bug. Day/week resolution for the coach's "today" must be
// interpreted in the box timezone (Europe/Madrid), not UTC. Timestamps stay UTC;
// only the wall-clock-instant → calendar-day step is box-local.
describe('box timezone constant', () => {
  test('box is Europe/Madrid (single-coach Barcelona)', () => {
    expect(BOX_TIMEZONE).toBe('Europe/Madrid');
  });
});

describe('startOfDayInBox', () => {
  // Late evening in Barcelona, winter (CET = UTC+1). 23:30 local Madrid on
  // 2026-01-15 is 22:30Z the *same* UTC day — but the day must read as the 15th
  // regardless of how UTC rounds.
  test('23:30 CET resolves to the local Madrid day, not the UTC instant day', () => {
    const instant = new Date('2026-01-15T22:30:00.000Z'); // 23:30 Madrid (CET)
    expect(isoDateString(startOfDayInBox(instant))).toBe('2026-01-15');
  });

  // Summer (CEST = UTC+2). 23:30 local Madrid on 2026-07-15 is 21:30Z the same day.
  test('23:30 CEST resolves to the local Madrid day', () => {
    const instant = new Date('2026-07-15T21:30:00.000Z'); // 23:30 Madrid (CEST)
    expect(isoDateString(startOfDayInBox(instant))).toBe('2026-07-15');
  });

  // The genuine cross-boundary case for Madrid (always ahead of UTC): early
  // morning local time falls on the *previous* UTC day. UTC would mis-resolve to
  // the prior day; box-local must keep it on the real local day.
  test('00:30 CEST resolves to the Madrid day, where UTC would report the previous day', () => {
    const instant = new Date('2026-07-15T22:30:00.000Z'); // 00:30 on 2026-07-16 Madrid
    // Proof the bug existed: UTC rounding reports the 15th.
    expect(isoDateString(startOfDayUtc(instant))).toBe('2026-07-15');
    // The fix: box-local correctly reports the 16th.
    expect(isoDateString(startOfDayInBox(instant))).toBe('2026-07-16');
  });

  test('00:30 CET resolves to the Madrid day, not the previous UTC day', () => {
    const instant = new Date('2026-01-15T23:30:00.000Z'); // 00:30 on 2026-01-16 Madrid
    expect(isoDateString(startOfDayUtc(instant))).toBe('2026-01-15');
    expect(isoDateString(startOfDayInBox(instant))).toBe('2026-01-16');
  });

  // A UTC-midnight calendar date (the canonical serialization form) must round-trip
  // unchanged: Madrid is always ahead of UTC, so 00:00Z is still the same local day.
  test('UTC-midnight calendar date round-trips to the same day', () => {
    const canonical = new Date(Date.UTC(2026, 4, 28)); // 2026-05-28T00:00Z
    expect(isoDateString(startOfDayInBox(canonical))).toBe('2026-05-28');
  });
});

describe('mondayOfWeekInBox', () => {
  // 2026-07-16 is a Thursday → that week's Monday is 2026-07-13.
  // At 00:30 Madrid on Thursday the 16th, UTC still thinks it is Wednesday the 15th
  // (also that week), so the week happens to match here — assert it lands on the
  // correct Monday regardless.
  test('resolves the Mon–Sun week of the local Madrid day', () => {
    const instant = new Date('2026-07-15T22:30:00.000Z'); // 00:30 Thu 2026-07-16 Madrid
    expect(isoDateString(mondayOfWeekInBox(instant))).toBe('2026-07-13');
  });

  // Sunday-night → Monday boundary: the highest-stakes week-shift case. 00:30 Madrid
  // on Monday 2026-07-20 must belong to the week starting the 20th, but UTC reads it
  // as Sunday the 19th → previous week (starts the 13th). This is the wrong-week bug.
  test('Sunday→Monday boundary: box-local picks the new week where UTC picks the old one', () => {
    const instant = new Date('2026-07-19T22:30:00.000Z'); // 00:30 Mon 2026-07-20 Madrid
    expect(isoDateString(mondayOfWeek(startOfDayUtc(instant)))).toBe('2026-07-13'); // bug
    expect(isoDateString(mondayOfWeekInBox(instant))).toBe('2026-07-20'); // fixed
  });
});

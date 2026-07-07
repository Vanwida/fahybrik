// Pure unit tests for the appointment slot engine (@fahybrid/shared/domain/citas/slots).
// Timezone Europe/Madrid; July → CEST (UTC+2). Availability is all-week 17:00–19:00
// (four 30-min slots/day) unless a case narrows it.

import { describe, expect, test } from 'vitest';
import { generateSlots, isOfferedSlot, type AvailabilityWindow } from '@fahybrid/shared/domain/citas/slots';

const ALL_WEEK: AvailabilityWindow[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  start_time: '17:00',
  end_time: '19:00',
}));
const NO_BLOCKS = new Set<string>();
const NO_BUSY = new Set<number>();

// 2026-07-14 09:00Z = 11:00 Madrid → all of today's afternoon slots are still ahead.
const MORNING = new Date('2026-07-14T09:00:00Z');

describe('generateSlots', () => {
  test('14 days of availability, four slots per day, first at 17:00', () => {
    const days = generateSlots({ now: MORNING, availability: ALL_WEEK, blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY });
    expect(days.length).toBe(14);
    expect(days[0].slots.length).toBe(4);
    expect(days[0].slots.map((s) => s.time)).toEqual(['17:00', '17:30', '18:00', '18:30']);
  });

  test('no availability → empty (UI shows the honest fallback)', () => {
    expect(generateSlots({ now: MORNING, availability: [], blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY })).toEqual([]);
  });

  test('a blocked date drops that whole day', () => {
    const base = generateSlots({ now: MORNING, availability: ALL_WEEK, blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY });
    const blockedDate = base[3].date;
    const days = generateSlots({
      now: MORNING,
      availability: ALL_WEEK,
      blockedDates: new Set([blockedDate]),
      busyStartMs: NO_BUSY,
    });
    expect(days.length).toBe(13);
    expect(days.find((d) => d.date === blockedDate)).toBeUndefined();
  });

  test('a busy slot is removed (no double-booking)', () => {
    const base = generateSlots({ now: MORNING, availability: ALL_WEEK, blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY });
    const taken = base[0].slots[1]; // 17:30
    const days = generateSlots({
      now: MORNING,
      availability: ALL_WEEK,
      blockedDates: NO_BLOCKS,
      busyStartMs: new Set([taken.ms]),
    });
    expect(days[0].slots.length).toBe(3);
    expect(days[0].slots.some((s) => s.ms === taken.ms)).toBe(false);
  });

  test('slots already in the past today are dropped', () => {
    // 2026-07-14 16:15Z = 18:15 Madrid → only the 18:30 slot remains today.
    const evening = new Date('2026-07-14T16:15:00Z');
    const days = generateSlots({ now: evening, availability: ALL_WEEK, blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY });
    expect(days[0].date).toBe('2026-07-14');
    expect(days[0].slots.map((s) => s.time)).toEqual(['18:30']);
  });

  test('weekend-only availability yields slots only on Sat/Sun', () => {
    const weekendOnly = ALL_WEEK.filter((w) => w.weekday === 0 || w.weekday === 6); // Sun, Sat
    const days = generateSlots({ now: MORNING, availability: weekendOnly, blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY });
    for (const d of days) expect(d.weekday === 0 || d.weekday === 6).toBe(true);
  });
});

describe('isOfferedSlot — the server re-check against the client', () => {
  test('accepts an offered slot and rejects a fabricated one', () => {
    const days = generateSlots({ now: MORNING, availability: ALL_WEEK, blockedDates: NO_BLOCKS, busyStartMs: NO_BUSY });
    const good = days[0].slots[0].ms;
    expect(isOfferedSlot(days, good)).toBe(true);
    expect(isOfferedSlot(days, good + 7 * 60_000)).toBe(false); // 17:07 — not a slot boundary
  });
});

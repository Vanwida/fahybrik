import { describe, expect, it } from 'vitest';
import { isoDateString } from '@fahybrid/shared/domain/dates';
import { resolveAthleteWeekStart } from './week-window';

/** Sunday 30 Aug 2026, 15:00 UTC = 17:00 in Madrid. Still that Sunday. */
const DOMINGO_TARDE_UTC = new Date('2026-08-30T15:00:00.000Z');
/** Sunday 30 Aug 2026, 22:30 UTC = Monday 00:30 in Madrid. */
const DOMINGO_NOCHE_UTC_YA_LUNES = new Date('2026-08-30T22:30:00.000Z');
const SABADO = new Date('2026-08-29T15:00:00.000Z');
const LUNES = new Date('2026-08-24T10:00:00.000Z');

describe('resolveAthleteWeekStart — Calendar week, not a published-week peek', () => {
  it('on Sunday afternoon in Madrid the week is still 24–30 Aug', () => {
    const start = resolveAthleteWeekStart({ now: DOMINGO_TARDE_UTC });
    expect(isoDateString(start)).toBe('2026-08-24');
  });

  it('Saturday and Sunday of the same week share a Monday', () => {
    expect(isoDateString(resolveAthleteWeekStart({ now: SABADO }))).toBe('2026-08-24');
    expect(isoDateString(resolveAthleteWeekStart({ now: DOMINGO_TARDE_UTC }))).toBe('2026-08-24');
  });

  it('after midnight in Madrid, Sunday UTC is already next week', () => {
    const start = resolveAthleteWeekStart({ now: DOMINGO_NOCHE_UTC_YA_LUNES });
    expect(isoDateString(start)).toBe('2026-08-31');
  });

  it('week_start on Sunday snaps to that week Monday, not next Monday', () => {
    const start = resolveAthleteWeekStart({
      weekStartIso: '2026-08-30',
      now: DOMINGO_TARDE_UTC,
    });
    expect(isoDateString(start)).toBe('2026-08-24');
  });

  it('week_start of an empty next week is still that Monday', () => {
    const start = resolveAthleteWeekStart({
      weekStartIso: '2026-08-31',
      now: DOMINGO_TARDE_UTC,
    });
    expect(isoDateString(start)).toBe('2026-08-31');
  });

  it('negative week_offset is the previous Calendar week', () => {
    const start = resolveAthleteWeekStart({
      weekOffsetRaw: '-1',
      now: DOMINGO_TARDE_UTC,
    });
    expect(isoDateString(start)).toBe('2026-08-17');
  });

  it('week_offset +1 is the next Calendar week even with no workouts', () => {
    const start = resolveAthleteWeekStart({
      weekOffsetRaw: '1',
      now: LUNES,
    });
    expect(isoDateString(start)).toBe('2026-08-31');
  });

  it('week_start wins over week_offset', () => {
    const start = resolveAthleteWeekStart({
      weekStartIso: '2026-08-31',
      weekOffsetRaw: '0',
      now: DOMINGO_TARDE_UTC,
    });
    expect(isoDateString(start)).toBe('2026-08-31');
  });
});

import { describe, expect, test } from 'vitest';
import { athleteCustomEventInput } from '@fahybrid/shared/schema/events';
import { athleteTargetRaceInput } from '@fahybrid/shared/schema/races';

describe('athleteCustomEventInput', () => {
  test('rejects custom objective without start_date', () => {
    const parsed = athleteCustomEventInput.safeParse({
      name: 'Maratón de Valencia',
      type: 'running',
    });
    expect(parsed.success).toBe(false);
  });

  test('accepts custom objective with start_date', () => {
    const parsed = athleteCustomEventInput.safeParse({
      name: 'Maratón de Valencia',
      type: 'running',
      start_date: '2026-11-14',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('athleteTargetRaceInput', () => {
  test('rejects set-target without start_date', () => {
    const parsed = athleteTargetRaceInput.safeParse({
      event_id: 42,
      format: 'singles',
    });
    expect(parsed.success).toBe(false);
  });

  test('accepts set-target with athlete-confirmed start_date', () => {
    const parsed = athleteTargetRaceInput.safeParse({
      event_id: 42,
      start_date: '2026-11-14',
      format: 'singles',
    });
    expect(parsed.success).toBe(true);
  });
});

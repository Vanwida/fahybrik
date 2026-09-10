import { describe, expect, test } from 'vitest';
import { athleteCustomEventInput } from '@fahybrid/shared/schema/events';

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

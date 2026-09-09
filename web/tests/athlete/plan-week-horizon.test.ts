import { describe, expect, it } from 'vitest';
import { maxWeekOffset } from '@fahybrid/shared/domain/coach/plan-week-horizon';
import { freeAthletePlanVisibility } from '@/lib/athlete/plan-week-visibility';

describe('plan week visibility — free athlete', () => {
  it('has max offset 0 and no club horizon', () => {
    const v = freeAthletePlanVisibility();
    expect(v.max_week_offset).toBe(0);
    expect(v.horizon).toBeNull();
    expect(v.peek_blocked_by_horizon).toBe(false);
    expect(v.wall_message).toBeNull();
  });
});

describe('plan week visibility — has_next_week gate', () => {
  it('allows peek only when content exists and offset+1 <= max', () => {
    const max = maxWeekOffset('two_weeks');
    const canPeek = (offset: number, published: boolean) =>
      published && offset + 1 <= max;

    expect(canPeek(0, true)).toBe(true);
    expect(canPeek(1, true)).toBe(true);
    expect(canPeek(2, true)).toBe(false);
    expect(canPeek(0, false)).toBe(false);
  });

  it('peek blocked when content exists but horizon exhausted', () => {
    const max = maxWeekOffset('this_week');
    const peekBlocked = (offset: number, published: boolean) =>
      published && offset + 1 > max;

    expect(peekBlocked(0, true)).toBe(true);
    expect(peekBlocked(0, false)).toBe(false);
  });
});

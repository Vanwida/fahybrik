// Pure unit tests for the order-altered completion detector
// (@fahybrid/shared/domain/adherence/order-altered, migration 0086).
//
// The rule under test: an athlete is "order-altered" only when they FINISH an
// earlier-planned session AFTER a later-planned one. Moving a session to another
// day but completing in planned order is NOT a violation; simultaneous (tied)
// completions are NOT a violation.

import { describe, expect, test } from 'vitest';
import {
  isOrderAltered,
  type CompletedSessionOrder,
} from '@fahybrid/shared/domain/adherence';

describe('isOrderAltered', () => {
  test('empty array -> false', () => {
    expect(isOrderAltered([])).toBe(false);
  });

  test('single completion -> false', () => {
    expect(isOrderAltered([{ planned_sequence: 1, completed_at: 100 }])).toBe(false);
  });

  test('two completions in planned order (seq 1 then 2 by time) -> false', () => {
    const done: CompletedSessionOrder[] = [
      { planned_sequence: 1, completed_at: 100 },
      { planned_sequence: 2, completed_at: 200 },
    ];
    expect(isOrderAltered(done)).toBe(false);
  });

  test('two completions out of order (seq 2 completed before seq 1) -> true', () => {
    const done: CompletedSessionOrder[] = [
      { planned_sequence: 2, completed_at: 100 },
      { planned_sequence: 1, completed_at: 200 },
    ];
    expect(isOrderAltered(done)).toBe(true);
  });

  test('three sessions, moved days but completed in planned order -> false', () => {
    // Days slid around (completion timestamps are irregular) but seq 1<2<3 still
    // finished in ascending order — moving a day is not a violation.
    const done: CompletedSessionOrder[] = [
      { planned_sequence: 1, completed_at: 1_000 },
      { planned_sequence: 2, completed_at: 9_999 },
      { planned_sequence: 3, completed_at: 50_000 },
    ];
    expect(isOrderAltered(done)).toBe(false);
  });

  test('tie in completed_at (same timestamp, seq 1 and 2) -> false', () => {
    const done: CompletedSessionOrder[] = [
      { planned_sequence: 2, completed_at: 500 },
      { planned_sequence: 1, completed_at: 500 },
    ];
    expect(isOrderAltered(done)).toBe(false);
  });

  test('did all 3 but swapped the middle two -> true', () => {
    // Planned 1,2,3; finished 1, then 3, then 2 → seq 2 done after seq 3.
    const done: CompletedSessionOrder[] = [
      { planned_sequence: 1, completed_at: 100 },
      { planned_sequence: 3, completed_at: 200 },
      { planned_sequence: 2, completed_at: 300 },
    ];
    expect(isOrderAltered(done)).toBe(true);
  });

  test('input order is irrelevant — function sorts a copy', () => {
    // Same data as the in-order case but supplied shuffled; still false, and the
    // caller's array is not mutated.
    const done: CompletedSessionOrder[] = [
      { planned_sequence: 3, completed_at: 300 },
      { planned_sequence: 1, completed_at: 100 },
      { planned_sequence: 2, completed_at: 200 },
    ];
    const snapshot = JSON.stringify(done);
    expect(isOrderAltered(done)).toBe(false);
    expect(JSON.stringify(done)).toBe(snapshot);
  });
});

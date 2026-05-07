import { describe, expect, test } from 'vitest';
import { recommendTransition } from '@/lib/atr/transitions';

describe('recommendTransition', () => {
  test('advances when block complete + healthy load + benchmark improvement', () => {
    const r = recommendTransition({
      current_block_type: 'ACC',
      weeks_completed_in_block: 6,
      planned_weeks_in_block: 6,
      compliance_pct: 0.95,
      load: { ctl: 70, atl: 65, tsb: -5, acr: 1.1 },
      benchmark_progression_pct: 4.2,
    });
    expect(r.recommendation).toBe('advance');
    expect(r.next_block_type).toBe('TRANS');
    expect(r.confidence).toBe('high');
    expect(r.flags).toContain('block_complete');
  });

  test('regresses when overreaching even if block complete', () => {
    const r = recommendTransition({
      current_block_type: 'TRANS',
      weeks_completed_in_block: 4,
      planned_weeks_in_block: 4,
      compliance_pct: 0.9,
      load: { ctl: 80, atl: 130, tsb: -50, acr: 1.8 },
      benchmark_progression_pct: 1.0,
    });
    expect(r.recommendation).toBe('regress');
    expect(r.flags).toContain('overreaching');
    expect(r.next_block_type).toBe('REAL'); // still surface the *would-be* next, coach decides
  });

  test('holds when compliance is low', () => {
    const r = recommendTransition({
      current_block_type: 'ACC',
      weeks_completed_in_block: 6,
      planned_weeks_in_block: 6,
      compliance_pct: 0.55,
      load: { ctl: 50, atl: 45, tsb: 5, acr: 0.9 },
      benchmark_progression_pct: 2.0,
    });
    expect(r.recommendation).toBe('hold');
    expect(r.flags).toContain('compliance_low');
  });

  test('REAL has no next block', () => {
    const r = recommendTransition({
      current_block_type: 'REAL',
      weeks_completed_in_block: 3,
      planned_weeks_in_block: 3,
      compliance_pct: 1,
      load: { ctl: 80, atl: 70, tsb: 10, acr: 1.0 },
      benchmark_progression_pct: 5,
    });
    expect(r.next_block_type).toBeNull();
  });

  test('handles missing benchmark data without crashing', () => {
    const r = recommendTransition({
      current_block_type: 'ACC',
      weeks_completed_in_block: 6,
      planned_weeks_in_block: 6,
      compliance_pct: 0.85,
      load: { ctl: 60, atl: 55, tsb: 5, acr: 1.0 },
      benchmark_progression_pct: null,
    });
    expect(r.recommendation).toBe('advance');
    expect(r.confidence).toBe('medium'); // downgraded without benchmark signal
  });

  test('holds when block is underdone', () => {
    const r = recommendTransition({
      current_block_type: 'TRANS',
      weeks_completed_in_block: 2,
      planned_weeks_in_block: 4,
      compliance_pct: 1,
      load: { ctl: 60, atl: 55, tsb: 5, acr: 1.0 },
      benchmark_progression_pct: 3,
    });
    expect(r.recommendation).toBe('hold');
    expect(r.flags).toContain('block_underdone');
  });
});

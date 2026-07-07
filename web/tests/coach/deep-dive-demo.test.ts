import { describe, expect, it } from 'vitest';
import {
  getDemoDeepDive,
  getDemoFallback,
  isDemoAthleteId,
} from '@/lib/coach/deep-dive-demo';

describe('coach/deep-dive-demo', () => {
  it('returns a complete payload for the canonical demo (Marc)', () => {
    const dd = getDemoDeepDive('demo-1');
    expect(dd).not.toBeNull();
    if (!dd) return;
    expect(dd.header.full_name).toBe('Marc Vidal');
    expect(dd.is_demo).toBe(true);
    // AGNOSTIC: current_block is a neutral microciclo name (the demo's final one),
    // never an ATR label. Assert completeness, not a hardcoded phase.
    expect(typeof dd.macrocycle?.current_block).toBe('string');
    expect(dd.macrocycle?.current_block?.length).toBeGreaterThan(0);
    expect(dd.modality.rows.length).toBe(5);
    expect(dd.performance.groups.length).toBe(3);
    expect(dd.recent_days.length).toBeGreaterThan(0);
    // Élite reality: at least one day must have AM + PM.
    expect(
      dd.recent_days.some((d) => d.sessions.filter((s) => s.slot === 'AM' || s.slot === 'PM').length === 2),
    ).toBe(true);
    // Sparklines populated.
    expect(dd.trends.ctl_atl_tsb.length).toBe(30);
    expect(dd.trends.compliance.length).toBeGreaterThan(0);
  });

  it('returns Sara with inactive banner', () => {
    const dd = getDemoDeepDive('demo-2');
    expect(dd?.header.full_name).toBe('Sara Puig');
    expect(dd?.banner?.kind).toBe('inactive');
    expect(dd?.alerts.length).toBeGreaterThan(0);
  });

  it('returns null for unknown demo id', () => {
    expect(getDemoDeepDive('demo-zzz')).toBeNull();
  });

  it('detects demo ids', () => {
    expect(isDemoAthleteId('demo-1')).toBe(true);
    expect(isDemoAthleteId('42')).toBe(false);
  });

  it('produces a fallback for a real athlete with no data', () => {
    const dd = getDemoFallback('123', 'Real Person', 'TRANS');
    expect(dd.header.athlete_id).toBe('123');
    expect(dd.header.full_name).toBe('Real Person');
    expect(dd.is_demo).toBe(true);
    expect(dd.macrocycle?.current_block).toBe('TRANS');
    expect(dd.notes).toEqual([]);
  });
});

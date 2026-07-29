import { describe, expect, it } from 'vitest';
import { evaluateWeeklyVerdictFromContext } from '@/lib/coach/weekly-verdict-rules';
import type { AthleteContextPack } from '@/lib/coach/coach-ia-context';

function basePack(overrides: Partial<AthleteContextPack> = {}): AthleteContextPack {
  return {
    identity: { level: '2', block_type: 'Base aeróbica', week_in_block: 2, days_to_a_event: 90 },
    compliance: { pct_7d: 0.85, pct_28d: 0.8, missed_7d: 0 },
    readiness: { score: 72, sub_score: 65, delta_7d: 3, hrv_delta_pct: 0 },
    effort: { avg_rpe_7d: 7, high_rpe_sessions_7d: 0 },
    running: { status: null, detail: null },
    hyrox: { weak: [], strong: [] },
    subjective_snippets: [],
    progression_verdict: 'flat',
    summary: 'OK',
    compliance_7d: 0.85,
    readiness_sub_score: 65,
    data_gaps: [],
    ...overrides,
  };
}

describe('evaluateWeeklyVerdictFromContext', () => {
  it('returns ok when no triggers fire', () => {
    const r = evaluateWeeklyVerdictFromContext(basePack());
    expect(r.verdict).toBe('ok');
    expect(r.triggers).toHaveLength(0);
  });

  it('returns needs_adjustment when compliance below 60%', () => {
    const r = evaluateWeeklyVerdictFromContext(
      basePack({ compliance_7d: 0.55, compliance: { pct_7d: 0.55, pct_28d: 0.5, missed_7d: 0 } }),
    );
    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toContain('compliance_7d_below_60');
  });

  it('returns needs_adjustment when sub_score below 40', () => {
    const r = evaluateWeeklyVerdictFromContext(
      basePack({
        readiness_sub_score: 35,
        readiness: { score: 50, sub_score: 35, delta_7d: -10, hrv_delta_pct: -0.05 },
      }),
    );
    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toContain('sub_score_below_40');
  });

  it('returns needs_adjustment when 2+ missed sessions', () => {
    const r = evaluateWeeklyVerdictFromContext(
      basePack({ compliance: { pct_7d: 0.7, pct_28d: 0.7, missed_7d: 2 } }),
    );
    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toContain('missed_sessions_2plus');
  });

  it('returns needs_adjustment when HRV drops more than 15%', () => {
    const r = evaluateWeeklyVerdictFromContext(
      basePack({
        readiness: { score: 60, sub_score: 50, delta_7d: -5, hrv_delta_pct: -0.18 },
      }),
    );
    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toContain('hrv_drop_15');
  });

  it('does NOT fire HRV trigger at -10% (above threshold)', () => {
    const r = evaluateWeeklyVerdictFromContext(
      basePack({
        readiness: { score: 60, sub_score: 50, delta_7d: -2, hrv_delta_pct: -0.1 },
      }),
    );
    expect(r.triggers).not.toContain('hrv_drop_15');
  });
});

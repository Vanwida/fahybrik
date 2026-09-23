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

describe('el motor de la descarga lee la señal que la pidió (informe C, P0)', () => {
  const readiness = {
    kind: 'readiness_low',
    severity: 'critical' as const,
    label: 'Readiness baja',
    evidence: '31 hoy · −39 vs su base 70 (28 d) · bajo tu suelo de 40',
  };

  it('una semana perfecta con una señal viva del cuerpo pide ajuste (antes decía «mantener»)', () => {
    const r = evaluateWeeklyVerdictFromContext(basePack({ compliance_7d: 1, body_signals: [readiness] }));
    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toEqual(['signal:readiness_low']);
  });

  it('el «por qué» de la propuesta dice la señal con sus palabras de Hoy', async () => {
    const { firedTriggersFromContext } = await import('@fahybrid/shared/domain/coach/weekly-evaluation');
    expect(firedTriggersFromContext(basePack({ body_signals: [readiness] }))).toEqual([
      { code: 'signal:readiness_low', label: 'Readiness baja', value: readiness.evidence, tone: 'danger' },
    ]);
  });

  it('sin señales vivas, la semana decide sola (como antes)', () => {
    expect(evaluateWeeklyVerdictFromContext(basePack({ body_signals: [] })).verdict).toBe('ok');
  });
});

describe('la línea de «mantener» y de «sin cambio posible»', () => {
  it('dice por qué, en el vocabulario del panel', async () => {
    const { keepSummary, heuristicNoChangeReason } = await import('@/lib/coach/week-adjust-copy');
    expect(keepSummary('Adherencia (7 d) 100 % · 7 de 7 hechas')).toBe(
      'Su semana no pide cambios · Adherencia (7 d) 100 % · 7 de 7 hechas',
    );
    expect(keepSummary('Datos limitados esta semana')).toBe('Su semana no pide cambios');
    expect(heuristicNoChangeReason(0, '5')).toBe('No le quedan entrenos esta semana que se puedan suavizar');
    expect(heuristicNoChangeReason(3, null)).toMatch(/entreno de recuperación/);
  });
});

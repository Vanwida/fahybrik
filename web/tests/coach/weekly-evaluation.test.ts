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

describe('evaluateWeeklyVerdictFromContext: el veredicto son las señales de Hoy', () => {
  it('sin señales vivas, ok aunque la semana evaluada tenga números bajos (son contexto)', () => {
    const r = evaluateWeeklyVerdictFromContext(
      basePack({
        compliance_7d: 0.5,
        compliance: { pct_7d: 0.5, pct_28d: 0.5, missed_7d: 2 },
        readiness_sub_score: 30,
        readiness: { score: 43, sub_score: 30, delta_7d: -10, hrv_delta_pct: -0.2 },
      }),
    );
    expect(r.verdict).toBe('ok');
    expect(r.triggers).toHaveLength(0);
  });

  it('«entrenos sin hacer» de Hoy pide ajuste, con su código', () => {
    const missed = { kind: 'missed_sessions', severity: 'warning' as const, label: '3 de 4 debidas sin hacer', evidence: 'últimos 7 d' };
    const r = evaluateWeeklyVerdictFromContext(basePack({ body_signals: [missed] }));
    expect(r).toEqual({ verdict: 'needs_adjustment', triggers: ['signal:missed_sessions'] });
  });
});

describe('progressionVerdictOf', () => {
  const missed = { kind: 'missed_sessions', severity: 'warning' as const, label: 'x', evidence: 'y' };
  it('down si Hoy pide tocar la semana; up con la adherencia mínima del coach; flat si no', async () => {
    const { progressionVerdictOf } = await import('@fahybrid/shared/domain/coach/weekly-verdict-rules');
    expect(progressionVerdictOf({ body_signals: [missed], adherence_7d: 1, progress_adherence_min_pct: 75 })).toBe('down');
    expect(progressionVerdictOf({ body_signals: [], adherence_7d: 0.8, progress_adherence_min_pct: 75 })).toBe('up');
    expect(progressionVerdictOf({ body_signals: [], adherence_7d: 0.8, progress_adherence_min_pct: 90 })).toBe('flat');
    expect(progressionVerdictOf({ body_signals: [], adherence_7d: null, progress_adherence_min_pct: 75 })).toBe('flat');
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

  it('sin señales vivas, no hay ajuste', () => {
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

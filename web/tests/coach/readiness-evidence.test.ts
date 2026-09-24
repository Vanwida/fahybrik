// LA frase del readiness frente a su base (shared/domain/coach/readiness-evidence)
// y la regla de honestidad: sin base, nunca «actúa hoy» ni «descarga».

import { describe, expect, it } from 'vitest';
import {
  READINESS_BASELINE_MIN_READINGS,
  readinessBaseText,
  readinessEvidence,
} from '@fahybrid/shared/domain/coach/readiness-evidence';
import { signalActionFor } from '@fahybrid/shared/domain/coach/athlete-state';
import { assessReadiness } from '@/lib/coach/attention/readiness-baseline';

const T = {
  readiness_critical_floor: 40,
  readiness_drop_points: 15,
  readiness_drop_days: 3,
  readiness_max_age_days: 2,
};

describe('readinessEvidence — una frase para Hoy, vistazo, roster y ficha', () => {
  it('sin base dice cuántas lecturas lleva de las que pide la regla', () => {
    expect(readinessEvidence({ value: 38, baseline: null, baseline_readings: 1, observed_on: '2026-09-23', today: '2026-09-23' })).toBe(
      `38 hoy · aún sin su base (1 de ${READINESS_BASELINE_MIN_READINGS} lecturas)`,
    );
  });

  it('con base dice la diferencia, la base y su ventana', () => {
    expect(readinessEvidence({ value: 31, baseline: 70, baseline_readings: 20, observed_on: '2026-09-22', today: '2026-09-23' })).toBe(
      '31 ayer · −39 vs su base 70 (28 d)',
    );
    expect(readinessBaseText({ value: 70, baseline: 70, baseline_readings: 9 })).toBe('igual que su base 70 (28 d)');
    expect(readinessBaseText({ value: 75, baseline: 70, baseline_readings: 9 })).toBe('+5 vs su base 70 (28 d)');
  });

  it('una lectura de otro día lleva su fecha', () => {
    expect(readinessEvidence({ value: 50, baseline: null, baseline_readings: 0, observed_on: '2026-09-20', today: '2026-09-23' })).toBe(
      '50 el 20 sept · aún sin su base (0 de 7 lecturas)',
    );
  });
});

describe('sin base no hay «Acción» ni descarga', () => {
  it('bajo el suelo sin base: vigilar, no crítico', () => {
    const a = assessReadiness([{ on: '2026-09-23', score: 30 }], '2026-09-23', T);
    expect(a.fires).toBe(true);
    expect(a.severity).toBe('warning');
  });

  it('bajo el suelo con base: crítico (la regla del coach manda)', () => {
    const series = [...Array.from({ length: 7 }, (_, i) => ({ on: `2026-09-${String(10 + i).padStart(2, '0')}`, score: 70 })), { on: '2026-09-23', score: 30 }];
    const a = assessReadiness(series, '2026-09-23', T);
    expect(a.severity).toBe('critical');
  });

  it('la acción de un readiness sin base es hablar, no «Proponer descarga»', () => {
    const s = { kind: 'readiness_low' as const, severity: 'warning' as const, dedupe_key: 'readiness_low:1:x' };
    expect(signalActionFor({ ...s, baseline: null })).toBe('mensaje');
    expect(signalActionFor({ ...s, baseline: 62 })).toBe('proponer_descarga');
  });
});

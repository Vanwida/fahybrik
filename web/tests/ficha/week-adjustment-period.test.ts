import { describe, expect, it } from 'vitest';
import { adjustmentWeekFor, evaluatedWeekFor, pendingForEvaluation } from '@/lib/dashboard/v2/week-adjustment-period';

describe('semana evaluada y semana ajustada', () => {
  const pending = [{ id: 'vieja', week_start: '2026-09-14' }, { id: 'seleccionada', week_start: '2026-09-28' }];
  it('N ajusta N+1, también cruzando año', () => {
    expect(adjustmentWeekFor('2026-09-21')).toBe('2026-09-28');
    expect(adjustmentWeekFor('2026-12-28')).toBe('2027-01-04');
    expect(evaluatedWeekFor('2027-01-04')).toBe('2026-12-28');
  });
  it('elige la propuesta de N+1 sin colar la pendiente antigua', () => {
    expect(pendingForEvaluation(pending, '2026-09-21')?.id).toBe('seleccionada');
    expect(pendingForEvaluation(pending, '2026-10-05')).toBeNull();
    expect(pendingForEvaluation(pending)?.id).toBe('vieja');
    expect(pendingForEvaluation([])).toBeNull();
  });
});

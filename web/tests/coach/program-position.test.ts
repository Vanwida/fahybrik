// Dónde está un atleta en un programa y cuándo lo empieza: UNA regla para la
// página del grupo y el roster (informe C: «empieza 21 sept» vs «28 sept»).

import { describe, expect, it } from 'vitest';
import { programPosition, receiptWeeks } from '@fahybrid/shared/domain/coach/program-position';

describe('programPosition', () => {
  // Programa de 4 semanas; el atleta entra en la semana 2 (su recibo: 3 semanas).
  const late = { start_date: '2026-09-28', end_date: '2026-10-18' };

  it('empieza = el primer día de SU recibo, no la semana 1 del programa', () => {
    const p = programPosition(late, 4, '2026-09-23');
    expect(p).toMatchObject({ athlete_start: '2026-09-28', weeks: 4, entered_week: 2, week: null, started: false });
  });

  it('dentro del recibo cuenta la semana del PROGRAMA', () => {
    expect(programPosition(late, 4, '2026-09-28').week).toBe(2);
    expect(programPosition(late, 4, '2026-10-06').week).toBe(3);
    expect(programPosition(late, 4, '2026-10-18')).toMatchObject({ week: 4, started: true, ended: false });
  });

  it('pasado el final: empezó y terminó, sin semana en curso', () => {
    expect(programPosition(late, 4, '2026-10-20')).toMatchObject({ week: null, started: true, ended: true });
  });

  it('sin saber las semanas del programa, las del recibo (entró en la 1)', () => {
    expect(receiptWeeks(late)).toBe(3);
    expect(programPosition(late, 0, '2026-09-30')).toMatchObject({ weeks: 3, entered_week: 1, week: 1 });
  });
});

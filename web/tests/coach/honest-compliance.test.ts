// Cumplimiento: 0 % solo si ESTA semana visible tenía trabajo y no se hizo.
// Draft, bloque acabado o denominador de otra semana → «sin semana que contar».

import { describe, expect, test } from 'vitest';
import { athleteWeekChip } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import {
  SIN_SEMANA_QUE_CONTAR,
  weekCanCountCompliance,
  weekCompliancePct,
  weekComplianceRead,
} from '@fahybrid/shared/domain/coach/honest-compliance';

const TODAY = '2026-08-18';

describe('weekCanCountCompliance', () => {
  test('solo Visible cuenta', () => {
    expect(weekCanCountCompliance('visible')).toBe(true);
    expect(weekCanCountCompliance('no_lo_ve')).toBe(false);
    expect(weekCanCountCompliance('semana_vacia')).toBe(false);
    expect(weekCanCountCompliance('bloque_terminado')).toBe(false);
    expect(weekCanCountCompliance('sin_plan')).toBe(false);
  });
});

describe('weekComplianceRead — Marc / draft / semana viva', () => {
  test('Marc: bloque acabado, hechas en julio, 0 programadas esta semana → vacío, no 0 %', () => {
    const chip = athleteWeekChip({
      has_month_assignment: true,
      last_assignment_end: '2026-07-26',
      session_count_this_week: 0,
      athlete_sees_it: true,
      today: TODAY,
    });
    expect(chip.kind).toBe('bloque_terminado');
    const read = weekComplianceRead({
      chipKind: chip.kind,
      scheduled: 0,
      completed: 4,
    });
    expect(read).toEqual({ kind: 'empty', label: SIN_SEMANA_QUE_CONTAR });
    expect(weekCompliancePct(chip.kind, 0, 4)).toBeNull();
  });

  test('denominador de otra semana (julio) no se pinta como 0 % de agosto', () => {
    const read = weekComplianceRead({
      chipKind: 'bloque_terminado',
      scheduled: 5,
      completed: 0,
    });
    expect(read.kind).toBe('empty');
    expect(read.label).toBe(SIN_SEMANA_QUE_CONTAR);
  });

  test('borrador: hay sesiones, el atleta no las ve → no es 0 %', () => {
    const chip = athleteWeekChip({
      has_month_assignment: true,
      last_assignment_end: '2026-08-23',
      session_count_this_week: 4,
      athlete_sees_it: false,
      today: TODAY,
    });
    expect(chip.kind).toBe('no_lo_ve');
    expect(weekComplianceRead({ chipKind: chip.kind, scheduled: 4, completed: 0 })).toEqual({
      kind: 'empty',
      label: SIN_SEMANA_QUE_CONTAR,
    });
  });

  test('semana vacía / sin plan: vacío, no 0 %', () => {
    expect(weekComplianceRead({ chipKind: 'semana_vacia', scheduled: 0, completed: 0 }).kind).toBe(
      'empty',
    );
    expect(weekComplianceRead({ chipKind: 'sin_plan', scheduled: 0, completed: 0 }).label).toBe(
      SIN_SEMANA_QUE_CONTAR,
    );
  });

  test('Visible con trabajo: 4/4 es 100, 0/4 sí es 0 % (fallo real)', () => {
    expect(weekComplianceRead({ chipKind: 'visible', scheduled: 4, completed: 4 })).toEqual({
      kind: 'pct',
      pct: 100,
    });
    expect(weekComplianceRead({ chipKind: 'visible', scheduled: 4, completed: 0 })).toEqual({
      kind: 'pct',
      pct: 0,
    });
    expect(weekComplianceRead({ chipKind: 'visible', scheduled: 4, completed: 2 })).toEqual({
      kind: 'pct',
      pct: 50,
    });
  });

  test('Visible sin programadas: no se inventa adherencia', () => {
    expect(weekComplianceRead({ chipKind: 'visible', scheduled: 0, completed: 0 })).toEqual({
      kind: 'empty',
      label: SIN_SEMANA_QUE_CONTAR,
    });
  });
});

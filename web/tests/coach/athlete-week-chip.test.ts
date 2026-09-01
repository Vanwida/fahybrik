// Chip de estado de la SEMANA CALENDARIO: lo que el atleta ve, no el status
// interno de programación. Misma doctrina que MCP `athlete_sees_it`:
// solo `weekly_plans.status='draft'` esconde; sin fila se ve.
//
// Los cinco rótulos son el contrato del coach (lista = ficha = semana).

import { describe, expect, test } from 'vitest';
import {
  ATHLETE_WEEK_CHIP_LABEL,
  athleteSeesItFromWeeklyStatus,
  athleteWeekChip,
  weekIsDelivered,
  type AthleteWeekChipInput,
} from '@fahybrid/shared/domain/coach/athlete-week-chip';

const TODAY = '2026-08-18';

function chip(over: Partial<AthleteWeekChipInput> = {}) {
  return athleteWeekChip({
    has_month_assignment: true,
    last_assignment_end: '2026-08-23',
    session_count_this_week: 0,
    athlete_sees_it: true,
    today: TODAY,
    ...over,
  });
}

describe('athleteWeekChip — rótulos', () => {
  test('los cinco estados son una frase, sin jerga cruzada', () => {
    expect(ATHLETE_WEEK_CHIP_LABEL).toEqual({
      visible: 'Visible',
      no_lo_ve: 'No lo ve',
      semana_vacia: 'Semana vacía',
      bloque_terminado: 'Bloque terminado',
      sin_plan: 'Sin plan',
    });
  });
});

describe('athleteWeekChip — existencia', () => {
  test('sin mes asignado → Sin plan', () => {
    expect(chip({ has_month_assignment: false, last_assignment_end: null })).toEqual({
      kind: 'sin_plan',
      label: 'Sin plan',
    });
  });

  test('sin mes gana aunque haya sesiones huérfanas esta semana', () => {
    expect(
      chip({
        has_month_assignment: false,
        last_assignment_end: null,
        session_count_this_week: 3,
        athlete_sees_it: true,
      }).kind,
    ).toBe('sin_plan');
  });

  test('plan en marcha, esta semana 0 sesiones → Semana vacía', () => {
    expect(chip({ last_assignment_end: '2026-08-23', session_count_this_week: 0 }).kind).toBe(
      'semana_vacia',
    );
  });

  test('el último día del bloque todavía cuenta como en marcha', () => {
    expect(chip({ last_assignment_end: TODAY, session_count_this_week: 0 }).kind).toBe(
      'semana_vacia',
    );
  });

  test('la última semana asignada ya acabó → Bloque terminado', () => {
    expect(chip({ last_assignment_end: '2026-07-26', session_count_this_week: 0 })).toEqual({
      kind: 'bloque_terminado',
      label: 'Bloque terminado',
    });
  });

  test('mes sin fecha de fin, 0 sesiones → Semana vacía, no Sin plan', () => {
    expect(
      chip({ last_assignment_end: null, session_count_this_week: 0, has_month_assignment: true })
        .kind,
    ).toBe('semana_vacia');
  });
});

describe('athleteWeekChip — visibilidad (misma puerta que MCP)', () => {
  test('sesiones + el atleta las ve (sin_marcar / published) → Visible', () => {
    expect(
      chip({ session_count_this_week: 4, athlete_sees_it: true }).kind,
    ).toBe('visible');
  });

  test('sesiones + draft (athlete_sees_it false) → No lo ve, nunca Visible', () => {
    const result = chip({ session_count_this_week: 4, athlete_sees_it: false });
    expect(result).toEqual({ kind: 'no_lo_ve', label: 'No lo ve' });
    expect(weekIsDelivered(result.kind)).toBe(false);
  });

  test('draft vacío no se llama No lo ve: no hay nada que esconder', () => {
    expect(
      chip({
        session_count_this_week: 0,
        athlete_sees_it: false,
        last_assignment_end: '2026-08-23',
      }).kind,
    ).toBe('semana_vacia');
  });

  test('sesiones esta semana ganan a bloque ya acabado: si las ve, Visible', () => {
    expect(
      chip({
        last_assignment_end: '2026-07-26',
        session_count_this_week: 2,
        athlete_sees_it: true,
      }).kind,
    ).toBe('visible');
  });

  test('sesiones esta semana en draft ganan a bloque acabado → No lo ve', () => {
    expect(
      chip({
        last_assignment_end: '2026-07-26',
        session_count_this_week: 2,
        athlete_sees_it: false,
      }).kind,
    ).toBe('no_lo_ve');
  });
});

describe('weekIsDelivered', () => {
  test('solo Visible cuenta como entregado — el roster no puede decir Plan OK si él ve vacío', () => {
    expect(weekIsDelivered('visible')).toBe(true);
    expect(weekIsDelivered('no_lo_ve')).toBe(false);
    expect(weekIsDelivered('semana_vacia')).toBe(false);
    expect(weekIsDelivered('bloque_terminado')).toBe(false);
    expect(weekIsDelivered('sin_plan')).toBe(false);
  });
});

describe('athleteSeesItFromWeeklyStatus — misma puerta que MCP / week-plan', () => {
  test('solo draft esconde; sin fila, published y archived se ven', () => {
    expect(athleteSeesItFromWeeklyStatus(null)).toBe(true);
    expect(athleteSeesItFromWeeklyStatus(undefined)).toBe(true);
    expect(athleteSeesItFromWeeklyStatus('published')).toBe(true);
    expect(athleteSeesItFromWeeklyStatus('archived')).toBe(true);
    expect(athleteSeesItFromWeeklyStatus('sin_marcar')).toBe(true);
    expect(athleteSeesItFromWeeklyStatus('draft')).toBe(false);
  });

  test('draft + sesiones esta semana → No lo ve, nunca Visible', () => {
    const sees = athleteSeesItFromWeeklyStatus('draft');
    const result = chip({ session_count_this_week: 4, athlete_sees_it: sees });
    expect(result.kind).toBe('no_lo_ve');
    expect(weekIsDelivered(result.kind)).toBe(false);
  });
});

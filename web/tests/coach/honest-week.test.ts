// La semana que Resumen y Plan titulan es la SEMANA CALENDARIO del chip.
// Un bloque de julio no se llama «Esta semana» en agosto. Una semana sin
// sesiones no se pinta como 7×Descanso ni se lee como frescura.
//
// Recorrido 18-ago: Marc (Resumen 13–19 jul, Plan «aún no ha arrancado» de
// un Acumulación acabado) y Guillem (7 descansos + Frescura +5 sobre 0 km).

import { describe, expect, test } from 'vitest';
import { athleteWeekChip } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import {
  allowsFreshnessVerdict,
  honestWeekHeading,
  initialPlanWeekIndex,
  pickCalendarWeek,
  planRelationCopy,
  planWeekRelation,
  weekHasSessions,
  type WeekLike,
} from '@fahybrid/shared/domain/coach/honest-week';

const TODAY = '2026-08-18';
const CAL_MON = '2026-08-17';
const CAL_SUN = '2026-08-23';

function week(over: Partial<WeekLike> & { week_start: string; week_end: string }): WeekLike {
  return {
    days: over.days ?? [
      { is_today: false, sessions: [] },
      { is_today: false, sessions: [] },
      { is_today: false, sessions: [] },
      { is_today: false, sessions: [] },
      { is_today: false, sessions: [] },
      { is_today: false, sessions: [] },
      { is_today: false, sessions: [] },
    ],
    ...over,
  };
}

const JULIO_S1 = week({
  week_start: '2026-07-13',
  week_end: '2026-07-19',
  days: [
    { is_today: false, sessions: [{ id: 's1' }] },
    { is_today: false, sessions: [{ id: 's2' }] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [{ id: 's3' }] },
    { is_today: false, sessions: [{ id: 's4' }] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [] },
  ],
});

const JULIO_S2 = week({
  week_start: '2026-07-20',
  week_end: '2026-07-26',
  days: [
    { is_today: false, sessions: [{ id: 's5' }] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [] },
    { is_today: false, sessions: [] },
  ],
});

describe('pickCalendarWeek — nunca weeks[0]', () => {
  test('Marc: el payload es julio; la semana de agosto no está → null, no S1', () => {
    expect(pickCalendarWeek([JULIO_S1, JULIO_S2], CAL_MON)).toBeNull();
  });

  test('si la semana calendario está, esa, aunque no sea la primera', () => {
    const actual = week({
      week_start: CAL_MON,
      week_end: CAL_SUN,
      days: [{ is_today: true, sessions: [{ id: 'hoy' }] }],
    });
    expect(pickCalendarWeek([JULIO_S1, actual], CAL_MON)).toBe(actual);
  });
});

describe('honestWeekHeading — Marc / Guillem / semana con sesiones', () => {
  test('Marc: bloque acabado no se titula Esta semana ni se pinta', () => {
    const chip = athleteWeekChip({
      has_month_assignment: true,
      last_assignment_end: '2026-07-26',
      session_count_this_week: 0,
      athlete_sees_it: true,
      today: TODAY,
    });
    const heading = honestWeekHeading({
      chip,
      calendarMonday: CAL_MON,
      calendarSunday: CAL_SUN,
    });
    expect(chip.kind).toBe('bloque_terminado');
    expect(heading.title).toBe('Bloque terminado');
    expect(heading.title).not.toBe('Esta semana');
    expect(heading.week_start).toBe(CAL_MON);
    expect(heading.week_end).toBe(CAL_SUN);
    expect(heading.paint_days).toBe(false);
    expect(heading.empty_copy).toBe('Bloque terminado');
  });

  test('Guillem: sin plan no pinta 7 descansos', () => {
    const chip = athleteWeekChip({
      has_month_assignment: false,
      last_assignment_end: null,
      session_count_this_week: 0,
      athlete_sees_it: true,
      today: TODAY,
    });
    const heading = honestWeekHeading({
      chip,
      calendarMonday: CAL_MON,
      calendarSunday: CAL_SUN,
    });
    expect(heading.title).toBe('Sin plan');
    expect(heading.paint_days).toBe(false);
    expect(heading.empty_copy).toBe('Sin plan');
  });

  test('plan en marcha, 0 sesiones esta semana → Semana vacía, no 7×Descanso', () => {
    const chip = athleteWeekChip({
      has_month_assignment: true,
      last_assignment_end: '2026-08-23',
      session_count_this_week: 0,
      athlete_sees_it: true,
      today: TODAY,
    });
    const heading = honestWeekHeading({
      chip,
      calendarMonday: CAL_MON,
      calendarSunday: CAL_SUN,
    });
    expect(heading.title).toBe('Semana vacía');
    expect(heading.paint_days).toBe(false);
  });

  test('esta semana tiene sesiones y las ve → Esta semana, se pinta', () => {
    const chip = athleteWeekChip({
      has_month_assignment: true,
      last_assignment_end: '2026-08-23',
      session_count_this_week: 4,
      athlete_sees_it: true,
      today: TODAY,
    });
    const heading = honestWeekHeading({
      chip,
      calendarMonday: CAL_MON,
      calendarSunday: CAL_SUN,
    });
    expect(heading.title).toBe('Esta semana');
    expect(heading.paint_days).toBe(true);
    expect(heading.empty_copy).toBeNull();
  });

  test('borrador con sesiones: se pinta (hay trabajo), el título sigue siendo Esta semana', () => {
    const chip = athleteWeekChip({
      has_month_assignment: true,
      last_assignment_end: '2026-08-23',
      session_count_this_week: 4,
      athlete_sees_it: false,
      today: TODAY,
    });
    expect(chip.kind).toBe('no_lo_ve');
    const heading = honestWeekHeading({
      chip,
      calendarMonday: CAL_MON,
      calendarSunday: CAL_SUN,
    });
    expect(heading.title).toBe('Esta semana');
    expect(heading.paint_days).toBe(true);
  });
});

describe('planWeekRelation — acabó ≠ no ha arrancado', () => {
  test('Marc: payload de julio, chip bloque_terminado → ended, nunca not_started', () => {
    const relation = planWeekRelation({
      chipKind: 'bloque_terminado',
      weeks: [JULIO_S1, JULIO_S2],
      today: TODAY,
    });
    expect(relation).toBe('ended');
  });

  test('plan futuro sin hoy en el lienzo → not_started (sigue siendo honesto)', () => {
    const future = week({
      week_start: '2026-08-24',
      week_end: '2026-08-30',
      days: [{ is_today: false, sessions: [{ id: 's1' }] }],
    });
    expect(
      planWeekRelation({
        chipKind: 'semana_vacia',
        weeks: [future],
        today: TODAY,
      }),
    ).toBe('not_started');
  });

  test('semana calendario presente, 0 sesiones → empty', () => {
    const actual = week({
      week_start: CAL_MON,
      week_end: CAL_SUN,
      days: [
        { is_today: false, sessions: [] },
        { is_today: true, sessions: [] },
        { is_today: false, sessions: [] },
        { is_today: false, sessions: [] },
        { is_today: false, sessions: [] },
        { is_today: false, sessions: [] },
        { is_today: false, sessions: [] },
      ],
    });
    expect(
      planWeekRelation({
        chipKind: 'semana_vacia',
        weeks: [actual],
        today: TODAY,
      }),
    ).toBe('empty');
  });

  test('sin mes → none', () => {
    expect(
      planWeekRelation({ chipKind: 'sin_plan', weeks: [], today: TODAY }),
    ).toBe('none');
  });

  test('plan en marcha, payload de julio, semana de caja ausente → empty, no ended', () => {
    expect(
      planWeekRelation({
        chipKind: 'semana_vacia',
        weeks: [JULIO_S1, JULIO_S2],
        today: TODAY,
      }),
    ).toBe('empty');
  });
});

describe('planRelationCopy — acabó se dice; vacío no se disfraza de arranque', () => {
  test('Marc: ended es Bloque terminado, aunque el payload empiece el 13 jul', () => {
    expect(planRelationCopy('ended', '13 jul')).toBe('Bloque terminado');
    expect(planRelationCopy('ended', '13 jul')).not.toMatch(/arrancado/i);
  });

  test('plan futuro: aún no ha arrancado, con la fecha', () => {
    expect(planRelationCopy('not_started', '24 ago')).toBe(
      'Aún no ha arrancado · empieza el 24 ago',
    );
  });

  test('sin plan / vacío / en marcha: el canvas y el chip hablan; aquí no se inventa frase', () => {
    expect(planRelationCopy('none', null)).toBeNull();
    expect(planRelationCopy('empty', null)).toBeNull();
    expect(planRelationCopy('running', null)).toBeNull();
  });
});

describe('initialPlanWeekIndex', () => {
  test('si hay día de hoy, esa semana', () => {
    const actual = week({
      week_start: CAL_MON,
      week_end: CAL_SUN,
      days: [{ is_today: true, sessions: [{ id: 'hoy' }] }],
    });
    expect(initialPlanWeekIndex([JULIO_S1, actual], 'running')).toBe(1);
  });

  test('bloque acabado aterriza en la última semana del payload, no en S1', () => {
    expect(initialPlanWeekIndex([JULIO_S1, JULIO_S2], 'ended')).toBe(1);
  });

  test('aún no arranca: primera semana', () => {
    expect(initialPlanWeekIndex([JULIO_S1, JULIO_S2], 'not_started')).toBe(0);
  });
});

describe('frescura — no se lee de un cero', () => {
  test('weekHasSessions solo Visible y No lo ve', () => {
    expect(weekHasSessions('visible')).toBe(true);
    expect(weekHasSessions('no_lo_ve')).toBe(true);
    expect(weekHasSessions('semana_vacia')).toBe(false);
    expect(weekHasSessions('bloque_terminado')).toBe(false);
    expect(weekHasSessions('sin_plan')).toBe(false);
  });

  test('Guillem: el motor de carga puede permitir veredicto; la semana vacía lo retira', () => {
    expect(allowsFreshnessVerdict(true, 'sin_plan')).toBe(false);
    expect(allowsFreshnessVerdict(true, 'semana_vacia')).toBe(false);
    expect(allowsFreshnessVerdict(true, 'bloque_terminado')).toBe(false);
  });

  test('con sesiones esta semana, el veredicto de carga se respeta', () => {
    expect(allowsFreshnessVerdict(true, 'visible')).toBe(true);
    expect(allowsFreshnessVerdict(false, 'visible')).toBe(false);
    expect(allowsFreshnessVerdict(true, 'no_lo_ve')).toBe(true);
  });
});

// La línea del alta: qué grupo, qué programa y semana, cuándo empieza y cuándo lo ve.
import { describe, expect, it } from 'vitest';
import { intakePlanLine, type IntakePlanSummary } from '@/lib/coach/intake-plan-line';

const TODAY = '2026-09-23';
const s = (o: Partial<IntakePlanSummary>): IntakePlanSummary => ({
  kind: 'group',
  group_name: null,
  program_name: null,
  week: null,
  weeks: null,
  start_date: null,
  visible_on: null,
  ...o,
});

describe('intakePlanLine', () => {
  it('entrar en un grupo: grupo, programa y semana, lunes de inicio y sábado en que lo ve', () => {
    expect(
      intakePlanLine(s({ group_name: 'HYROX mañanas', program_name: 'Base', week: 2, start_date: '2026-09-28', visible_on: '2026-09-26' }), TODAY),
    ).toBe('Entra en HYROX mañanas · Base, semana 2 · empieza lun 28 sept · semana visible el sáb 26');
  });
  it('un programa que empieza el mes que viene: la fecha de verse lleva mes si cambia', () => {
    expect(
      intakePlanLine(s({ kind: 'program', program_name: 'Base', week: 1, start_date: '2026-10-05', visible_on: '2026-10-03' }), TODAY),
    ).toBe('Base desde la semana 1 · empieza lun 5 oct · semana visible el sáb 3');
    expect(
      intakePlanLine(s({ kind: 'program', program_name: 'Base', week: 1, start_date: '2026-10-05', visible_on: '2026-09-30' }), TODAY),
    ).toBe('Base desde la semana 1 · empieza lun 5 oct · semana visible el mié 30 sept');
  });
  it('seguir con lo que tiene: semana en la que va y la próxima que verá', () => {
    expect(
      intakePlanLine(
        s({ kind: 'keep', group_name: 'HYROX mañanas', program_name: 'Base', week: 1, weeks: 4, start_date: '2026-09-28', visible_on: '2026-09-26' }),
        TODAY,
      ),
    ).toBe('Sigue en HYROX mañanas · Base, semana 1 de 4 · la del 28 sept se ve el sáb 26');
  });
  it('ventana ya abierta y semana retenida', () => {
    expect(intakePlanLine(s({ kind: 'program', program_name: 'Base', week: 1, start_date: '2026-09-28', visible_on: '2026-09-22' }), TODAY)).toMatch(
      /semana visible ya$/,
    );
    expect(intakePlanLine(s({ kind: 'keep', program_name: 'Base', week: 2, weeks: 4, start_date: '2026-09-28', visible_on: null }), TODAY)).toBe(
      'Sigue con lo que tiene · Base, semana 2 de 4 · retenida hasta que la publiques',
    );
  });
  it('plan solo para él', () => {
    expect(intakePlanLine(s({ kind: 'personal' }), TODAY)).toBe('Sin programa: lo escribes tú desde su plan');
  });
});

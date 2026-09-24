// Dónde cae un programa en el plan de un atleta, y dónde está un grupo en una
// fecha. Puro: la previa y la aplicación usan estas mismas funciones.

import { describe, expect, it } from 'vitest';
import {
  anchorFromRequest,
  groupAnchorFromMembers,
  mondayAfter,
  placeInGroup,
  placeProgram,
  projectGroup,
  type ExistingReceipt,
} from '@fahybrid/shared/domain/coach/plan-placement';

const r = (id: string, start: string, end: string, name = `P${id}`): ExistingReceipt => ({
  id,
  month_template_id: `m${id}`,
  program_name: name,
  start_date: start,
  end_date: end,
});

describe('placeProgram', () => {
  it('sin conflicto: asigna tal cual (4 semanas lun→dom)', () => {
    const p = placeProgram({ receipts: [], start: '2026-09-28', weeks: 4, policy: 'chain' });
    expect(p).toEqual({ action: 'assign', start_date: '2026-09-28', end_date: '2026-10-25', conflicts: [] });
  });

  it('un plan que acaba justo la víspera no es conflicto (0166: planes seguidos sin hueco)', () => {
    const p = placeProgram({ receipts: [r('1', '2026-09-07', '2026-09-27')], start: '2026-09-28', weeks: 2, policy: 'skip' });
    expect(p.action).toBe('assign');
  });

  it('chain: arranca el lunes siguiente al final del que estorba', () => {
    const p = placeProgram({ receipts: [r('1', '2026-09-07', '2026-10-04')], start: '2026-09-28', weeks: 4, policy: 'chain' });
    expect(p.action).toBe('chain');
    expect(p.start_date).toBe('2026-10-05');
    expect(p.end_date).toBe('2026-11-01');
    expect(p.conflicts.map((c) => c.id)).toEqual(['1']);
  });

  it('chain: salta varios recibos seguidos hasta el primer hueco que cabe', () => {
    const receipts = [
      r('1', '2026-09-07', '2026-10-04'),
      r('2', '2026-10-05', '2026-10-18'),
      // hueco de 1 semana (19–25 oct) que NO cabe un programa de 2
      r('3', '2026-10-26', '2026-11-08'),
    ];
    const p = placeProgram({ receipts, start: '2026-09-28', weeks: 2, policy: 'chain' });
    expect(p.start_date).toBe('2026-11-09');
    expect(p.conflicts.map((c) => c.id).sort()).toEqual(['1', '2', '3']);
  });

  it('chain: un recibo que acaba a mitad de semana empuja al lunes siguiente', () => {
    const p = placeProgram({ receipts: [r('1', '2026-09-07', '2026-09-30')], start: '2026-09-28', weeks: 1, policy: 'chain' });
    expect(p.start_date).toBe('2026-10-05');
  });

  it('replace: no se mueve y devuelve los recibos a cortar', () => {
    const receipts = [r('1', '2026-09-07', '2026-10-04'), r('2', '2026-10-05', '2026-11-01'), r('3', '2027-01-04', '2027-01-31')];
    const p = placeProgram({ receipts, start: '2026-09-28', weeks: 4, policy: 'replace' });
    expect(p.action).toBe('replace');
    expect(p.start_date).toBe('2026-09-28');
    expect(p.conflicts.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('skip: se queda como está', () => {
    const p = placeProgram({ receipts: [r('1', '2026-09-07', '2026-10-04')], start: '2026-09-28', weeks: 4, policy: 'skip' });
    expect(p.action).toBe('skip');
  });

  it('mondayAfter: domingo → lunes siguiente; miércoles → lunes siguiente', () => {
    expect(mondayAfter('2026-10-04')).toBe('2026-10-05');
    expect(mondayAfter('2026-09-30')).toBe('2026-10-05');
  });
});

describe('projectGroup', () => {
  const chain = [
    { position: 1, weeks: 4 },
    { position: 2, weeks: 3 },
  ];
  const anchor = { position: 1, program_start: '2026-09-07' };

  it('a mitad del programa del ancla: misma semana que el grupo', () => {
    expect(projectGroup(chain, 'stop', anchor, '2026-09-21')).toEqual({ position: 1, week: 3, program_start: '2026-09-07' });
  });

  it('tras el primer programa: el siguiente de la cadena', () => {
    expect(projectGroup(chain, 'stop', anchor, '2026-10-12')).toEqual({ position: 2, week: 2, program_start: '2026-10-05' });
  });

  it('repeat: vuelve al primero al acabar la cadena', () => {
    expect(projectGroup(chain, 'repeat', anchor, '2026-10-26')).toEqual({ position: 1, week: 1, program_start: '2026-10-26' });
  });

  it('stop / level_up: después del último, el plan del grupo acabó', () => {
    expect(projectGroup(chain, 'stop', anchor, '2026-10-26')).toBeNull();
    expect(projectGroup(chain, 'level_up', anchor, '2026-10-26')).toBeNull();
  });

  it('antes de que el grupo arranque: se entra en su semana 1', () => {
    expect(projectGroup(chain, 'stop', { position: 1, program_start: '2026-10-05' }, '2026-09-28')).toEqual({
      position: 1,
      week: 1,
      program_start: '2026-10-05',
    });
  });

  it('una cadena que repite el mismo programa ([A,B,A]) avanza por posición, no por programa', () => {
    const abA = [
      { position: 1, weeks: 2 },
      { position: 2, weeks: 1 },
      { position: 3, weeks: 2 },
    ];
    expect(projectGroup(abA, 'repeat', { position: 1, program_start: '2026-09-07' }, '2026-09-28')?.position).toBe(3);
    // repeat tras [A,B,A] (5 semanas) → vuelve a la posición 1
    expect(projectGroup(abA, 'repeat', { position: 1, program_start: '2026-09-07' }, '2026-10-12')).toEqual({
      position: 1,
      week: 1,
      program_start: '2026-10-12',
    });
  });
});

describe('groupAnchorFromMembers', () => {
  it('manda la mayoría; quien entró a mitad vota lo mismo (se deduce del FIN del recibo)', () => {
    const anchor = groupAnchorFromMembers([
      { position: 1, program_weeks: 4, receipt_end: '2026-10-04', current: true },
      { position: 1, program_weeks: 4, receipt_end: '2026-10-04', current: true }, // entró en la semana 3
      { position: 1, program_weeks: 4, receipt_end: '2026-10-11', current: true }, // desviado
    ]);
    expect(anchor).toEqual({ position: 1, program_start: '2026-09-07' });
  });

  it('sin miembros no hay ancla', () => {
    expect(groupAnchorFromMembers([])).toBeNull();
  });

  it('los recibos vivos votan antes que los viejos', () => {
    const anchor = groupAnchorFromMembers([
      { position: 1, program_weeks: 4, receipt_end: '2026-06-28', current: false },
      { position: 1, program_weeks: 4, receipt_end: '2026-06-28', current: false },
      { position: 2, program_weeks: 2, receipt_end: '2026-10-04', current: true },
    ]);
    expect(anchor).toEqual({ position: 2, program_start: '2026-09-21' });
  });
});

describe('placeInGroup', () => {
  const chain = [
    { position: 1, weeks: 4 },
    { position: 2, weeks: 4 },
  ];

  it('entra alineado a mitad de programa (semana 3 de 4 → materializa 2 semanas)', () => {
    const out = placeInGroup({
      receipts: [],
      start: '2026-09-21',
      policy: 'chain',
      chain,
      endPolicy: 'stop',
      anchor: { position: 1, program_start: '2026-09-07' },
    });
    expect(out?.position).toBe(1);
    expect(out?.week).toBe(3);
    expect(out?.placement).toMatchObject({ action: 'assign', start_date: '2026-09-21', end_date: '2026-10-04' });
  });

  it('encadenar tras su plan personal: entra donde esté el grupo ENTONCES', () => {
    const out = placeInGroup({
      receipts: [r('9', '2026-09-14', '2026-10-11', 'Plan personal')],
      start: '2026-09-21',
      policy: 'chain',
      chain,
      endPolicy: 'stop',
      anchor: { position: 1, program_start: '2026-09-07' },
    });
    // el 12-oct el grupo va por el programa 2, semana 2
    expect(out?.position).toBe(2);
    expect(out?.week).toBe(2);
    expect(out?.placement.action).toBe('chain');
    expect(out?.placement.start_date).toBe('2026-10-12');
    expect(out?.placement.end_date).toBe('2026-11-01');
    expect(out?.placement.conflicts.map((c) => c.id)).toEqual(['9']);
  });

  it('grupo que aún no ha empezado: entra el día que empieza el grupo', () => {
    const out = placeInGroup({
      receipts: [],
      start: '2026-09-28',
      policy: 'chain',
      chain,
      endPolicy: 'stop',
      anchor: anchorFromRequest(1, 1, '2026-10-05'),
    });
    expect(out?.placement.start_date).toBe('2026-10-05');
    expect(out?.week).toBe(1);
  });

  it('plan del grupo acabado (parar): null', () => {
    expect(
      placeInGroup({
        receipts: [],
        start: '2027-01-04',
        policy: 'chain',
        chain,
        endPolicy: 'stop',
        anchor: { position: 1, program_start: '2026-09-07' },
      }),
    ).toBeNull();
  });
});

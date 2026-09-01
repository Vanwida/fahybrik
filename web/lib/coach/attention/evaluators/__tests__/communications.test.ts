// Los tres evaluadores del comunicado del coach (docs/DECISIONS.md 2026-08-09).
//
// Se prueban dos cosas distintas y las dos importan: el MECANISMO (qué dispara,
// con qué nivel y con qué identidad) y que el MÉTODO mande de verdad, o sea que
// cambiar el umbral del coach cambie el resultado. Un evaluador que ignorase sus
// umbrales pasaría todos los tests de la primera clase y ninguno de la segunda.

import { describe, it, expect } from 'vitest';
import type { EffectiveThresholds } from '@fahybrid/shared/domain/coach/signals';
import { DEFAULT_COACH_SIGNAL_THRESHOLDS } from '@fahybrid/shared/domain/coach/signal-thresholds';
import { THRESHOLDS, ATHLETE_ID, baseFacts, fired, notFired } from './facts';

/** Los umbrales vigentes con los de este coach encima, como en el barrido real. */
function conUmbrales(overrides: Partial<typeof DEFAULT_COACH_SIGNAL_THRESHOLDS>) {
  return { ...THRESHOLDS, ...overrides } as EffectiveThresholds;
}

const N = DEFAULT_COACH_SIGNAL_THRESHOLDS.communication_question_unanswered_days;
const CRITICA = DEFAULT_COACH_SIGNAL_THRESHOLDS.communication_task_overdue_critical_days;
const M = DEFAULT_COACH_SIGNAL_THRESHOLDS.communication_protocol_unopened_days;

function pregunta(over: Partial<{ days: number; others: number; blocks: boolean }> = {}) {
  return baseFacts({
    communication_question: {
      id: '77',
      title: 'Cambiamos el jueves de sitio?',
      days: over.days ?? N,
      others: over.others ?? 0,
      blocks: over.blocks ?? false,
    },
  });
}

function tarea(over: Partial<{ days: number; others: number }> = {}) {
  return baseFacts({
    communication_task: {
      id: '81',
      title: 'Mándame el vídeo del peso muerto',
      days: over.days ?? 1,
      others: over.others ?? 0,
    },
  });
}

function protocolo(
  over: Partial<{ days: number; others: number; anchor: 'race' | 'test' }> = {},
) {
  return baseFacts({
    communication_protocol: {
      id: '93',
      title: 'Día de carrera: desde que te levantas',
      days: over.days ?? M,
      others: over.others ?? 0,
      anchor: over.anchor ?? 'race',
    },
  });
}

describe('communication_question_unanswered', () => {
  it('dispara cuando lleva sin responder tantos días como el umbral', () => {
    const r = fired('communication_question_unanswered', pregunta({ days: N }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(N);
    expect(r.baseline).toBe(N);
    expect(r.detail).toBe('«Cambiamos el jueves de sitio?» · 2 días sin responder');
    expect(r.dedupe_key).toBe(`communication_question_unanswered:${ATHLETE_ID}:77`);
  });

  it('no dispara antes del umbral', () => {
    notFired('communication_question_unanswered', pregunta({ days: N - 1 }));
  });

  it('no dispara cuando no hay ninguna pregunta abierta', () => {
    notFired('communication_question_unanswered', baseFacts());
  });

  it('sube a crítica cuando alguna bloquea el plan', () => {
    const r = fired('communication_question_unanswered', pregunta({ days: 5, blocks: true }));
    expect(r.severity).toBe('critical');
    expect(r.detail).toBe('«Cambiamos el jueves de sitio?» · 5 días sin responder · bloquea el plan');
  });

  it('cuando la que bloquea puede no ser la citada, el detalle lo dice así', () => {
    const r = fired(
      'communication_question_unanswered',
      pregunta({ days: 4, blocks: true, others: 2 }),
    );
    expect(r.detail).toBe(
      '«Cambiamos el jueves de sitio?» · 4 días sin responder · y 2 más, una bloquea el plan',
    );
  });

  it('cuenta las demás sin exagerar el singular', () => {
    const r = fired('communication_question_unanswered', pregunta({ days: 3, others: 1 }));
    expect(r.detail).toBe('«Cambiamos el jueves de sitio?» · 3 días sin responder · y 1 más');
  });

  it('el umbral del COACH manda: con 7 días, a los 3 no molesta y a los 7 sí', () => {
    const suyos = conUmbrales({ communication_question_unanswered_days: 7 });
    notFired('communication_question_unanswered', pregunta({ days: 3 }), suyos);
    const r = fired('communication_question_unanswered', pregunta({ days: 7 }), suyos);
    expect(r.baseline).toBe(7);
  });
});

describe('communication_task_overdue', () => {
  it('dispara al día siguiente de la fecha límite, sin esperar a ningún umbral', () => {
    const r = fired('communication_task_overdue', tarea({ days: 1 }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(1);
    expect(r.baseline).toBe(CRITICA);
    expect(r.detail).toBe('«Mándame el vídeo del peso muerto» · venció hace 1 día');
    expect(r.dedupe_key).toBe(`communication_task_overdue:${ATHLETE_ID}:81`);
  });

  it('no dispara si aún no ha vencido', () => {
    notFired('communication_task_overdue', tarea({ days: 0 }));
  });

  it('pasa a crítica con el retraso que fija el umbral', () => {
    expect(fired('communication_task_overdue', tarea({ days: CRITICA - 1 })).severity).toBe(
      'warning',
    );
    expect(fired('communication_task_overdue', tarea({ days: CRITICA })).severity).toBe(
      'critical',
    );
  });

  it('el umbral del COACH manda: con 10, a los 4 días sigue siendo vigilar', () => {
    const suyos = conUmbrales({ communication_task_overdue_critical_days: 10 });
    const r = fired('communication_task_overdue', tarea({ days: 4 }), suyos);
    expect(r.severity).toBe('warning');
    expect(r.baseline).toBe(10);
  });

  it('cuenta las demás vencidas', () => {
    const r = fired('communication_task_overdue', tarea({ days: 6, others: 3 }));
    expect(r.detail).toBe('«Mándame el vídeo del peso muerto» · venció hace 6 días · y 3 más');
  });
});

describe('communication_protocol_unopened', () => {
  it('dispara cuando el evento entra en la ventana', () => {
    const r = fired('communication_protocol_unopened', protocolo({ days: M }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(M);
    expect(r.baseline).toBe(M);
    expect(r.detail).toBe(
      '«Día de carrera: desde que te levantas» · la carrera es en 3 días y no lo ha abierto',
    );
    expect(r.dedupe_key).toBe(`communication_protocol_unopened:${ATHLETE_ID}:93`);
  });

  it('no dispara con el evento aún lejos', () => {
    notFired('communication_protocol_unopened', protocolo({ days: M + 1 }));
  });

  it('el día del evento es crítica: o lo abre hoy o no lo abre', () => {
    const r = fired('communication_protocol_unopened', protocolo({ days: 0 }));
    expect(r.severity).toBe('critical');
    expect(r.detail).toBe(
      '«Día de carrera: desde que te levantas» · la carrera es hoy y no lo ha abierto',
    );
  });

  it('pasado el evento se resuelve sola: el protocolo ya no sirve', () => {
    notFired('communication_protocol_unopened', protocolo({ days: -1 }));
  });

  it('un ancla de test se dice como test', () => {
    const r = fired('communication_protocol_unopened', protocolo({ days: 2, anchor: 'test' }));
    expect(r.detail).toContain('el test es en 2 días');
  });

  it('sin protocolo anclado a un evento con fecha, nada dispara', () => {
    notFired('communication_protocol_unopened', baseFacts());
  });

  it('el umbral del COACH manda: con 10 días de antelación, a 8 ya reclama', () => {
    const suyos = conUmbrales({ communication_protocol_unopened_days: 10 });
    notFired('communication_protocol_unopened', protocolo({ days: 8 }));
    const r = fired('communication_protocol_unopened', protocolo({ days: 8 }), suyos);
    expect(r.baseline).toBe(10);
  });
});

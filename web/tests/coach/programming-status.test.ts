// month_2_pending ya no cubre «el bloque se acabó».
// block_ended = sin siguiente bloque. month_2_pending = validar propuesta.
// No se asigna solo.

import { describe, expect, test } from 'vitest';
import {
  classifyProgrammingStatus,
  PROGRAMMING_VIEW,
  type ProgrammingFacts,
} from '@fahybrid/shared/domain/coach/programming-status';
import { resolveStatusPill } from '@/lib/dashboard/athletes/status-pills';

const TODAY = '2026-08-19';

function facts(over: Partial<ProgrammingFacts> = {}): ProgrammingFacts {
  return {
    has_month_plan: true,
    has_pending_month_proposal: false,
    has_pending_week_proposal: false,
    week_session_count: 3,
    last_month_end: '2026-09-13',
    today: TODAY,
    ...over,
  };
}

describe('classifyProgrammingStatus', () => {
  test('sin mes asignado no se confunde con bloque acabado', () => {
    const r = classifyProgrammingStatus(facts({ has_month_plan: false }));
    expect(r.status).toBe('no_month');
    expect(r.label).toBe('Sin mes asignado');
    expect(r.cta).toBeNull();
  });

  test('propuesta mensual pendiente: validar, no reponer', () => {
    const r = classifyProgrammingStatus(
      facts({
        has_pending_month_proposal: true,
        week_session_count: 0,
        last_month_end: '2026-07-26',
      }),
    );
    expect(r.status).toBe('month_2_pending');
    expect(r.label).toBe('Propuesta de mes pendiente');
    expect(r.detail).toBe('Hay un bloque mensual por validar');
    expect(r.cta).toBe('validar_propuesta');
    expect(r.cta_label).toBe('Validar propuesta');
  });

  test('propuesta gana aunque el bloque ya acabó — no auto-asigna', () => {
    const r = classifyProgrammingStatus(
      facts({
        has_pending_month_proposal: true,
        week_session_count: 0,
        last_month_end: '2026-07-26',
      }),
    );
    expect(r.status).not.toBe('block_ended');
    expect(r.cta).not.toBe('reponer_bloque');
  });

  test('ajuste semanal sigue siendo pending_proposal', () => {
    const r = classifyProgrammingStatus(facts({ has_pending_week_proposal: true }));
    expect(r.status).toBe('pending_proposal');
    expect(r.label).toBe('Propuesta IA pendiente');
    expect(r.cta).toBeNull();
  });

  test('semana vacía con bloque vivo no es bloque terminado', () => {
    const r = classifyProgrammingStatus(
      facts({ week_session_count: 0, last_month_end: '2026-09-13' }),
    );
    expect(r.status).toBe('empty_week');
    expect(r.label).toBe('Semana vacía');
  });

  test('bloque acabado y sin propuesta: block_ended, CTA reponer', () => {
    const r = classifyProgrammingStatus(
      facts({ week_session_count: 0, last_month_end: '2026-07-26' }),
    );
    expect(r.status).toBe('block_ended');
    expect(r.label).toBe('Bloque terminado');
    expect(r.detail).toBe('Sin siguiente bloque');
    expect(r.cta).toBe('reponer_bloque');
    expect(r.cta_label).toBe('Reponer bloque');
  });

  test('el último día del bloque aún no es block_ended', () => {
    const r = classifyProgrammingStatus(
      facts({ week_session_count: 0, last_month_end: TODAY }),
    );
    expect(r.status).toBe('empty_week');
  });

  test('plan vivo con sesiones es ok', () => {
    expect(classifyProgrammingStatus(facts()).status).toBe('ok');
  });
});

describe('PROGRAMMING_VIEW copy', () => {
  test('month_2_pending y block_ended no comparten frase', () => {
    const proposal = PROGRAMMING_VIEW.month_2_pending;
    const ended = PROGRAMMING_VIEW.block_ended;
    expect(proposal.label).not.toBe(ended.label);
    expect(proposal.detail).not.toBe(ended.detail);
    expect(proposal.cta).toBe('validar_propuesta');
    expect(ended.cta).toBe('reponer_bloque');
    expect(proposal.label).toMatch(/propuesta/i);
    expect(ended.label).toMatch(/bloque terminado/i);
  });
});

describe('resolveStatusPill', () => {
  test('propuesta de mes y bloque terminado piden revisión, no descanso', () => {
    expect(
      resolveStatusPill({
        programming_status: 'month_2_pending',
        readiness_score: null,
        week_ok: false,
      }).kind,
    ).toBe('revision');
    expect(
      resolveStatusPill({
        programming_status: 'block_ended',
        readiness_score: null,
        week_ok: false,
      }).kind,
    ).toBe('revision');
  });
});

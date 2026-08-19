// El alta no es un portón de existencia del plan. Marc (32 días, bloque
// 13–26 jul, entrenó, chateó) no «espera antes de arrancar».
// No se cierra el alta. No se asigna el mes siguiente.

import { describe, expect, test } from 'vitest';
import {
  altaRowHint,
  altaStartStance,
  altasLeadAllowsAntesDeArrancar,
  altasQueueLead,
  ALTA_LIFE_UNVERIFIED,
  type AltaLifeEvidence,
} from '@fahybrid/shared/domain/coach/alta-stance';

const FRESH: AltaLifeEvidence = {
  has_trained: false,
  has_chatted: false,
  week_kind: 'sin_plan',
};

const MARC: AltaLifeEvidence = {
  has_trained: true,
  has_chatted: true,
  week_kind: 'bloque_terminado',
};

describe('altaStartStance — evidencia de vida', () => {
  test('recién onboarded, sin rastro → antes de arrancar', () => {
    expect(altaStartStance(FRESH)).toBe('antes_de_arrancar');
  });

  test('Marc del recorrido: entrenó + chateó + bloque vencido → ya en el club', () => {
    expect(altaStartStance(MARC)).toBe('ya_en_el_club');
  });

  test('solo entrenó basta', () => {
    expect(altaStartStance({ ...FRESH, has_trained: true })).toBe('ya_en_el_club');
  });

  test('solo chateó basta', () => {
    expect(altaStartStance({ ...FRESH, has_chatted: true })).toBe('ya_en_el_club');
  });

  test('solo bloque vencido basta — el plan ya existió', () => {
    expect(altaStartStance({ ...FRESH, week_kind: 'bloque_terminado' })).toBe('ya_en_el_club');
  });

  test('semana Visible o No lo ve: ya tiene semana, no es un alta a oscuras', () => {
    expect(altaStartStance({ ...FRESH, week_kind: 'visible' })).toBe('ya_en_el_club');
    expect(altaStartStance({ ...FRESH, week_kind: 'no_lo_ve' })).toBe('ya_en_el_club');
  });

  test('semana vacía sin entrenar ni hablar sigue siendo antes de arrancar', () => {
    expect(altaStartStance({ ...FRESH, week_kind: 'semana_vacia' })).toBe('antes_de_arrancar');
  });
});

describe('altasQueueLead — «antes de arrancar» solo si NADIE ha empezado', () => {
  test('cola de Marc: la frase prohibida no sale', () => {
    expect(altasLeadAllowsAntesDeArrancar(['ya_en_el_club'])).toBe(false);
    const lead = altasQueueLead({
      allows_antes_de_arrancar: false,
      urgencia: 'urge',
    });
    expect(lead.stem).not.toMatch(/antes de arrancar/);
    expect(lead.stem).toMatch(/revisión del alta/);
    expect(lead.shows_oldest_wait).toBe(true);
  });

  test('cola fresca reciente: sí dice antes de arrancar', () => {
    expect(altasLeadAllowsAntesDeArrancar(['antes_de_arrancar'])).toBe(true);
    const lead = altasQueueLead({
      allows_antes_de_arrancar: true,
      urgencia: 'reciente',
    });
    expect(lead.stem).toMatch(/antes de arrancar/);
    expect(lead.shows_oldest_wait).toBe(false);
  });

  test('mixta: un Marc tapa el «antes de arrancar» de toda la cola', () => {
    expect(
      altasLeadAllowsAntesDeArrancar(['antes_de_arrancar', 'ya_en_el_club']),
    ).toBe(false);
  });

  test('cola vacía no afirma nada', () => {
    expect(altasLeadAllowsAntesDeArrancar([])).toBe(false);
  });
});

describe('altaRowHint — la fila nombra el rastro, no cierra el alta', () => {
  test('Marc: Ya entrenó (gana a chat y al bloque)', () => {
    expect(altaRowHint(MARC)).toBe('Ya entrenó');
  });

  test('solo bloque vencido: Bloque terminado — no «asigna el mes» ni publica', () => {
    const hint = altaRowHint({ ...FRESH, week_kind: 'bloque_terminado' });
    expect(hint).toBe('Bloque terminado');
    expect(hint).not.toMatch(/asignar|mes|publicar/i);
    const lead = altasQueueLead({ allows_antes_de_arrancar: false, urgencia: 'urge' });
    expect(lead.stem).not.toMatch(/asignar|mes|publicar|antes de arrancar/i);
  });

  test('solo chat: Ya escribió', () => {
    expect(altaRowHint({ ...FRESH, has_chatted: true })).toBe('Ya escribió');
  });

  test('fresco: sin pista extra — el alta sigue abierta', () => {
    expect(altaRowHint(FRESH)).toBeNull();
  });

  test('sin evidencia no se afirma que aún no ha arrancado', () => {
    expect(altaStartStance(ALTA_LIFE_UNVERIFIED)).toBe('ya_en_el_club');
    expect(altaRowHint(ALTA_LIFE_UNVERIFIED)).toBeNull();
  });
});

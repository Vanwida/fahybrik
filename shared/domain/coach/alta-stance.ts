// El alta no es un portón de existencia del plan.
//
// Recorrido 18-ago: Marc, 32 días, bloque 13–26 jul, entrenó y chateó.
// El copy «esperan tu revisión antes de arrancar» mentía. El alta sigue
// abierta — no se cierra aquí, no se asigna el mes siguiente.
//
// Semana Visible / No lo ve: ya hay semana, no es un alta a oscuras.

import type { AthleteWeekChipKind } from './athlete-week-chip';

export type AltaStartStance = 'antes_de_arrancar' | 'ya_en_el_club';

export type AltaUrgencia = 'reciente' | 'avisa' | 'urge';

export type AltaLifeEvidence = {
  has_trained: boolean;
  has_chatted: boolean;
  week_kind: AthleteWeekChipKind;
};

export type AltasQueueLead = {
  stem: string;
  shows_oldest_wait: boolean;
};

export const FRESH_ALTA_LIFE: AltaLifeEvidence = {
  has_trained: false,
  has_chatted: false,
  week_kind: 'sin_plan',
};

/** Si no se pudo leer evidencia, no se afirma «antes de arrancar». Sin pista de fila. */
export const ALTA_LIFE_UNVERIFIED: AltaLifeEvidence = {
  has_trained: false,
  has_chatted: false,
  week_kind: 'no_lo_ve',
};

const WEEK_ALREADY_IN_CLUB: ReadonlySet<AthleteWeekChipKind> = new Set([
  'visible',
  'no_lo_ve',
  'bloque_terminado',
]);

export function altaStartStance(life: AltaLifeEvidence): AltaStartStance {
  if (life.has_trained || life.has_chatted) return 'ya_en_el_club';
  if (WEEK_ALREADY_IN_CLUB.has(life.week_kind)) return 'ya_en_el_club';
  return 'antes_de_arrancar';
}

/** La frase prohibida solo si NADIE de la cola ha empezado. Cola vacía no afirma. */
export function altasLeadAllowsAntesDeArrancar(
  stances: readonly AltaStartStance[],
): boolean {
  return stances.length > 0 && stances.every((s) => s === 'antes_de_arrancar');
}

export function altasQueueLead(args: {
  allows_antes_de_arrancar: boolean;
  urgencia: AltaUrgencia;
}): AltasQueueLead {
  const shows_oldest_wait = args.urgencia !== 'reciente';
  if (args.allows_antes_de_arrancar) {
    return {
      stem: shows_oldest_wait
        ? 'Esperan tu revisión antes de arrancar.'
        : 'Completaron el alta y esperan tu revisión antes de arrancar.',
      shows_oldest_wait,
    };
  }
  return {
    stem: 'Esperan tu revisión del alta.',
    shows_oldest_wait,
  };
}

/** La fila nombra el rastro. No cierra el alta. No pide asignar el mes. */
export function altaRowHint(life: AltaLifeEvidence): string | null {
  if (life.has_trained) return 'Ya entrenó';
  if (life.week_kind === 'bloque_terminado') return 'Bloque terminado';
  if (life.has_chatted) return 'Ya escribió';
  return null;
}

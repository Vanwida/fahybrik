// Hoy del club: el vacío de las lanes no es salud.
//
// Semana viva = Visible (el atleta ve sesiones esta semana calendario).
// Draft no cuenta: él no la ve. Recorrido 18-ago: Marc bloque 13–26 jul
// + Guillem sin plan → 0 vivas y cuatro checks verdes. Los verdes mentían.
//
// No publica. No asigna el mes.

import { weekIsDelivered, type AthleteWeekChipKind } from './athlete-week-chip';

export type ClubWeekCensus = {
  total: number;
  live_count: number;
};

export type HoyHeadlineKind = 'decisiones' | 'sin_semana_viva' | 'en_orden';

export type HoyLaneId =
  | 'fallo_sesiones'
  | 'listo_progresar'
  | 'vigilar_fisiologia'
  | 'espera_respuesta';

export type HoyEmptyTone = 'ok' | 'neutral';

export type HoyEmptyLane = {
  copy: string;
  tone: HoyEmptyTone;
};

export type HoyEmptyBoard = {
  title: string;
  what_to_do: string;
  why: string;
};

export type ClubWeekPill = {
  label: string;
  tone: 'ok' | 'warn';
};

export function clubWeekCensus(kinds: readonly AthleteWeekChipKind[]): ClubWeekCensus {
  return {
    total: kinds.length,
    live_count: kinds.filter(weekIsDelivered).length,
  };
}

export function clubHasLiveWeek(census: ClubWeekCensus): boolean {
  return census.live_count > 0;
}

/** 3 decisiones siguen siendo decisiones. 0 decisiones con 0 vivas no es calma. */
export function hoyHeadlineKind(
  decision_count: number,
  census: ClubWeekCensus,
): HoyHeadlineKind {
  if (decision_count > 0) return 'decisiones';
  if (!clubHasLiveWeek(census)) return 'sin_semana_viva';
  return 'en_orden';
}

const EMPTY_WHEN_LIVE: Record<HoyLaneId, string> = {
  fallo_sesiones: 'Nadie ha fallado sesiones',
  listo_progresar: 'Sin candidatos a progresar hoy',
  vigilar_fisiologia: 'Fisiología en verde',
  espera_respuesta: 'Bandeja al día',
};

const EMPTY_WHEN_NO_LIVE: Record<HoyLaneId, string> = {
  fallo_sesiones: 'Sin semana viva que fallar',
  listo_progresar: 'Sin semana viva que progresar',
  vigilar_fisiologia: 'Sin semana viva que vigilar',
  espera_respuesta: 'Bandeja al día',
};

/** Sin semana viva el vacío es neutro: no hay check de salud. */
export function hoyEmptyLane(id: HoyLaneId, census: ClubWeekCensus): HoyEmptyLane {
  const live = clubHasLiveWeek(census);
  return {
    copy: live ? EMPTY_WHEN_LIVE[id] : EMPTY_WHEN_NO_LIVE[id],
    tone: live ? 'ok' : 'neutral',
  };
}

export function hoyEmptyBoard(census: ClubWeekCensus): HoyEmptyBoard {
  if (clubHasLiveWeek(census)) {
    return {
      title: 'Nada requiere tu atención',
      what_to_do: `Tus ${census.total} atletas siguen su plan. El sistema sigue tu método solo.`,
      why: 'Esto es buena señal: Hoy se llena cuando alguien se sale del molde.',
    };
  }
  return {
    title: 'Nadie ve esta semana',
    what_to_do: 'Ningún atleta ve sesiones de esta semana.',
    why: 'El vacío no es que el club esté bien.',
  };
}

export function clubWeekPill(census: ClubWeekCensus): ClubWeekPill {
  if (!clubHasLiveWeek(census)) {
    return { label: 'Nadie ve esta semana', tone: 'warn' };
  }
  return {
    label: `${census.live_count} de ${census.total} ven esta semana`,
    tone: 'ok',
  };
}

export function isHoyLaneId(id: string): id is HoyLaneId {
  return id in EMPTY_WHEN_LIVE;
}

export function hoyEmptyLaneById(id: string, census: ClubWeekCensus): HoyEmptyLane {
  if (isHoyLaneId(id)) return hoyEmptyLane(id, census);
  return { copy: '', tone: clubHasLiveWeek(census) ? 'ok' : 'neutral' };
}

// Hoy del club: el vacío de las lanes no es salud.
//
// Semana viva = Visible (el atleta ve sesiones esta semana calendario).
// Draft no cuenta: él no la ve. Recorrido 18-ago: Marc bloque 13–26 jul
// + Guillem sin plan → 0 vivas y cuatro checks verdes. Los verdes mentían.
//
// No publica. No asigna el mes.

import { weekIsDelivered, type AthleteWeekChipKind } from './athlete-week-chip';
import { puedeAfirmarMetodo } from './method-interview';

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

export type MethodCoverage = {
  answered: number;
  total: number;
};

export function hoyEmptyBoard(
  census: ClubWeekCensus,
  method?: MethodCoverage,
): HoyEmptyBoard {
  if (clubHasLiveWeek(census)) {
    const afirma =
      method != null ? puedeAfirmarMetodo(method.answered, method.total) : false;
    return {
      title: 'Nada requiere tu atención',
      what_to_do: afirma
        ? `Tus ${census.total} atletas siguen su plan. El sistema sigue tu método solo.`
        : `Tus ${census.total} atletas tienen semana. Eso no es que el sistema siga un método.`,
      why: afirma
        ? 'Esto es buena señal: Hoy se llena cuando alguien se sale del molde.'
        : 'Cómo entrenas no está escrito. El vacío no afirma un método.',
    };
  }
  return {
    title: 'Nadie ve esta semana',
    what_to_do: 'Ningún atleta ve sesiones de esta semana.',
    why: 'El vacío no es que el club esté bien.',
  };
}

/**
 * Copy del intro de Hoy. Dos ejes independientes:
 *
 *   · `live`  — ¿hay alguien que vea su semana? Es contexto del club.
 *   · `afirma_metodo` — ¿podemos decir «el sistema sigue tu método solo»? Solo
 *     con la entrevista completa Y semana viva: 2 de 34 no autoriza esa frase,
 *     y sin nadie viendo su semana el sistema no está siguiendo nada.
 *
 * El primer micro-paso (título + cuerpo) se decide ENTERO aquí. Antes el título
 * vivía en HoyBoard y el cuerpo aquí, y sin semana viva salía «Cada hueco, por
 * su nombre» encima de «Cada atleta cae en su secuencia y recibe el plan
 * automáticamente» — un título que no afirma sobre un cuerpo que sí.
 */
export type HoyIntroCopy = {
  /** ¿Hay al menos un atleta que ve su semana? Contexto, no método. */
  live: boolean;
  /** ¿Se puede decir «el sistema sigue tu método»? */
  afirma_metodo: boolean;
  /** Título del primer micro-paso. Va con `propone_body`: se deciden juntos. */
  propone_title: string;
  propone_body: string;
  vacia_body: string;
};

export function hoyIntroCopy(params: {
  live: boolean;
  method?: MethodCoverage;
}): HoyIntroCopy {
  const afirma =
    params.live &&
    params.method != null &&
    puedeAfirmarMetodo(params.method.answered, params.method.total);
  return {
    live: params.live,
    afirma_metodo: afirma,
    propone_title: afirma ? 'El sistema propone' : 'Cada hueco, por su nombre',
    propone_body: afirma
      ? 'Cada atleta cae en su secuencia y recibe el plan automáticamente.'
      : 'Si a un atleta le falta el siguiente bloque, eso. Si tu receta de nivel está vacía, eso, aparte.',
    vacia_body: !params.live
      ? 'Una bandeja vacía no significa que el club esté bien si nadie ve la semana.'
      : afirma
        ? 'Una bandeja vacía significa que todo va según tu método.'
        : 'Una bandeja vacía no significa que el método esté escrito.',
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

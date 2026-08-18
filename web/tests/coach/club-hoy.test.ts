// Hoy del club: vacío de lanes no es club sano. Semana viva = Visible
// (el atleta ve sesiones esta semana calendario). Draft no cuenta.
//
// Recorrido 18-ago Coach Demo 1: Marc bloque 13–26 jul + Guillem sin plan.
// /es/hoy: 3 decisiones y cuatro checks verdes. Los verdes mentían.

import { describe, expect, test } from 'vitest';
import { weekIsDelivered } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import {
  clubHasLiveWeek,
  clubWeekCensus,
  clubWeekPill,
  hoyEmptyBoard,
  hoyEmptyLane,
  hoyEmptyLaneById,
  hoyHeadlineKind,
  hoyIntroCopy,
} from '@fahybrid/shared/domain/coach/club-hoy';

const MARC_GUILLEM = clubWeekCensus(['bloque_terminado', 'sin_plan']);

describe('clubWeekCensus — semana viva = Visible', () => {
  test('Marc + Guillem del recorrido: 0 vivas, el club no está sano', () => {
    expect(MARC_GUILLEM).toEqual({ total: 2, live_count: 0 });
    expect(clubHasLiveWeek(MARC_GUILLEM)).toBe(false);
  });

  test('un Visible basta: el resto puede estar acabado', () => {
    const census = clubWeekCensus(['visible', 'bloque_terminado']);
    expect(census.live_count).toBe(1);
    expect(clubHasLiveWeek(census)).toBe(true);
  });

  test('No lo ve (draft) no es semana viva — él no la ve', () => {
    expect(weekIsDelivered('no_lo_ve')).toBe(false);
    expect(clubHasLiveWeek(clubWeekCensus(['no_lo_ve', 'no_lo_ve']))).toBe(false);
  });

  test('Semana vacía y Sin plan tampoco', () => {
    expect(clubHasLiveWeek(clubWeekCensus(['semana_vacia', 'sin_plan']))).toBe(false);
  });
});

describe('hoyHeadlineKind — 3 decisiones no es Todo en orden, 0 vivas tampoco', () => {
  test('recorrido: 3 decisiones con 0 vivas sigue siendo decisiones, no calma', () => {
    expect(hoyHeadlineKind(3, MARC_GUILLEM)).toBe('decisiones');
  });

  test('0 decisiones y 0 vivas no se titula Todo en orden', () => {
    expect(hoyHeadlineKind(0, MARC_GUILLEM)).toBe('sin_semana_viva');
  });

  test('0 decisiones y alguien ve la semana → Todo en orden', () => {
    expect(hoyHeadlineKind(0, clubWeekCensus(['visible']))).toBe('en_orden');
  });
});

describe('hoyEmptyLane — sin semana viva no hay check de salud', () => {
  test('recorrido: Fisiología en verde y Nadie ha fallado no salen', () => {
    for (const id of ['fallo_sesiones', 'listo_progresar', 'vigilar_fisiologia', 'espera_respuesta'] as const) {
      const lane = hoyEmptyLane(id, MARC_GUILLEM);
      expect(lane.tone).toBe('neutral');
      expect(lane.copy.toLowerCase()).not.toMatch(/verde/);
      expect(lane.copy.toLowerCase()).not.toMatch(/nadie ha fallado/);
    }
  });

  test('recorrido: copy concreto — el vacío nombra la falta, no la salud', () => {
    expect(hoyEmptyLane('fallo_sesiones', MARC_GUILLEM)).toEqual({
      copy: 'Sin semana viva que fallar',
      tone: 'neutral',
    });
    expect(hoyEmptyLane('listo_progresar', MARC_GUILLEM)).toEqual({
      copy: 'Sin semana viva que progresar',
      tone: 'neutral',
    });
    expect(hoyEmptyLane('vigilar_fisiologia', MARC_GUILLEM)).toEqual({
      copy: 'Sin semana viva que vigilar',
      tone: 'neutral',
    });
    expect(hoyEmptyLane('espera_respuesta', MARC_GUILLEM)).toEqual({
      copy: 'Bandeja al día',
      tone: 'neutral',
    });
  });

  test('id desconocido: sin copy de salud, tono del censo', () => {
    expect(hoyEmptyLaneById('no_existe', MARC_GUILLEM)).toEqual({ copy: '', tone: 'neutral' });
    expect(hoyEmptyLaneById('fallo_sesiones', clubWeekCensus(['visible']))).toEqual({
      copy: 'Nadie ha fallado sesiones',
      tone: 'ok',
    });
  });

  test('con semana viva el vacío de lane SÍ es buena noticia', () => {
    const live = clubWeekCensus(['visible']);
    expect(hoyEmptyLane('fallo_sesiones', live)).toEqual({
      copy: 'Nadie ha fallado sesiones',
      tone: 'ok',
    });
    expect(hoyEmptyLane('vigilar_fisiologia', live)).toEqual({
      copy: 'Fisiología en verde',
      tone: 'ok',
    });
  });
});

describe('hoyEmptyBoard / clubWeekPill — no «siguen su plan» si nadie ve la semana', () => {
  test('tablero vacío del recorrido no dice que siguen el plan', () => {
    const empty = hoyEmptyBoard(MARC_GUILLEM);
    expect(empty.title).toBe('Nadie ve esta semana');
    expect(empty.what_to_do.toLowerCase()).not.toMatch(/siguen su plan/);
    expect(`${empty.what_to_do} ${empty.why}`.toLowerCase()).not.toMatch(/buena señal/);
  });

  test('con semana viva y método escrito el vacío del tablero es calma', () => {
    const empty = hoyEmptyBoard(clubWeekCensus(['visible', 'visible']), {
      answered: 34,
      total: 34,
    });
    expect(empty.title).toBe('Nada requiere tu atención');
    expect(empty.what_to_do).toMatch(/siguen su plan/);
    expect(empty.what_to_do).toMatch(/sigue tu método/);
    expect(empty.why).toMatch(/buena señal/);
  });

  test('recorrido: 2 de 34 no autoriza «sigue tu método», ni con semana viva', () => {
    const empty = hoyEmptyBoard(clubWeekCensus(['visible']), {
      answered: 2,
      total: 34,
    });
    expect(empty.what_to_do.toLowerCase()).not.toMatch(/sigue tu método/);
    expect(empty.why.toLowerCase()).not.toMatch(/buena señal/);
    expect(empty.what_to_do).toMatch(/no es que el sistema siga un método/);
  });

  test('sin cobertura no se afirma el método — el default no inventa 34/34', () => {
    const empty = hoyEmptyBoard(clubWeekCensus(['visible', 'visible']));
    expect(empty.what_to_do.toLowerCase()).not.toMatch(/sigue tu método/);
  });

  test('pill del club: 0 de 2, tono warn — no ok', () => {
    expect(clubWeekPill(MARC_GUILLEM)).toEqual({
      label: 'Nadie ve esta semana',
      tone: 'warn',
    });
  });

  test('pill del club: 1 de 2 ven esta semana', () => {
    expect(clubWeekPill(clubWeekCensus(['visible', 'sin_plan']))).toEqual({
      label: '1 de 2 ven esta semana',
      tone: 'ok',
    });
  });
});

describe('hoyIntroCopy — no afirmar método con 2 de 34', () => {
  const DEMO = { answered: 2, total: 34 };

  test('recorrido Coach Demo 1: 2/34 no dice que el sistema sigue el método', () => {
    const copy = hoyIntroCopy({ live: true, method: DEMO });
    expect(copy.afirma_metodo).toBe(false);
    expect(copy.propone_body).toMatch(/siguiente bloque/);
    expect(copy.propone_body).toMatch(/receta de nivel/);
    expect(`${copy.propone_body} ${copy.vacia_body}`.toLowerCase()).not.toMatch(
      /sigue tu método|según tu método/,
    );
  });

  test('34/34 y semana viva sí puede afirmarlo', () => {
    const copy = hoyIntroCopy({ live: true, method: { answered: 34, total: 34 } });
    expect(copy.afirma_metodo).toBe(true);
    expect(copy.vacia_body).toMatch(/según tu método/);
  });

  test('sin semana viva no afirma, aunque la entrevista esté llena', () => {
    const copy = hoyIntroCopy({ live: false, method: { answered: 34, total: 34 } });
    expect(copy.afirma_metodo).toBe(false);
    expect(copy.vacia_body).toMatch(/nadie ve la semana/);
  });
});

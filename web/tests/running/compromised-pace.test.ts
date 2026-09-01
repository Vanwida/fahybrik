// Pure unit tests for shared/domain/running/compromised-pace.ts (#71).
//
// CASOS FABRICADOS A MANO, representando el dominio — no dependen del seed
// de demostración (Alex/team-lead, 12-ago: "la base de hoy es puro demo, no
// dice nada sobre si el mecanismo vale"). Cada escenario es una situación de
// entrenamiento HYROX real y verosímil: una serie de carrera dentro de un
// bloque multiestación (fatigado) contra esa misma serie en fresco, y las
// combinaciones que tienen que romper la pareja a propósito.

import { describe, expect, test } from 'vitest';
import { buildCompromisedPaceTrend, type CompromisedRunObservation } from '@fahybrid/shared/domain/running/compromised-pace';

const OPTS = { min_pairs_for_trend: 4 };

/** Un 1 km a ritmo objetivo 5:00/km (300 s/km), corrido EN FRESCO: primera
 *  cosa de la sesión, en un bloque de series (context "intervals"). */
function frescoAlRitmo(week: string, pace_s_per_km: number, band_fast_s = 295, band_slow_s = 305): CompromisedRunObservation {
  return {
    week_start: week,
    band_fast_s,
    band_slow_s,
    pace_s_per_km,
    context_format: 'intervals',
    prior_work_s: null,
    position: 0,
  };
}

/** El MISMO objetivo, pero corrido DESPUÉS de un bloque de estaciones — el
 *  caso que da nombre a la tarjeta: "un km a este ritmo, después de un
 *  trineo, contra ese mismo km en fresco". 320 s de trabajo previo, por
 *  encima del umbral de fatiga (300 s, FRESH_PRIOR_WORK_MAX_S). */
function fatigadoAlRitmo(week: string, pace_s_per_km: number, band_fast_s = 295, band_slow_s = 305): CompromisedRunObservation {
  return {
    week_start: week,
    band_fast_s,
    band_slow_s,
    pace_s_per_km,
    context_format: 'intervals',
    prior_work_s: 320,
    position: 3,
  };
}

/** Una serie de carrera dentro de una simulación HYROX completa — siempre
 *  fatigado, sea cual sea `prior_work_s` (regla de classifyEffort). */
function dentroDeSimulacion(week: string, pace_s_per_km: number, band_fast_s = 295, band_slow_s = 305): CompromisedRunObservation {
  return {
    week_start: week,
    band_fast_s,
    band_slow_s,
    pace_s_per_km,
    context_format: 'hyrox_sim',
    prior_work_s: 40, // poco tiempo previo, pero la sim manda igual
    position: 5,
  };
}

describe('buildCompromisedPaceTrend — el caso central del encargo', () => {
  test('1 km a 5:00/km fresco vs el mismo km después de un trineo: la deriva se lee en s/km', () => {
    const observations = [
      frescoAlRitmo('2026-06-08', 300), // fresco: exactamente en el objetivo
      fatigadoAlRitmo('2026-06-08', 309), // se le va 9 s/km, la MISMA semana
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([{ week_start: '2026-06-08', cost_s_per_km: 9, bands: 1 }]);
    expect(res.valid_pairs).toBe(1);
  });

  test('la curva de "9 a 4 en seis semanas" del mockup: mejora real, semana a semana', () => {
    // El fresco de referencia se fija pronto (semana 1) y se sostiene; lo
    // fatigado mejora semana a semana — el coste baja de 9 a 4.
    const observations: CompromisedRunObservation[] = [
      frescoAlRitmo('2026-06-01', 300),
      fatigadoAlRitmo('2026-06-01', 309), // +9
      fatigadoAlRitmo('2026-06-08', 307), // +7
      fatigadoAlRitmo('2026-06-15', 306), // +6
      fatigadoAlRitmo('2026-06-22', 305), // +5
      fatigadoAlRitmo('2026-06-29', 304), // +4
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    // Cinco semanas de datos → cinco puntos (la primera lleva DOS
    // observaciones — fresco y fatigado el mismo día — pero UNA sola banda,
    // así que cuenta como un único punto, no dos).
    expect(res.points.map((p) => p.cost_s_per_km)).toEqual([9, 7, 6, 5, 4]);
    expect(res.points[0]!.week_start).toBe('2026-06-01');
  });
});

describe('buildCompromisedPaceTrend — las combinaciones que rompen la pareja a propósito', () => {
  test('objetivos distintos NO son la misma carrera: un 5:00/km fatigado no se empareja con un 4:30/km fresco', () => {
    const observations = [
      frescoAlRitmo('2026-06-08', 270, 265, 275), // 4:30/km, otro objetivo
      fatigadoAlRitmo('2026-06-08', 309, 295, 305), // 5:00/km
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([]); // ninguna banda tiene las dos caras
    expect(res.valid_pairs).toBe(0);
  });

  test('sin fresco de referencia para esa banda: la fatiga sola no dice nada', () => {
    const observations = [fatigadoAlRitmo('2026-06-08', 309)];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([]);
  });

  test('sólo fresco, nunca fatigado: tampoco hay coste que leer', () => {
    const observations = [frescoAlRitmo('2026-06-08', 300), frescoAlRitmo('2026-06-15', 298)];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([]);
  });

  test('el fresco del FUTURO no explica una semana pasada — nunca mirar adelante', () => {
    const observations = [
      fatigadoAlRitmo('2026-06-08', 309), // semana 1: fatigado, sin fresco TODAVÍA
      frescoAlRitmo('2026-06-15', 300), // semana 2: aparece el fresco
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    // La semana 1 no puede leerse (no había fresco cuando pasó). La semana 2
    // tampoco: no hay fatigado ESA semana (el filtro exige fatigado DENTRO
    // de la semana del punto, no acumulado).
    expect(res.points).toEqual([]);
  });

  test('una serie dentro de una simulación completa siempre es fatigada, aunque el trabajo previo sea poco', () => {
    const observations = [
      frescoAlRitmo('2026-06-08', 300),
      dentroDeSimulacion('2026-06-08', 312), // sólo 40 s previos, pero es hyrox_sim
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([{ week_start: '2026-06-08', cost_s_per_km: 12, bands: 1 }]);
  });

  test('un tramo sin clasificar (a mitad de sesión, sin prior_work_s medido) se descarta, no se adivina', () => {
    const observations: CompromisedRunObservation[] = [
      frescoAlRitmo('2026-06-08', 300),
      {
        week_start: '2026-06-08',
        band_fast_s: 295,
        band_slow_s: 305,
        pace_s_per_km: 340,
        context_format: 'intervals',
        prior_work_s: null, // no medible
        position: 2, // no es el primer tramo → ni fresco ni fatigado: null
      },
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([]); // el tramo sin clasificar no cuenta como nada
  });

  test('varias bandas activas la misma semana: el punto es la media entre bandas', () => {
    const observations = [
      frescoAlRitmo('2026-06-08', 300, 295, 305),
      fatigadoAlRitmo('2026-06-08', 310, 295, 305), // +10 en la banda de 5:00
      frescoAlRitmo('2026-06-08', 240, 235, 245),
      fatigadoAlRitmo('2026-06-08', 246, 235, 245), // +6 en la banda de 4:00
    ];
    const res = buildCompromisedPaceTrend(observations, OPTS);
    expect(res.points).toEqual([{ week_start: '2026-06-08', cost_s_per_km: 8, bands: 2 }]); // (10+6)/2
  });
});

describe('buildCompromisedPaceTrend — has_enough_data no esconde los puntos, sólo marca la bandera', () => {
  test('por debajo del mínimo de parejas: los puntos siguen ahí, la bandera dice que no se fíe todavía', () => {
    const observations = [frescoAlRitmo('2026-06-08', 300), fatigadoAlRitmo('2026-06-08', 309)];
    const res = buildCompromisedPaceTrend(observations, { min_pairs_for_trend: 4 });
    expect(res.has_enough_data).toBe(false);
    expect(res.min_pairs_required).toBe(4);
    expect(res.valid_pairs).toBe(1);
    expect(res.points.length).toBe(1); // el dato está — la tarjeta decide si lo pinta
  });

  test('lista vacía: nunca un error, todo en su estado honesto de cero', () => {
    const res = buildCompromisedPaceTrend([], OPTS);
    expect(res).toEqual({ has_enough_data: false, min_pairs_required: 4, valid_pairs: 0, points: [] });
  });
});

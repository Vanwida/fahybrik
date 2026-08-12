// Pure unit tests for shared/domain/running/progress.ts — el motor de
// "¿estoy mejorando?". El módulo entero es una escalera de evidencia y una
// tabla de qué falta y por qué: los tests centrales son de DISCIPLINA (orden
// de la escalera, qué falta se calla, qué exige las dos cosas a la vez), no
// de que una resta salga bien. `DEFAULT_COACH_RUNNING_THRESHOLDS` hace de
// método, tal cual lo usaría un coach que no ha tocado nada.

import { describe, expect, test } from 'vitest';
import {
  coberturaDe,
  colapso,
  faltaComun,
  mismoTipoDe,
  peldanoDisponible,
  seCalla,
  sePuedeJuzgarElPedido,
  subidaDeVolumen,
  veredictoDe,
  type Falta,
  type Pedido,
  type PuntoSemana,
  type RunningHistory,
  type TipoObservacion,
} from '@fahybrid/shared/domain/running/progress';
import { DEFAULT_COACH_RUNNING_THRESHOLDS } from '@fahybrid/shared/domain/coach/running-thresholds';

const M = DEFAULT_COACH_RUNNING_THRESHOLDS;

/** Una historia completa y sana por defecto — cada test sólo cambia el campo
 *  que le importa comprobar. */
function historia(overrides: Partial<RunningHistory> = {}): RunningHistory {
  return {
    semanas: 10,
    zonas_medidas: true,
    con_pulso: true,
    ppm_referencia: 150,
    zona_referencia: 2,
    vo2: null,
    al_pulso: [],
    esfuerzos: [],
    esfuerzos_antes: [],
    semanas_km: [],
    zonas_s: {},
    segundos_corriendo: 0,
    pedido: null,
    cansado: [],
    carrera: null,
    mismo_tipo: null,
    ...overrides,
  };
}

describe('veredictoDe — la historia es precondición, no desempate', () => {

  test('con historia de sobra pero SIN peldaño: «aún no» SIN plazo — esperar no lo arregla', () => {
    // Cazado con dato real (atleta 67, 12-ago): 10 semanas y sin ancla salía
    // «llevas 10 de 6» — una barra más que llena, diciéndole que esperara
    // cuando lo que le faltaba era el test de zonas. Los cuatro atletas de la
    // maqueta no lo separaban porque al recién llegado le faltan las dos cosas.
    const h = historia({
      semanas: 10,
      zonas_medidas: false,
      con_pulso: true,
      al_pulso: [],
      esfuerzos: [{ metros: 5000, segundos: 1200 }],
      esfuerzos_antes: [],
      mismo_tipo: null,
    });
    const v = veredictoDe(h, M);
    expect(v.clase).toBe('aun-no');
    expect(v.peldano).toBeNull();
    expect(v.plazo).toBeNull();
  });

  test('sin historia suficiente: «aún no» CON plazo, que sí se dibuja', () => {
    const h = historia({ semanas: 3, zonas_medidas: false, al_pulso: [], esfuerzos: [], esfuerzos_antes: [] });
    const v = veredictoDe(h, M);
    expect(v.clase).toBe('aun-no');
    expect(v.plazo).toEqual({ llevas: 3, hacen: M.min_weeks_to_judge });
  });
  test('clase aun-no CON plazo cuando semanas < min_weeks_to_judge, aunque haya un peldaño disponible', () => {
    const h = historia({
      semanas: 3, // por debajo de min_weeks_to_judge (6)
      al_pulso: [
        { semana: '2026-06-01', valor: 300 },
        { semana: '2026-06-08', valor: 295 },
        { semana: '2026-06-15', valor: 290 },
      ],
    });
    const v = veredictoDe(h, M);
    expect(v.clase).toBe('aun-no');
    expect(v.plazo).toEqual({ llevas: 3, hacen: M.min_weeks_to_judge });
    // El peldaño SÍ estaba disponible — la falta es de semanas, no de señal.
    expect(v.peldano).not.toBeNull();
    expect(v.peldano!.en).toBe('al-pulso');
  });
});

describe('peldanoDisponible — el orden de la escalera', () => {
  const base = historia({
    al_pulso: [
      { semana: '2026-06-01', valor: 300 },
      { semana: '2026-06-08', valor: 295 },
      { semana: '2026-06-15', valor: 290 },
    ],
    esfuerzos: [{ metros: 1000, segundos: 240 }],
    esfuerzos_antes: [{ metros: 1000, segundos: 250 }],
    mismo_tipo: { tipo: 'steady', gana_s_km: 4 },
  });

  test('con los tres peldaños disponibles, gana el más alto: al-pulso', () => {
    expect(peldanoDisponible(base)?.en).toBe('al-pulso');
  });

  test('sin las precondiciones de pulso (con_pulso false), cae a esfuerzos', () => {
    expect(peldanoDisponible({ ...base, con_pulso: false })?.en).toBe('esfuerzos');
  });

  test('sin pulso Y sin sombra de esfuerzos, cae a mismo-tipo', () => {
    expect(peldanoDisponible({ ...base, con_pulso: false, esfuerzos_antes: [] })?.en).toBe('mismo-tipo');
  });

  test('sin ninguno de los tres, null', () => {
    expect(
      peldanoDisponible({ ...base, con_pulso: false, esfuerzos_antes: [], mismo_tipo: null }),
    ).toBeNull();
  });
});

describe('peldanoDisponible — al-pulso exige LAS TRES precondiciones a la vez', () => {
  const conTodo = historia({
    al_pulso: [
      { semana: '2026-06-01', valor: 300 },
      { semana: '2026-06-08', valor: 295 },
      { semana: '2026-06-15', valor: 290 },
    ],
    esfuerzos: [{ metros: 1000, segundos: 240 }],
    esfuerzos_antes: [{ metros: 1000, segundos: 250 }],
  });

  test('con las tres presentes: al-pulso', () => {
    expect(peldanoDisponible(conTodo)?.en).toBe('al-pulso');
  });

  test('sin con_pulso: cae al siguiente peldaño (esfuerzos)', () => {
    expect(peldanoDisponible({ ...conTodo, con_pulso: false })?.en).toBe('esfuerzos');
  });

  test('sin zonas_medidas: cae al siguiente peldaño (esfuerzos)', () => {
    expect(peldanoDisponible({ ...conTodo, zonas_medidas: false })?.en).toBe('esfuerzos');
  });

  test('con menos de 3 puntos en al_pulso: cae al siguiente peldaño (esfuerzos)', () => {
    expect(peldanoDisponible({ ...conTodo, al_pulso: conTodo.al_pulso.slice(0, 2) })?.en).toBe('esfuerzos');
  });
});

describe('peldanoDisponible — el peldaño esfuerzos elige la distancia MÁS LARGA común a las dos ventanas', () => {
  test('de tres distancias de hoy, sólo dos siguen en la sombra — gana la más larga de esas dos, no la primera de la lista', () => {
    const h = historia({
      con_pulso: false, // fuerza a saltar al-pulso
      esfuerzos: [
        { metros: 1000, segundos: 240 },
        { metros: 5000, segundos: 1200 }, // no está en la sombra: no cuenta
        { metros: 3000, segundos: 700 },
      ],
      esfuerzos_antes: [
        { metros: 1000, segundos: 250 },
        { metros: 3000, segundos: 720 },
      ],
    });
    expect(peldanoDisponible(h)).toEqual({ en: 'esfuerzos', gana_s: 20, metros: 3000 }); // 720 - 700
  });
});

describe('veredictoDe — cargando exige LAS DOS cosas a la vez (ritmo peor Y volumen subiendo)', () => {
  const semanasKmConSubida: PuntoSemana[] = [
    { semana: '2026-05-04', valor: 20 },
    { semana: '2026-05-11', valor: 20 },
    { semana: '2026-05-18', valor: 20 },
    { semana: '2026-05-25', valor: 20 },
    { semana: '2026-06-01', valor: 30 },
    { semana: '2026-06-08', valor: 30 }, // +50% sobre la base: subida real (>= volume_surge_ratio)
  ];

  test('regresión de ritmo SOLA (sin subida de volumen): peor, no cargando', () => {
    const h = historia({
      al_pulso: [
        { semana: '2026-06-01', valor: 280 },
        { semana: '2026-06-08', valor: 290 },
        { semana: '2026-06-15', valor: 300 }, // ganancia = 280 - 300 = -20
      ],
      semanas_km: [], // nada que mirar: subida = 0, nunca dispara cargando
    });
    expect(veredictoDe(h, M).clase).toBe('peor');
  });

  test('subida de volumen SOLA (con ritmo bueno): NO da cargando', () => {
    const h = historia({
      al_pulso: [
        { semana: '2026-06-01', valor: 300 },
        { semana: '2026-06-08', valor: 300 },
        { semana: '2026-06-15', valor: 300 }, // ganancia = 0
      ],
      semanas_km: semanasKmConSubida,
    });
    expect(subidaDeVolumen(h.semanas_km)).toBeGreaterThanOrEqual(M.volume_surge_ratio);
    const v = veredictoDe(h, M);
    expect(v.clase).not.toBe('cargando');
    expect(v.clase).toBe('igual');
  });

  test('las dos cosas a la vez: cargando', () => {
    const h = historia({
      al_pulso: [
        { semana: '2026-06-01', valor: 280 },
        { semana: '2026-06-08', valor: 290 },
        { semana: '2026-06-15', valor: 300 },
      ],
      semanas_km: semanasKmConSubida,
    });
    expect(veredictoDe(h, M).clase).toBe('cargando');
  });
});

describe('veredictoDe — un cambio menor que meaningful_gain_s_per_km es ruido: igual', () => {
  test('tanto si el cambio pequeño es a mejor como a peor', () => {
    const mejoraPequena = historia({
      al_pulso: [
        { semana: '2026-06-01', valor: 300 },
        { semana: '2026-06-08', valor: 298 },
        { semana: '2026-06-15', valor: 299 }, // ganancia = 300 - 299 = 1, < 3
      ],
    });
    const empeoraPequena = historia({
      al_pulso: [
        { semana: '2026-06-01', valor: 300 },
        { semana: '2026-06-08', valor: 302 },
        { semana: '2026-06-15', valor: 301 }, // ganancia = 300 - 301 = -1
      ],
    });
    expect(veredictoDe(mejoraPequena, M).clase).toBe('igual');
    expect(veredictoDe(empeoraPequena, M).clase).toBe('igual');
  });
});

describe('subidaDeVolumen — nunca NaN ni Infinity', () => {
  test('con menos de 4 semanas: 0', () => {
    const semanas: PuntoSemana[] = [
      { semana: '2026-06-01', valor: 10 },
      { semana: '2026-06-08', valor: 10 },
      { semana: '2026-06-15', valor: 10 },
    ];
    expect(subidaDeVolumen(semanas)).toBe(0);
  });

  test('con la base (las 4 primeras) sumando cero: 0, nunca división por cero', () => {
    const semanas: PuntoSemana[] = [
      { semana: '2026-06-01', valor: 0 },
      { semana: '2026-06-08', valor: 0 },
      { semana: '2026-06-15', valor: 0 },
      { semana: '2026-06-22', valor: 0 },
      { semana: '2026-06-29', valor: 15 },
    ];
    const res = subidaDeVolumen(semanas);
    expect(res).toBe(0);
    expect(Number.isFinite(res)).toBe(true);
  });
});

describe('coberturaDe — el sensor va antes que el ancla', () => {
  test('sin pulso: la falta de forma es sensor, no ancla', () => {
    const h = historia({ con_pulso: false, zonas_medidas: false, al_pulso: [] });
    expect(coberturaDe(h, M).forma).toEqual({ por: 'sensor' });
  });

  test('con pulso pero sin zonas medidas: ahora sí, ancla', () => {
    const h = historia({ con_pulso: true, zonas_medidas: false, al_pulso: [] });
    expect(coberturaDe(h, M).forma).toEqual({ por: 'ancla' });
  });
});

describe('coberturaDe — intención y ocasión se callan; el resto habla', () => {
  test('pedido null: falta intención, y se calla', () => {
    const h = historia({ pedido: null });
    const falta = coberturaDe(h, M).pedido;
    expect(falta).toEqual({ por: 'intencion' });
    expect(seCalla(falta!)).toBe(true);
  });

  test('cansado vacío: falta ocasión, y se calla', () => {
    const h = historia({ cansado: [] });
    const falta = coberturaDe(h, M).cansado;
    expect(falta).toEqual({ por: 'ocasion' });
    expect(seCalla(falta!)).toBe(true);
  });

  test('seCalla es false para historia, ancla y sensor — esas SÍ tienen que hablar', () => {
    expect(seCalla({ por: 'historia', llevas: 1, hacen: 6 })).toBe(false);
    expect(seCalla({ por: 'ancla' })).toBe(false);
    expect(seCalla({ por: 'sensor' })).toBe(false);
  });
});

describe('faltaComun — la salida se dice UNA vez, y sólo cuenta lo que no se calla', () => {
  test('dos o más faltas contables con el mismo motivo: sale esa falta compartida', () => {
    const faltas: Falta[] = [{ por: 'ancla' }, { por: 'ancla' }, { por: 'ancla' }];
    expect(faltaComun(faltas)).toEqual({ por: 'ancla' });
  });

  test('motivos distintos: null, no se inventa un consenso', () => {
    const faltas: Falta[] = [{ por: 'ancla' }, { por: 'sensor' }];
    expect(faltaComun(faltas)).toBeNull();
  });

  test('una sola falta contable: null — hace falta que se repita para merecer una salida común', () => {
    const faltas: Falta[] = [{ por: 'ancla' }];
    expect(faltaComun(faltas)).toBeNull();
  });

  test('ignora las que se callan: dos ancla y dos silenciadas siguen dando ancla, no null', () => {
    const faltas: Falta[] = [{ por: 'ancla' }, { por: 'intencion' }, { por: 'ocasion' }, { por: 'ancla' }];
    expect(faltaComun(faltas)).toEqual({ por: 'ancla' });
  });

  test('si sólo hay silenciadas, ninguna cuenta: null, aunque compartan motivo', () => {
    const faltas: Falta[] = [{ por: 'intencion' }, { por: 'intencion' }];
    expect(faltaComun(faltas)).toBeNull();
  });
});

describe('sePuedeJuzgarElPedido', () => {
  test('por debajo de min_reps_to_judge_band: false', () => {
    const p: Pedido = { evaluadas: M.min_reps_to_judge_band - 1, dentro: 10, fuera_lento: 0, fuera_rapido: 0 };
    expect(sePuedeJuzgarElPedido(p, M)).toBe(false);
  });

  test('en el mínimo exacto: true — la comparación es >=', () => {
    const p: Pedido = { evaluadas: M.min_reps_to_judge_band, dentro: 10, fuera_lento: 0, fuera_rapido: 0 };
    expect(sePuedeJuzgarElPedido(p, M)).toBe(true);
  });
});

describe('mismoTipoDe — null cuando a alguna mitad le faltan tramos', () => {
  test('con menos de MIN_TRAMOS_POR_MITAD en la segunda mitad: null', () => {
    const observaciones: TipoObservacion[] = [
      ...Array.from({ length: 3 }, (): TipoObservacion => ({ tipo: 'steady', semana: '2026-06-01', pace_s_per_km: 300, distance_m: 1000 })),
      ...Array.from({ length: 3 }, (): TipoObservacion => ({ tipo: 'steady', semana: '2026-06-08', pace_s_per_km: 300, distance_m: 1000 })),
      { tipo: 'steady', semana: '2026-06-15', pace_s_per_km: 290, distance_m: 1000 }, // 2ª mitad: sólo 2 tramos
      { tipo: 'steady', semana: '2026-06-22', pace_s_per_km: 290, distance_m: 1000 },
    ];
    // 4 semanas → corte = semanas[floor(4/2)] = la 3ª (06-15).
    // antes = {06-01,06-08} = 6 tramos. ahora = {06-15,06-22} = 2, por debajo del mínimo.
    expect(mismoTipoDe(observaciones)).toBeNull();
  });

  test('con menos de MIN_TRAMOS_POR_MITAD en la primera mitad: también null', () => {
    const observaciones: TipoObservacion[] = [
      { tipo: 'steady', semana: '2026-06-01', pace_s_per_km: 300, distance_m: 1000 }, // 1ª mitad: sólo 1 tramo
      ...Array.from({ length: 3 }, (): TipoObservacion => ({ tipo: 'steady', semana: '2026-06-08', pace_s_per_km: 290, distance_m: 1000 })),
      ...Array.from({ length: 3 }, (): TipoObservacion => ({ tipo: 'steady', semana: '2026-06-15', pace_s_per_km: 290, distance_m: 1000 })),
    ];
    // 3 semanas → corte = semanas[floor(3/2)] = la 2ª (06-08).
    // antes = {06-01} = 1 tramo, por debajo del mínimo.
    expect(mismoTipoDe(observaciones)).toBeNull();
  });
});

describe('mismoTipoDe — el corte es por SEMANAS distintas, no por número de filas', () => {
  test('una semana con 20 tramos no se reparte entre las dos mitades', () => {
    const w1 = Array.from({ length: 3 }, (): TipoObservacion => ({
      tipo: 'intervals', semana: '2026-06-01', pace_s_per_km: 300, distance_m: 1000,
    }));
    const w2 = Array.from({ length: 20 }, (): TipoObservacion => ({
      tipo: 'intervals', semana: '2026-06-08', pace_s_per_km: 200, distance_m: 1000,
    }));
    const w3 = Array.from({ length: 3 }, (): TipoObservacion => ({
      tipo: 'intervals', semana: '2026-06-15', pace_s_per_km: 100, distance_m: 1000,
    }));
    // 26 filas en total, con la semana de 20 tramos EN MEDIO del array. Si el
    // corte fuera por número de fila (mitad de 26 = fila 13) en vez de por
    // semana, esa semana quedaría partida entre las dos mitades. Por semana,
    // las 20 caen enteras en "ahora", junto con w3.
    const observaciones = [...w1, ...w2, ...w3];
    const res = mismoTipoDe(observaciones);
    // antes = sólo w1 (3 @ 300) → media 300.
    // ahora = w2+w3 (20 @ 200 + 3 @ 100, ponderado por distancia, todos a 1000 m)
    //       = (200×20000 + 100×3000) / 23000 = 4 300 000 / 23000 = 186,9565...
    // gana = 300 - 186,9565... = 113,043... → redondeado a 1 decimal: 113.
    expect(res).toEqual({ tipo: 'intervals', gana_s_km: 113 });
  });
});

describe('mismoTipoDe — ponderado por distancia, no una media simple de ritmos', () => {
  test('un tramo largo domina sobre uno corto en la misma mitad', () => {
    const antes: TipoObservacion[] = [
      { tipo: 'steady', semana: '2026-06-01', pace_s_per_km: 300, distance_m: 8000 },
      { tipo: 'steady', semana: '2026-06-01', pace_s_per_km: 300, distance_m: 8000 },
      { tipo: 'steady', semana: '2026-06-01', pace_s_per_km: 100, distance_m: 1000 }, // outlier corto y rápido
    ];
    const ahora: TipoObservacion[] = Array.from({ length: 3 }, (): TipoObservacion => ({
      tipo: 'steady', semana: '2026-06-08', pace_s_per_km: 280, distance_m: 1000,
    }));
    const res = mismoTipoDe([...antes, ...ahora]);
    // Ponderado: (300×8000×2 + 100×1000) / 17000 = 4 900 000 / 17000 = 288,235...
    // La media simple habría sido (300+300+100)/3 = 233,33 — muy distinta.
    // gana = 288,235... - 280 = 8,235... → redondeado a 1 decimal: 8.2.
    expect(res).toEqual({ tipo: 'steady', gana_s_km: 8.2 });
  });
});

describe('mismoTipoDe — determinismo en empates', () => {
  test('con el mismo número de tramos en dos tipos, el desempate es por nombre — estable ante el orden de entrada', () => {
    const enSemana = (tipo: string, semana: string, pace: number): TipoObservacion[] =>
      Array.from({ length: 3 }, () => ({ tipo, semana, pace_s_per_km: pace, distance_m: 1000 }));

    const observaciones = [
      ...enSemana('zzz', '2026-06-01', 300),
      ...enSemana('zzz', '2026-06-08', 280),
      ...enSemana('aaa', '2026-06-01', 300),
      ...enSemana('aaa', '2026-06-08', 280),
    ];
    const barajadas = [...observaciones].sort(() => Math.random() - 0.5);

    const res1 = mismoTipoDe(observaciones);
    const res2 = mismoTipoDe(barajadas);

    // Los dos tipos llevan exactamente el mismo n (6): el empate lo rompe el
    // nombre, y 'aaa' < 'zzz'.
    expect(res1?.tipo).toBe('aaa');
    expect(res2?.tipo).toBe('aaa');
    expect(res1).toEqual(res2); // mismo resultado, venga el input en el orden que venga
  });
});

describe('colapso', () => {
  test('pliega según los puntos de corte PASADOS, no una constante interna', () => {
    const segmentos = [
      { zona: 1, pct: 20 },
      { zona: 2, pct: 30 },
      { zona: 3, pct: 25 },
      { zona: 4, pct: 15 },
      { zona: 5, pct: 10 },
    ];
    const corteClasico = colapso(segmentos, 2, 3); // suave=z1-2, medio=z3, fuerte=z4-5
    expect(corteClasico).toEqual({ suave: 50, medio: 25, fuerte: 25 });

    // Mover el corte cambia el resultado con los MISMOS datos.
    const otroCorte = colapso(segmentos, 1, 3);
    expect(otroCorte).toEqual({ suave: 20, medio: 55, fuerte: 25 });
  });

  test('los segmentos con zona null quedan fuera de los tres cubos, no caen en suave por defecto', () => {
    const segmentos = [
      { zona: 2, pct: 40 },
      { zona: null, pct: 30 }, // sin ancla que le pusiera zona: no cuenta en ningún cubo
      { zona: 4, pct: 30 },
    ];
    const res = colapso(segmentos, 2, 3);
    expect(res).toEqual({ suave: 40, medio: 0, fuerte: 30 });
    expect(res.suave + res.medio + res.fuerte).toBe(70); // nunca suma el pct del segmento sin zona
  });
});

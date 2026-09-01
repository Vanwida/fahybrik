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
  deltasDe,
  faltaComun,
  METROS_DE_REFERENCIA,
  MIN_SEMANAS_PARA_SUBIDA,
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
    umbral: null,
    zonas_ritmo: [],
    cadencia: [],
    por_tipo: [],
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

// deltasDe (volumen/forma/esfuerzos/cansado) + Pedido.pct_en_banda/juzgable —
// estas cifras se recalculaban en el cliente. DOS de ellas deciden algo: la
// subida de volumen es el segundo ingrediente del veredicto «cargando de
// más» (`veredictoDe`), y el porcentaje en banda decide si esa cifra sale
// coloreada o en tinta normal (`sePuedeJuzgarElPedido`). Si el cliente
// recalculara por su cuenta y divergiera del servidor, el atleta vería un
// veredicto que se contradice con su propia evidencia EN LA MISMA PANTALLA.
// Por eso los tests de más peso de aquí abajo comparan contra la función
// pura (`subidaDeVolumen`), nunca contra un literal reescrito a mano.

describe('deltasDe — volumen', () => {
  test('por debajo de MIN_SEMANAS_PARA_SUBIDA puntos semanales: null, NUNCA {subida_ratio: 0}', () => {
    // Un 0 se leería como "el volumen está plano"; la verdad es "no hay
    // semanas para decirlo". Confundir las dos cosas es el mismo error que un
    // porcentaje sin muestras (ver `Pedido.pct_en_banda`).
    const h = historia({
      semanas_km: [
        { semana: '2026-05-04', valor: 20 },
        { semana: '2026-05-11', valor: 20 },
        { semana: '2026-05-18', valor: 20 },
        { semana: '2026-05-25', valor: 20 },
        { semana: '2026-06-01', valor: 30 }, // 5 puntos: uno menos que MIN_SEMANAS_PARA_SUBIDA (6)
      ],
    });
    expect(h.semanas_km).toHaveLength(MIN_SEMANAS_PARA_SUBIDA - 1);
    expect(deltasDe(h).volumen).toBeNull();
  });

  test('en el mínimo exacto de MIN_SEMANAS_PARA_SUBIDA: presente', () => {
    const h = historia({
      semanas_km: [
        { semana: '2026-05-04', valor: 20 },
        { semana: '2026-05-11', valor: 20 },
        { semana: '2026-05-18', valor: 20 },
        { semana: '2026-05-25', valor: 20 },
        { semana: '2026-06-01', valor: 25 },
        { semana: '2026-06-08', valor: 25 }, // 6 puntos: justo MIN_SEMANAS_PARA_SUBIDA
      ],
    });
    expect(h.semanas_km).toHaveLength(MIN_SEMANAS_PARA_SUBIDA);
    const volumen = deltasDe(h).volumen;
    expect(volumen).not.toBeNull();
    expect(volumen!.semanas).toBe(MIN_SEMANAS_PARA_SUBIDA - 1);
  });

  test('subida_ratio servido es EXACTAMENTE subidaDeVolumen(h.semanas_km) — el test anti-divergencia', () => {
    // No se compara contra un literal reescrito a mano: si mañana
    // `subidaDeVolumen` cambia de fórmula y `deltasDe` no se actualiza a la
    // vez, este test lo pilla sin que nadie tenga que recalcular a mano el
    // número esperado.
    const semanas_km: PuntoSemana[] = [
      { semana: '2026-05-04', valor: 18 },
      { semana: '2026-05-11', valor: 22 },
      { semana: '2026-05-18', valor: 19 },
      { semana: '2026-05-25', valor: 21 },
      { semana: '2026-06-01', valor: 27 },
      { semana: '2026-06-08', valor: 24 },
      { semana: '2026-06-15', valor: 30 },
    ];
    const h = historia({ semanas_km });
    expect(deltasDe(h).volumen!.subida_ratio).toBe(subidaDeVolumen(semanas_km));
  });

  test('es un RATIO, no un porcentaje: una subida de ~24% se sirve como ~0.24, no como ~24', () => {
    // Guarda el bug de factor 100: si `deltasDe` alguna vez multiplicara por
    // 100 "para que se lea mejor", esta cifra dejaría de tener las mismas
    // unidades que `volume_surge_ratio`, con el que el veredicto la compara.
    const h = historia({
      semanas_km: [
        { semana: '2026-05-04', valor: 25 },
        { semana: '2026-05-11', valor: 25 },
        { semana: '2026-05-18', valor: 25 },
        { semana: '2026-05-25', valor: 25 }, // base = media de las 4 primeras = 25
        { semana: '2026-06-01', valor: 31 },
        { semana: '2026-06-08', valor: 31 }, // últimas 2 = 31 → 31/25 - 1 = 0.24
      ],
    });
    const ratio = deltasDe(h).volumen!.subida_ratio;
    expect(ratio).toBeCloseTo(0.24, 5);
    expect(Math.abs(ratio)).toBeLessThan(1); // si fuera 24 (bug de ×100), esto fallaría
  });
});

describe('deltasDe — forma', () => {
  test('con VO2max presente: forma es null — el titular de VO2max ya lleva su propio delta', () => {
    const h = historia({
      vo2: { valor: 52, delta: 1.4, ventana_semanas: 8, serie: [50, 51, 52] },
      al_pulso: [
        { semana: '2026-06-01', valor: 300 },
        { semana: '2026-06-08', valor: 280 },
      ],
    });
    expect(deltasDe(h).forma).toBeNull();
  });

  test('sin VO2max y con >=2 puntos en al_pulso: gana_s_km = primero - último, positivo si el ritmo bajó (mejoró)', () => {
    const h = historia({
      vo2: null,
      al_pulso: [
        { semana: '2026-06-01', valor: 300 },
        { semana: '2026-06-08', valor: 280 }, // ritmo BAJÓ 20 s/km: es mejora
      ],
    });
    expect(deltasDe(h).forma).toEqual({ gana_s_km: 20, semanas: 1 });
  });

  test('con menos de 2 puntos en al_pulso: null, tanto vacío como con uno solo', () => {
    expect(deltasDe(historia({ vo2: null, al_pulso: [] })).forma).toBeNull();
    expect(
      deltasDe(historia({ vo2: null, al_pulso: [{ semana: '2026-06-01', valor: 300 }] })).forma,
    ).toBeNull();
  });
});

describe('deltasDe — esfuerzos', () => {
  test('presente solo cuando METROS_DE_REFERENCIA está en esfuerzos Y en esfuerzos_antes', () => {
    const soloEnHoy = historia({
      esfuerzos: [{ metros: METROS_DE_REFERENCIA, segundos: 1200 }],
      esfuerzos_antes: [],
    });
    expect(deltasDe(soloEnHoy).esfuerzos).toBeNull();

    const soloEnAntes = historia({
      esfuerzos: [],
      esfuerzos_antes: [{ metros: METROS_DE_REFERENCIA, segundos: 1200 }],
    });
    expect(deltasDe(soloEnAntes).esfuerzos).toBeNull();

    const enLosDos = historia({
      esfuerzos: [{ metros: METROS_DE_REFERENCIA, segundos: 1180 }],
      esfuerzos_antes: [{ metros: METROS_DE_REFERENCIA, segundos: 1200 }],
    });
    expect(deltasDe(enLosDos).esfuerzos).not.toBeNull();
  });

  test('gana_s = antes - hoy, positivo si ahora se corre más rápido (menos segundos)', () => {
    const h = historia({
      esfuerzos: [{ metros: METROS_DE_REFERENCIA, segundos: 1180 }],
      esfuerzos_antes: [{ metros: METROS_DE_REFERENCIA, segundos: 1200 }], // 20 s más lento antes
    });
    expect(deltasDe(h).esfuerzos).toEqual({ gana_s: 20, metros: METROS_DE_REFERENCIA });
  });

  test('NO cae a otra distancia cuando falta 5000: null aunque 3000 y 10000 estén en los dos', () => {
    const h = historia({
      esfuerzos: [
        { metros: 3000, segundos: 700 },
        { metros: 10000, segundos: 2500 },
      ],
      esfuerzos_antes: [
        { metros: 3000, segundos: 720 },
        { metros: 10000, segundos: 2550 },
      ],
    });
    expect(deltasDe(h).esfuerzos).toBeNull();
  });
});

describe('deltasDe — cansado', () => {
  test('con menos de 2 puntos: null, tanto vacío como con uno solo', () => {
    expect(deltasDe(historia({ cansado: [] })).cansado).toBeNull();
    expect(
      deltasDe(historia({ cansado: [{ semana: '2026-06-01', coste_s_km: 320, parejas: 5 }] })).cansado,
    ).toBeNull();
  });

  test('mejora_s_km = primero - último, positivo cuando el coste de correr cansado bajó', () => {
    const h = historia({
      cansado: [
        { semana: '2026-06-01', coste_s_km: 320, parejas: 5 },
        { semana: '2026-06-08', coste_s_km: 310, parejas: 5 }, // coste BAJÓ 10 s/km: mejora
      ],
    });
    expect(deltasDe(h).cansado).toEqual({ mejora_s_km: 10, semanas: 1 });
  });

  test('redondeado a 1 decimal, no truncado ni a precisión cruda', () => {
    const h = historia({
      cansado: [
        { semana: '2026-06-01', coste_s_km: 300.3, parejas: 5 },
        { semana: '2026-06-08', coste_s_km: 292.14, parejas: 5 }, // diferencia cruda: 8.16
      ],
    });
    // 8.16 redondeado a 1 decimal es 8.2 — ni 8.1 (eso sería truncar) ni 8.16
    // (eso sería no redondear).
    expect(deltasDe(h).cansado).toEqual({ mejora_s_km: 8.2, semanas: 1 });
  });
});

describe('Pedido (como se sirve) — pct_en_banda y juzgable no cambian el contrato existente', () => {
  test('sePuedeJuzgarElPedido ignora sus propios pct_en_banda/juzgable: decide SOLO por evaluadas vs el umbral', () => {
    // Si la función alguna vez leyera `p.juzgable` en vez de recalcularlo,
    // este caso lo pillaría: aquí juzgable dice "sí" pero evaluadas está por
    // debajo del umbral, así que la respuesta correcta sigue siendo false.
    const contradictorio: Pedido = {
      evaluadas: M.min_reps_to_judge_band - 1,
      dentro: 10,
      fuera_lento: 0,
      fuera_rapido: 0,
      pct_en_banda: 82,
      juzgable: true,
    };
    expect(sePuedeJuzgarElPedido(contradictorio, M)).toBe(false);
  });

  test('coberturaDe con pedido: null sigue dando «intencion» — los campos nuevos viven DENTRO de Pedido y no existen cuando Pedido no existe', () => {
    const h = historia({ pedido: null });
    expect(coberturaDe(h, M).pedido).toEqual({ por: 'intencion' });
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
    const p: Pedido = { evaluadas: M.min_reps_to_judge_band - 1, dentro: 10, fuera_lento: 0, fuera_rapido: 0, pct_en_banda: null, juzgable: false };
    expect(sePuedeJuzgarElPedido(p, M)).toBe(false);
  });

  test('en el mínimo exacto: true — la comparación es >=', () => {
    const p: Pedido = { evaluadas: M.min_reps_to_judge_band, dentro: 10, fuera_lento: 0, fuera_rapido: 0, pct_en_banda: null, juzgable: false };
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

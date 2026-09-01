// Pure unit tests for shared/domain/running/same-hr-pace.ts — la lectura vive
// o muere en lo que RECHAZA: extrapolar fuera de banda, mezclar cansado con
// fresco, o inventar un cero donde no hay semana sería peor que no tener el
// dato. Los tests centrales son de DISCIPLINA de rechazo, no de que la media
// salga bien.

import { describe, expect, test } from 'vitest';
import {
  buildSameHrPaceSeries,
  referenceBpmFromBand,
  type SameHrObservation,
  type SameHrOptions,
} from '@fahybrid/shared/domain/running/same-hr-pace';

const OPTS: SameHrOptions = {
  reference_bpm: 150,
  tolerance_bpm: 5,
  min_distance_m: 1000,
  gradient_retires_pace_pct: 3,
};

/** Un tramo limpio y aceptable por defecto — cada test sólo cambia el campo
 *  que le importa comprobar. Orden de parámetros = orden de la interfaz. */
function obs(
  week_start: string,
  avg_hr: number,
  pace_s_per_km: number,
  distance_m = 2000,
  gradient_pct: number | null = null,
  effort: 'fresco' | 'fatigado' | null = 'fresco',
): SameHrObservation {
  return { week_start, avg_hr, pace_s_per_km, distance_m, gradient_pct, effort };
}

describe('buildSameHrPaceSeries — una semana sin tramos válidos no existe', () => {
  test('todas las observaciones de una semana rechazadas: la semana está AUSENTE, nunca un punto en 0', () => {
    const observations = [
      obs('2026-07-06', 150, 300, 2000), // semana buena, dentro de banda
      obs('2026-07-13', 200, 300, 2000), // semana entera fuera de banda (50 ppm de más)
    ];
    const res = buildSameHrPaceSeries(observations, OPTS);
    expect(res.points).toHaveLength(1);
    expect(res.points[0]!.semana).toBe('2026-07-06');
    expect(res.points.some((p) => p.semana === '2026-07-13')).toBe(false);
    expect(res.points.every((p) => p.valor > 0)).toBe(true); // nunca un cero disfrazado
  });
});

describe('buildSameHrPaceSeries — qué se descarta, y por qué', () => {
  test('fuera de tolerance_bpm: se rechaza y se cuenta en fuera_de_banda — nunca se extrapola', () => {
    const res = buildSameHrPaceSeries([obs('2026-07-06', 160, 300)], OPTS); // 150±5, 160 está a 10
    expect(res.rejected.fuera_de_banda).toBe(1);
    expect(res.accepted).toBe(0);
    expect(res.points).toEqual([]);
  });

  test('por debajo de min_distance_m: se rechaza y se cuenta en demasiado_corto', () => {
    const res = buildSameHrPaceSeries([obs('2026-07-06', 150, 300, 500)], OPTS); // mínimo 1000
    expect(res.rejected.demasiado_corto).toBe(1);
    expect(res.points).toEqual([]);
  });

  test('pendiente conocida y empinada (>=3 y <=-3, los dos signos) se rechaza — se cuenta en en_cuesta', () => {
    const res = buildSameHrPaceSeries(
      [
        obs('2026-07-06', 150, 300, 2000, 3), // +3%, el umbral exacto
        obs('2026-07-13', 150, 300, 2000, -3), // -3%, el mismo umbral en el otro signo
      ],
      OPTS,
    );
    expect(res.rejected.en_cuesta).toBe(2);
    expect(res.points).toEqual([]);
  });

  test('el umbral de pendiente es DATO DEL COACH, no una constante del módulo', () => {
    // Un 5 % cae con el defecto (3) y pasa con el umbral de un coach de trail
    // (8). Si alguien volviera a cablear GRADIENT_RETIRES_PACE_PCT dentro del
    // cálculo, este test es el que lo caza: los dos casos darían lo mismo.
    const enCuesta = [obs('2026-07-06', 150, 300, 2000, 5)];

    const conDefecto = buildSameHrPaceSeries(enCuesta, OPTS);
    expect(conDefecto.rejected.en_cuesta).toBe(1);
    expect(conDefecto.points).toEqual([]);

    const conElDelCoach = buildSameHrPaceSeries(enCuesta, { ...OPTS, gradient_retires_pace_pct: 8 });
    expect(conElDelCoach.rejected.en_cuesta).toBe(0);
    expect(conElDelCoach.points).toEqual([{ semana: '2026-07-06', valor: 300, tramos: 1 }]);
  });

  test('pendiente NULA (terreno desconocido) NO se rechaza — la asimetría es deliberada', () => {
    const res = buildSameHrPaceSeries([obs('2026-07-06', 150, 300, 2000, null)], OPTS);
    expect(res.rejected.en_cuesta).toBe(0);
    expect(res.points).toEqual([{ semana: '2026-07-06', valor: 300, tramos: 1 }]);
  });

  test("sólo cae el 'fatigado': 'fresco' y null entran — misma asimetría que la pendiente", () => {
    // Verificado contra la base real (12-ago): `context_format` viene vacío en
    // la práctica totalidad de los tramos, así que `classifyEffort` devuelve
    // null y exigir prueba de frescura dejaba la lectura en CERO observaciones
    // sobre los 67 tramos del atleta con más carrera. Lo desconocido es ruido y
    // se promedia; lo que se sabe fatigado es sesgo y se quita.
    const res = buildSameHrPaceSeries(
      [
        obs('2026-07-06', 150, 300, 2000, null, 'fresco'),
        obs('2026-07-06', 150, 300, 2000, null, 'fatigado'),
        obs('2026-07-06', 150, 300, 2000, null, null),
      ],
      OPTS,
    );
    expect(res.rejected.fatigado).toBe(1);
    expect(res.accepted).toBe(2);
    expect(res.points).toEqual([{ semana: '2026-07-06', valor: 300, tramos: 2 }]);
  });
});

describe('buildSameHrPaceSeries — sin ancla no hay nada contra qué normalizar', () => {
  test('reference_bpm de 0 o NaN: serie vacía — nunca ritmos crudos disfrazados de corregidos', () => {
    const observations = [obs('2026-07-06', 150, 300, 2000)];

    const zero = buildSameHrPaceSeries(observations, { ...OPTS, reference_bpm: 0 });
    expect(zero.points).toEqual([]);
    expect(zero.accepted).toBe(0);
    expect(zero.reference_bpm).toBe(0);
    // Las observaciones ni se evalúan: si el mecanismo cayera a ritmos crudos,
    // aquí se verían rechazos fantasma. No hay ninguno.
    expect(zero.rejected).toEqual({
      sin_pulso_util: 0,
      fuera_de_banda: 0,
      demasiado_corto: 0,
      en_cuesta: 0,
      fatigado: 0,
    });

    const nan = buildSameHrPaceSeries(observations, { ...OPTS, reference_bpm: NaN });
    expect(nan.points).toEqual([]);
    expect(nan.accepted).toBe(0);
  });
});

describe('buildSameHrPaceSeries — la dirección de la corrección', () => {
  test('pulso MÁS ALTO que la referencia corrige a un ritmo MÁS LENTO (número mayor), y al revés', () => {
    // A 153 ppm (por encima de la referencia, dentro de ±5) corriendo a
    // 300 s/km: ese ritmo le costó MÁS pulso que la referencia, así que AL
    // PULSO DE REFERENCIA (más bajo) habría ido más lento:
    // 300 × (153/150) = 306.
    const arriba = buildSameHrPaceSeries([obs('2026-07-06', 153, 300)], OPTS);
    expect(arriba.points[0]!.valor).toBe(306);
    expect(arriba.points[0]!.valor).toBeGreaterThan(300);

    // A 147 ppm (por debajo) al mismo ritmo crudo: le costó MENOS pulso, así
    // que a la referencia (más alta) habría ido más rápido:
    // 300 × (147/150) = 294.
    const abajo = buildSameHrPaceSeries([obs('2026-07-13', 147, 300)], OPTS);
    expect(abajo.points[0]!.valor).toBe(294);
    expect(abajo.points[0]!.valor).toBeLessThan(300);
  });
});

describe('buildSameHrPaceSeries — ponderación por distancia', () => {
  test('un tramo de 8000 m pesa mucho más que uno de 1000 m — el resultado queda cerca del largo, no de la media simple', () => {
    // Los dos AL pulso de referencia exacto (corrección = ×1), para poder
    // pesar a mano sin mezclar la corrección con la ponderación.
    const res = buildSameHrPaceSeries(
      [
        obs('2026-07-06', 150, 300, 8000), // 5:00/km, el grueso de la semana
        obs('2026-07-06', 150, 400, 1000), // 6:40/km, un tramo corto y mucho más lento
      ],
      OPTS,
    );
    // Ponderado: (300×8000 + 400×1000) / 9000 = 2 800 000 / 9000 = 311,1 → 311.
    const mediaSimple = (300 + 400) / 2; // 350 — lo que daría contar los tramos igual
    expect(res.points[0]!.valor).toBe(311);
    expect(res.points[0]!.tramos).toBe(2);
    expect(Math.abs(res.points[0]!.valor - 300)).toBeLessThan(Math.abs(mediaSimple - 300));
  });
});

describe('buildSameHrPaceSeries — orden', () => {
  test('los puntos vuelven ordenados ascendente por semana, aunque las observaciones lleguen desordenadas', () => {
    const res = buildSameHrPaceSeries(
      [obs('2026-07-20', 150, 300), obs('2026-07-06', 150, 300), obs('2026-07-13', 150, 300)],
      OPTS,
    );
    expect(res.points.map((p) => p.semana)).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
  });
});

describe('referenceBpmFromBand', () => {
  test('null cuando falta un borde de la banda — la Z1 no tiene suelo, la Z5 no tiene techo', () => {
    expect(referenceBpmFromBand({ min_bpm: null, max_bpm: 140 })).toBeNull();
    expect(referenceBpmFromBand({ min_bpm: 120, max_bpm: null })).toBeNull();
  });

  test('null cuando el techo no supera al suelo, o el suelo no es positivo — eso no es una banda', () => {
    expect(referenceBpmFromBand({ min_bpm: 150, max_bpm: 150 })).toBeNull();
    expect(referenceBpmFromBand({ min_bpm: 150, max_bpm: 140 })).toBeNull();
    expect(referenceBpmFromBand({ min_bpm: 0, max_bpm: 140 })).toBeNull();
  });

  test('el punto medio, redondeado', () => {
    expect(referenceBpmFromBand({ min_bpm: 120, max_bpm: 140 })).toBe(130);
    expect(referenceBpmFromBand({ min_bpm: 121, max_bpm: 140 })).toBe(131); // 130,5 → 131
  });
});

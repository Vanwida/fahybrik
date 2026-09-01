import { describe, expect, it } from 'vitest';
import {
  computeKmSplits,
  MAX_INTERPOLATION_GAP_S,
  type KmSplitsInput,
  type RunningTraceSeries,
} from '@fahybrid/shared/domain/running/km-splits';

// Los kilómetros se DERIVAN de la traza, nunca se persisten (docs/DECISIONS.md,
// 2026-08-11 "La carrera guarda su NEGATIVO"). Esta suite es pura — sin DB — y
// cubre exactamente los cinco casos que el contrato exige: hueco sin cobertura,
// último km parcial, traza de un solo punto, eje desordenado, y un cruce que
// cae justo entre dos muestras.

const series = (offsets_s: number[], values: number[]): RunningTraceSeries => ({
  offsets_s,
  values,
});

const input = (over: Partial<KmSplitsInput> & { distance: RunningTraceSeries }): KmSplitsInput => ({
  speed: null,
  hr: null,
  altitude: null,
  ...over,
});

describe('computeKmSplits — traza densa y regular', () => {
  it('corta cada kilómetro completo con su tiempo y ritmo, sin cola parcial cuando la distancia cae en un múltiplo exacto', () => {
    // 10 m/s constantes, una muestra cada 10 s, 3000 m exactos.
    const offsets = Array.from({ length: 31 }, (_, i) => i * 10);
    const values = offsets.map((t) => t * 10);
    const splits = computeKmSplits(input({ distance: series(offsets, values) }));

    expect(splits).toHaveLength(3);
    for (const [i, split] of splits.entries()) {
      expect(split.index).toBe(i + 1);
      expect(split.partial).toBe(false);
      expect(split.distance_m).toBe(1000);
      expect(split.duration_s).toBe(100);
      expect(split.avg_pace_s_per_km).toBe(100);
    }
  });
});

describe('computeKmSplits — kilómetro que cae justo entre dos muestras', () => {
  it('interpola el cruce linealmente entre las dos muestras que lo rodean', () => {
    // (0,0) → (100,2000): el km1 (1000 m) cae exactamente a mitad de camino en
    // tiempo Y distancia; el km2 termina en la propia muestra final.
    const splits = computeKmSplits(input({ distance: series([0, 100], [0, 2000]) }));

    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ index: 1, partial: false, distance_m: 1000, duration_s: 50 });
    expect(splits[1]).toMatchObject({ index: 2, partial: false, distance_m: 1000, duration_s: 50 });
    expect(splits[0]!.avg_pace_s_per_km).toBe(50);
  });
});

describe('computeKmSplits — último kilómetro parcial', () => {
  it('devuelve la cola con su distancia real, nunca redondeada a 1000 m', () => {
    const splits = computeKmSplits(
      input({ distance: series([0, 100, 200, 250], [0, 1000, 2000, 2350]) }),
    );

    expect(splits).toHaveLength(3);
    expect(splits[0]).toMatchObject({ index: 1, partial: false, distance_m: 1000 });
    expect(splits[1]).toMatchObject({ index: 2, partial: false, distance_m: 1000 });

    const tail = splits[2]!;
    expect(tail).toMatchObject({ index: 3, partial: true, distance_m: 350, duration_s: 50 });
    expect(tail.avg_pace_s_per_km).toBeCloseTo(50 / 0.35, 5);
  });

  it('no añade cola cuando la distancia final cae justo en un múltiplo de 1000 m', () => {
    const splits = computeKmSplits(input({ distance: series([0, 100], [0, 1000]) }));
    expect(splits).toHaveLength(1);
    expect(splits[0]!.partial).toBe(false);
  });
});

describe('computeKmSplits — hueco sin cobertura', () => {
  // 0→50→95→100 (denso) cruza el km1 limpio en t=97.5; luego un hueco de 130 s
  // (100→230, por encima de MAX_INTERPOLATION_GAP_S) cae DENTRO de la ventana
  // del km2, aunque los dos bordes del km2 (97.5 y 237.5) se interpolen sobre
  // pares densos. El km2 debe declararse sin cobertura pese a tener bordes
  // limpios — es el hueco INTERIOR el que lo invalida.
  const offsets = [0, 50, 95, 100, 230, 235, 240];
  const values = [0, 500, 980, 1020, 1900, 1950, 2050];

  it('declara sin cobertura (null) el kilómetro cuyo hueco interior supera el umbral, sin inventar un ritmo', () => {
    const splits = computeKmSplits(input({ distance: series(offsets, values) }));
    expect(splits).toHaveLength(3);

    const km1 = splits[0]!;
    expect(km1.distance_m).toBe(1000);
    expect(km1.duration_s).toBeCloseTo(97.5, 5);

    const km2 = splits[1]!;
    expect(km2.index).toBe(2);
    expect(km2.partial).toBe(false);
    // Se sabe que el kilómetro se cubrió (distance_m sigue siendo 1000) — lo
    // que no se sabe es CUÁNTO tardó, así que el resto es null, no un guess.
    expect(km2.distance_m).toBe(1000);
    expect(km2.duration_s).toBeNull();
    expect(km2.avg_pace_s_per_km).toBeNull();
    expect(km2.avg_hr).toBeNull();
    expect(km2.elevation_gain_m).toBeNull();
  });

  it('el kilómetro SIGUIENTE a uno sin cobertura sigue siendo fiable si su propio cruce se interpola sobre un par denso', () => {
    // km3 (parcial) arranca en el cruce de km2 (237.5, interpolado sobre un
    // hueco de 5 s) y termina en la última muestra (240) — su propia ventana
    // no contiene el hueco de 130 s, así que sí tiene cobertura.
    const splits = computeKmSplits(input({ distance: series(offsets, values) }));
    const tail = splits[2]!;
    expect(tail).toMatchObject({ index: 3, partial: true, distance_m: 50 });
    expect(tail.duration_s).toBeCloseTo(2.5, 5);
  });

  it('un hueco justo por debajo del umbral no invalida el tramo', () => {
    const offsetsOk = [0, 50, 100, 100 + MAX_INTERPOLATION_GAP_S, 100 + MAX_INTERPOLATION_GAP_S + 10];
    const valuesOk = [0, 500, 1000, 1900, 2000];
    const splits = computeKmSplits(input({ distance: series(offsetsOk, valuesOk) }));
    expect(splits[1]!.duration_s).not.toBeNull();
  });
});

describe('computeKmSplits — traza de un solo punto', () => {
  it('reporta un único parcial anclado al inicio de sesión (t=0, dist=0), sin necesitar un segundo punto', () => {
    const splits = computeKmSplits(input({ distance: series([42], [300]) }));
    expect(splits).toHaveLength(1);
    expect(splits[0]).toMatchObject({ index: 1, partial: true, distance_m: 300, duration_s: 42 });
  });

  it('sin distancia recorrida (0 o negativa), no hay nada que reportar', () => {
    expect(computeKmSplits(input({ distance: series([10], [0]) }))).toEqual([]);
    expect(computeKmSplits(input({ distance: series([], []) }))).toEqual([]);
  });

  it('un único punto que YA supera 1000 m no tiene par del que interpolar ningún cruce: todo distancia, nada de tiempo', () => {
    const splits = computeKmSplits(input({ distance: series([10], [1500]) }));
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ index: 1, partial: false, distance_m: 1000, duration_s: null });
    expect(splits[1]).toMatchObject({ index: 2, partial: true, distance_m: 500, duration_s: null });
  });
});

describe('computeKmSplits — eje desordenado', () => {
  it('ordena por tiempo antes de cortar, así que un payload desordenado da el mismo resultado que uno ordenado', () => {
    const ordered = computeKmSplits(input({ distance: series([0, 50, 100], [0, 1000, 2000]) }));
    const shuffled = computeKmSplits(input({ distance: series([100, 0, 50], [2000, 0, 1000]) }));
    expect(shuffled).toEqual(ordered);
  });
});

describe('computeKmSplits — ritmo: velocímetro vs geometría', () => {
  it('prefiere la media del velocímetro sobre distancia/tiempo cuando hay muestras en la ventana', () => {
    // Geometría: 100 m en... espera, 1000 m en 100 s → 100 s/km. El velocímetro
    // dice constante 20 m/s en toda la ventana → 1000/20 = 50 s/km. Deben
        // discrepar para probar que el velocímetro gana, no la geometría.
    const splits = computeKmSplits(
      input({
        distance: series([0, 100], [0, 1000]),
        speed: series([10, 90], [20, 20]),
      }),
    );
    expect(splits[0]!.duration_s).toBe(100); // el TIEMPO sigue siendo el geométrico
    expect(splits[0]!.avg_pace_s_per_km).toBe(50); // el RITMO lo da el velocímetro
  });

  it('sin velocímetro (o sin muestras en la ventana), cae al ritmo geométrico', () => {
    const splits = computeKmSplits(input({ distance: series([0, 100], [0, 1000]) }));
    expect(splits[0]!.avg_pace_s_per_km).toBe(100);
  });
});

describe('computeKmSplits — pulso medio y desnivel', () => {
  it('promedia el pulso y suma solo las subidas de altitud dentro de la ventana del tramo', () => {
    const splits = computeKmSplits(
      input({
        distance: series([0, 100], [0, 1000]),
        hr: series([10, 50, 90], [140, 150, 160]),
        altitude: series([0, 50, 100], [10, 15, 12]),
      }),
    );
    expect(splits[0]!.avg_hr).toBe(150);
    expect(splits[0]!.elevation_gain_m).toBe(5); // +5 (10→15); la bajada 15→12 no cuenta
  });

  it('sin pulso o altitud, esos campos quedan null — nunca un 0 fabricado', () => {
    const splits = computeKmSplits(input({ distance: series([0, 100], [0, 1000]) }));
    expect(splits[0]!.avg_hr).toBeNull();
    expect(splits[0]!.elevation_gain_m).toBeNull();
  });
});

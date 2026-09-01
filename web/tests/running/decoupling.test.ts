import { describe, expect, it } from 'vitest';
import {
  computeDecoupling,
  MIN_SUSTAINED_DURATION_S,
  WARMUP_SKIP_S,
  type DecouplingInput,
  type EffortLeg,
  type RunningTraceSeries,
} from '@fahybrid/shared/domain/running/decoupling';

const series = (offsets_s: number[], values: number[]): RunningTraceSeries => ({ offsets_s, values });

// Traza densa y constante entre [start,end], útil para poblar cobertura sin
// tener que enumerar cada punto a mano.
const dense = (start: number, end: number, stepS: number, value: number): RunningTraceSeries => {
  const offsets_s: number[] = [];
  const values: number[] = [];
  for (let t = start; t <= end; t += stepS) {
    offsets_s.push(t);
    values.push(value);
  }
  return { offsets_s, values };
};

function mergeSeries(...parts: RunningTraceSeries[]): RunningTraceSeries {
  return {
    offsets_s: parts.flatMap((p) => p.offsets_s),
    values: parts.flatMap((p) => p.values),
  };
}

const input = (over: Partial<DecouplingInput> & { legs: EffortLeg[] }): DecouplingInput => ({
  hr: series([], []),
  speed: series([], []),
  ...over,
});

describe('computeDecoupling — solo esfuerzos sostenidos', () => {
  it('una sesión de series (varios tramos main, con recuperación entre ellas) da null — NO es ruido con forma de dato', () => {
    const legs: EffortLeg[] = [
      { role: 'work', phase: 'main', start_s: 0, end_s: 200 },
      { role: 'recovery', phase: 'main', start_s: 200, end_s: 260 },
      { role: 'work', phase: 'main', start_s: 260, end_s: 460 },
    ];
    const hr = dense(0, 460, 5, 150);
    const speed = dense(0, 460, 5, 3);
    expect(computeDecoupling(input({ legs, hr, speed }))).toBeNull();
  });

  it('una sesión progresiva (varios tramos "work" sin recuperación, a propósito) TAMBIÉN da null', () => {
    // El método asume esfuerzo CONSTANTE. Dos tramos aunque ninguno sea
    // "recovery" ya no lo es — subir de zona a propósito no es deriva.
    const legs: EffortLeg[] = [
      { role: 'work', phase: 'main', start_s: 0, end_s: 900 },
      { role: 'work', phase: 'main', start_s: 900, end_s: 1800 },
    ];
    const hr = dense(0, 1800, 10, 150);
    const speed = dense(0, 1800, 10, 3);
    expect(computeDecoupling(input({ legs, hr, speed }))).toBeNull();
  });

  it('sin ningún tramo de fase "main" (solo calentamiento, por ejemplo), null — no hay nada que medir', () => {
    const legs: EffortLeg[] = [{ role: 'work', phase: 'warmup', start_s: 0, end_s: 300 }];
    expect(computeDecoupling(input({ legs, hr: dense(0, 300, 5, 150), speed: dense(0, 300, 5, 3) }))).toBeNull();
  });
});

describe('computeDecoupling — cálculo sobre un único tramo sostenido', () => {
  it('positivo cuando el factor de eficiencia CAE de la primera a la segunda mitad (cuesta más pulso mantener el ritmo)', () => {
    const legs: EffortLeg[] = [
      { role: 'work', phase: 'warmup', start_s: 0, end_s: 300 },
      { role: 'work', phase: 'main', start_s: 300, end_s: 1800 }, // 1500 s, >= mínimo
      { role: 'work', phase: 'cooldown', start_s: 1800, end_s: 2000 },
    ];
    // Mitad 1 [300,1050]: 150 lpm @ 3.0 m/s → EF 0.020. Mitad 2 [1050,1800]: 160 lpm @ 2.8 m/s → EF 0.0175.
    const hr = mergeSeries(dense(300, 1040, 20, 150), dense(1100, 1800, 20, 160));
    const speed = mergeSeries(dense(300, 1040, 20, 3.0), dense(1100, 1800, 20, 2.8));
    const result = computeDecoupling(input({ legs, hr, speed }));
    expect(result).not.toBeNull();
    // (0.02 - 0.0175) / 0.02 * 100 = 12.5 %
    expect(result!).toBeCloseTo(12.5, 1);
  });

  it('negativo cuando el factor de eficiencia MEJORA (segunda mitad más eficiente) — es un resultado válido, no un error', () => {
    const legs: EffortLeg[] = [{ role: 'work', phase: 'main', start_s: 0, end_s: 1500 }];
    const hr = mergeSeries(dense(0, 740, 20, 150), dense(760, 1500, 20, 145));
    const speed = mergeSeries(dense(0, 740, 20, 2.8), dense(760, 1500, 20, 3.0));
    const result = computeDecoupling(input({ legs, hr, speed }));
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });
});

describe('computeDecoupling — duración mínima', () => {
  it('un tramo main por debajo del mínimo sostenido da null, aunque los datos sean perfectos', () => {
    const legs: EffortLeg[] = [{ role: 'work', phase: 'main', start_s: 0, end_s: MIN_SUSTAINED_DURATION_S - 1 }];
    const hr = dense(0, MIN_SUSTAINED_DURATION_S - 1, 10, 150);
    const speed = dense(0, MIN_SUSTAINED_DURATION_S - 1, 10, 3);
    expect(computeDecoupling(input({ legs, hr, speed }))).toBeNull();
  });
});

describe('computeDecoupling — cobertura real de pulso y velocidad en las dos mitades', () => {
  const legs: EffortLeg[] = [{ role: 'work', phase: 'main', start_s: 0, end_s: 1800 }];

  it('sin velocidad en la segunda mitad, null', () => {
    const hr = dense(0, 1800, 10, 150);
    const speed = dense(0, 900, 10, 3); // se corta justo en el ecuador
    expect(computeDecoupling(input({ legs, hr, speed }))).toBeNull();
  });

  it('un hueco enorme dentro de una mitad invalida el tramo, aunque haya muestras a los dos lados', () => {
    const hr = dense(0, 1800, 10, 150);
    // Mitad 1 [0,900]: denso hasta 300, luego un hueco de 400 s, luego denso otra vez.
    const speed = mergeSeries(dense(0, 300, 10, 3), dense(700, 900, 10, 3), dense(900, 1800, 10, 3));
    expect(computeDecoupling(input({ legs, hr, speed }))).toBeNull();
  });

  it('menos de 4 muestras en una mitad, null aunque no haya un hueco enorme', () => {
    const hr = series([0, 400, 800, 900, 1200, 1400, 1600, 1800], [150, 150, 150, 150, 150, 150, 150, 150]);
    const speed = series([0, 400, 900, 1200, 1400, 1600, 1800], [3, 3, 3, 3, 3, 3, 3]); // 2 en la 1ª mitad
    expect(computeDecoupling(input({ legs, hr, speed }))).toBeNull();
  });
});

describe('computeDecoupling — sin estructura de tramos: calentamiento fijo excluido', () => {
  it('excluye los primeros WARMUP_SKIP_S antes de partir en mitades, aunque no haya tramos etiquetados', () => {
    // Los primeros 10 min llevan un pulso de "calentamiento" deliberadamente
    // absurdo (180 lpm a 2.0 m/s) que arruinaría el resultado si no se excluyera.
    const warmup = dense(0, WARMUP_SKIP_S - 10, 10, 180);
    const warmupSpeed = dense(0, WARMUP_SKIP_S - 10, 10, 2.0);
    // Efecto real: [600,2400] → mitad1 [600,1500] 150@3.0 (EF .02), mitad2 [1500,2400] 155@2.9 (EF .0187...)
    const hrMain = mergeSeries(dense(600, 1490, 20, 150), dense(1510, 2400, 20, 155));
    const speedMain = mergeSeries(dense(600, 1490, 20, 3.0), dense(1510, 2400, 20, 2.9));

    const result = computeDecoupling(
      input({
        legs: [],
        hr: mergeSeries(warmup, hrMain),
        speed: mergeSeries(warmupSpeed, speedMain),
      }),
    );
    expect(result).not.toBeNull();
    // Si el calentamiento NO se hubiera excluido, el resultado saldría muy
    // distinto (la mitad 1 se contaminaría con 180 lpm/2.0 m/s). Con la
    // exclusión, el valor cae en el rango del cálculo real de arriba (~6.45 %).
    expect(result!).toBeGreaterThan(5);
    expect(result!).toBeLessThan(8);
  });
});

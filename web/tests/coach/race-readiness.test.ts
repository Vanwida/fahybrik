// Una fórmula, un número: el roster y la ficha del atleta tienen que dar lo
// mismo, y «no puntuable» no es lo mismo que «cero».

import { describe, expect, test } from 'vitest';
import {
  buildRaceReadinessHistory,
  estimateRaceReadiness,
  RACE_READINESS_BANDS,
  RACE_READINESS_BAND_MAX,
  readRaceReadiness,
} from '@fahybrid/shared/domain/coach/race-readiness';
import { readLoadCoverage, summarizeLoad } from '@fahybrid/shared/domain/training-load';
import type { RaceReadinessInput } from '@fahybrid/shared/domain/coach/race-readiness';
import type { DailyTss } from '@fahybrid/shared/domain/training-load';

function coverage(knownSeconds: number, unknownSeconds: number, unknownSessions: number) {
  return readLoadCoverage(
    summarizeLoad([
      {
        date: '2026-07-01',
        tss: 60,
        known_seconds: knownSeconds,
        unknown_seconds: unknownSeconds,
        unknown_sessions: unknownSessions,
      },
    ]),
  );
}

const FULL = coverage(3600, 0, 0);
const HOLED = coverage(1800, 1800, 2);

function input(overrides: Partial<RaceReadinessInput> = {}): RaceReadinessInput {
  return {
    tsb: 0,
    compliance_pct: 90,
    hrv_delta_ms: 0,
    active_days_7d: 4,
    load_coverage: FULL,
    ...overrides,
  };
}

describe('estimateRaceReadiness', () => {
  test('con las cuatro señales puntúa dentro de 0..100', () => {
    const score = estimateRaceReadiness(input());
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  test('más frescura puntúa más', () => {
    const fresh = estimateRaceReadiness(input({ tsb: 10 }))!;
    const cooked = estimateRaceReadiness(input({ tsb: -10 }))!;
    expect(fresh).toBeGreaterThan(cooked);
  });

  test('sin ninguna señal no hay número: no se inventa un ~50 de partida', () => {
    expect(
      estimateRaceReadiness(
        input({ active_days_7d: 0, hrv_delta_ms: null, compliance_pct: null }),
      ),
    ).toBeNull();
  });

  test('sin TSB no hay número: la frescura son 40 de los 100 puntos', () => {
    // La copia de la ficha hacía `tsb ?? 0`, que son 20 de esos 40 puntos
    // regalados a un atleta cuya frescura nadie había calculado.
    expect(estimateRaceReadiness(input({ tsb: null }))).toBeNull();
  });

  test('sin adherencia tampoco: son 30 de los 100 puntos', () => {
    // Era `COMPLIANCE_UNKNOWN_PTS = 20` de 30. Un atleta sin nada programado
    // cobraba dos tercios de la banda por no tener el dato.
    expect(estimateRaceReadiness(input({ compliance_pct: null }))).toBeNull();
  });

  test('sin variabilidad tampoco: son 20 de los 100 puntos', () => {
    // Era `HRV_UNKNOWN_PTS = 10` de 20 — la mitad exacta de la banda, a todo el
    // mundo, todos los días, sin mirar una sola fila.
    expect(estimateRaceReadiness(input({ hrv_delta_ms: null }))).toBeNull();
  });

  test('el 50 de partida no sobrevive repartido en componentes', () => {
    // La prueba de que no queda ningún «valor neutro»: con las tres señales
    // ausentes y sólo la actividad medida, no sale un número — antes salían
    // 20 + 10 + actividad, es decir un ~35 para alguien de quien no se sabe nada.
    expect(
      estimateRaceReadiness(
        input({ tsb: null, compliance_pct: null, hrv_delta_ms: null, active_days_7d: 5 }),
      ),
    ).toBeNull();
  });

  test('con la carga a medias tampoco: el número saldría con ±40 de incertidumbre', () => {
    expect(estimateRaceReadiness(input({ load_coverage: HOLED }))).toBeNull();
    expect(estimateRaceReadiness(input({ load_coverage: FULL }))).not.toBeNull();
  });

  test('la puerta de la cobertura manda incluso sobre un atleta impecable', () => {
    expect(
      estimateRaceReadiness(
        input({ tsb: 10, compliance_pct: 100, hrv_delta_ms: 10, load_coverage: HOLED }),
      ),
    ).toBeNull();
  });

  test('los cuatro tramos suman 100 en el mejor caso posible', () => {
    expect(
      estimateRaceReadiness(
        input({ tsb: 10, compliance_pct: 100, hrv_delta_ms: 10, active_days_7d: 7 }),
      ),
    ).toBe(100);
  });
});

// El desglose que se PINTA. La barra de la pestaña Rendimiento lo dibujaba con su
// propia copia de los techos (VFC = 12), así que se llenaba sobre 92 puntos bajo
// un titular que decía «/ 100».
describe('readRaceReadiness · el desglose', () => {
  test('los techos suman 100 y están en el dominio, no en la pantalla', () => {
    const total = RACE_READINESS_BANDS.reduce((s, b) => s + RACE_READINESS_BAND_MAX[b], 0);
    expect(total).toBe(100);
  });

  test('los cuatro tramos suman EXACTAMENTE el índice que se enseña', () => {
    for (const tsb of [-10, -3, 0, 4.7, 10]) {
      for (const compliance_pct of [0, 37, 100]) {
        for (const hrv_delta_ms of [-9, -0.5, 0, 3.4, 9]) {
          const { reading } = readRaceReadiness(input({ tsb, compliance_pct, hrv_delta_ms }));
          expect(reading).not.toBeNull();
          const sum = RACE_READINESS_BANDS.reduce((s, b) => s + reading!.bands[b], 0);
          expect(sum).toBe(reading!.score);
        }
      }
    }
  });

  test('ningún tramo se pasa de su techo', () => {
    const { reading } = readRaceReadiness(
      input({ tsb: 999, compliance_pct: 100, hrv_delta_ms: 999, active_days_7d: 99 }),
    );
    for (const b of RACE_READINESS_BANDS) {
      expect(reading!.bands[b]).toBeLessThanOrEqual(RACE_READINESS_BAND_MAX[b]);
      expect(reading!.bands[b]).toBeGreaterThanOrEqual(0);
    }
  });

  test('lo que falta se NOMBRA, y el hueco lleva salida — nunca un hueco mudo', () => {
    const noHrv = readRaceReadiness(input({ hrv_delta_ms: null }));
    expect(noHrv.reading).toBeNull();
    expect(noHrv.gap!.reason).toBe('missing_inputs');
    expect(noHrv.gap!.missing).toEqual(['hrv']);
    expect(noHrv.gap!.note_es).toContain('variabilidad');
    expect(noHrv.gap!.action_es).not.toBeNull();

    const noBoth = readRaceReadiness(input({ compliance_pct: null, hrv_delta_ms: null }));
    expect(noBoth.gap!.missing).toEqual(['compliance', 'hrv']);
    // 30 + 20 = la incertidumbre que se declara, no un número que se inventa.
    expect(noBoth.gap!.note_es).toContain('50');

    const holed = readRaceReadiness(input({ load_coverage: HOLED }));
    expect(holed.reading).toBeNull();
    expect(holed.gap!.reason).toBe('partial_coverage');
    expect(holed.gap!.action_es).toMatch(/RPE/);

    const nothing = readRaceReadiness(
      input({ active_days_7d: 0, hrv_delta_ms: null, compliance_pct: null }),
    );
    expect(nothing.reading).toBeNull();
    expect(nothing.gap!.reason).toBe('no_signal');
    expect(nothing.gap!.action_es).not.toBeNull();
  });

  test('cada tramo se mueve SOLO con su señal', () => {
    const base = readRaceReadiness(input()).reading!;
    const better = readRaceReadiness(input({ hrv_delta_ms: 6 })).reading!;
    expect(better.bands.hrv).toBeGreaterThan(base.bands.hrv);
    expect(better.bands.compliance).toBe(base.bands.compliance);
    expect(better.bands.freshness).toBe(base.bands.freshness);
  });
});

// El histórico de 90 días. La versión que sustituye leía `avg(load_score)` de una
// tabla `training_load` que NO EXISTE en producción, lo metía en un campo llamado
// `tsb` y regalaba 20/20/12/5 puntos cuando faltaba el dato.
describe('buildRaceReadinessHistory', () => {
  function series(days: number, tssPerDay: number, opts?: { unknownSeconds?: number }): DailyTss[] {
    const out: DailyTss[] = [];
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < days; i++) {
      out.push({
        date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
        tss: tssPerDay,
        known_seconds: tssPerDay > 0 ? 3600 : 0,
        unknown_seconds: opts?.unknownSeconds ?? 0,
        unknown_sessions: (opts?.unknownSeconds ?? 0) > 0 ? 1 : 0,
      });
    }
    return out;
  }

  function samplesFrom(s: DailyTss[], count: number) {
    return s.slice(-count).map((p) => ({ iso_date: p.date, at: new Date(`${p.date}T12:00:00Z`) }));
  }

  /** HRV con línea base: reciente (7 d) y referencia (60→14 d) pobladas. */
  function hrvAround(dates: string[], recent: number, baseline: number) {
    const last = new Date(`${dates[dates.length - 1]}T12:00:00Z`).getTime();
    const D = 86_400_000;
    return [
      { at: new Date(last - 50 * D), value: baseline },
      { at: new Date(last - 30 * D), value: baseline },
      { at: new Date(last - 20 * D), value: baseline },
      { at: new Date(last - 2 * D), value: recent },
      { at: new Date(last), value: recent },
    ];
  }

  test('un día sin nada que leer sale como hueco, no como cero', () => {
    const s = series(120, 0);
    const points = buildRaceReadinessHistory({
      series: s,
      assignments: [],
      hrv: [],
      samples: samplesFrom(s, 5),
    });
    expect(points).toHaveLength(5);
    expect(points.every((p) => p.reading === null)).toBe(true);
    expect(points.every((p) => p.gap?.reason === 'no_signal')).toBe(true);
  });

  test('más carga aguda que crónica puntúa MENOS frescura, no más', () => {
    // Lo contrario de lo que hacía el campo mal nombrado: al meterle el TSS del
    // día en la escala del TSB, cualquier día de ≥10 TSS clavaba la frescura en
    // su máximo — cuanto más entrenaba el atleta, más «fresco» decía la barra.
    const steady = series(120, 50);
    const spiking = [...series(113, 50), ...series(7, 200).map((p, i) => ({
      ...p,
      date: steady[113 + i]!.date,
    }))];
    const at = (s: DailyTss[]) => {
      const last = s[s.length - 1]!.date;
      return buildRaceReadinessHistory({
        series: s,
        assignments: [{ date: last, scheduled: 4, completed: 3 }],
        hrv: hrvAround(s.map((p) => p.date), 45, 45),
        samples: samplesFrom(s, 1),
      })[0]!;
    };
    const calm = at(steady).reading!;
    const hammered = at(spiking).reading!;
    expect(hammered.bands.freshness).toBeLessThan(calm.bands.freshness);
  });

  test('con la carga a medias el día no puntúa y dice qué falta', () => {
    const s = series(120, 50, { unknownSeconds: 3600 });
    const points = buildRaceReadinessHistory({
      series: s,
      assignments: [],
      hrv: [],
      samples: samplesFrom(s, 3),
    });
    expect(points.every((p) => p.reading === null)).toBe(true);
    expect(points[0]!.gap?.reason).toBe('partial_coverage');
  });

  test('la adherencia sale de sus 7 días, y sin nada programado NO hay índice', () => {
    const s = series(120, 50);
    const last = s[s.length - 1]!.date;
    const hrv = hrvAround(s.map((p) => p.date), 45, 45);
    const one = (assignments: Parameters<typeof buildRaceReadinessHistory>[0]['assignments']) =>
      buildRaceReadinessHistory({
        series: s,
        assignments,
        hrv,
        samples: [{ iso_date: last, at: new Date(`${last}T12:00:00Z`) }],
      })[0]!;

    const withWork = one([{ date: last, scheduled: 4, completed: 4 }]);
    expect(withWork.reading!.bands.compliance).toBe(RACE_READINESS_BAND_MAX.compliance);

    // Nada programado ⇒ adherencia desconocida ⇒ SIN índice, con el hueco dicho.
    const withNothing = one([]);
    expect(withNothing.reading).toBeNull();
    expect(withNothing.gap!.missing).toContain('compliance');
  });

  test('sin variabilidad no hay índice, por bien instrumentado que esté lo demás', () => {
    const s = series(120, 50);
    const last = s[s.length - 1]!.date;
    const p = buildRaceReadinessHistory({
      series: s,
      assignments: [{ date: last, scheduled: 5, completed: 5 }],
      hrv: [],
      samples: [{ iso_date: last, at: new Date(`${last}T12:00:00Z`) }],
    })[0]!;
    expect(p.reading).toBeNull();
    expect(p.gap!.missing).toEqual(['hrv']);
  });

  test('un día fuera de la serie se salta: no se inventa un punto', () => {
    const s = series(120, 50);
    const points = buildRaceReadinessHistory({
      series: s,
      assignments: [],
      hrv: [],
      samples: [{ iso_date: '2019-01-01', at: new Date('2019-01-01T12:00:00Z') }],
    });
    expect(points).toEqual([]);
  });
});

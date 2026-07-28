import { describe, expect, test } from 'vitest';
import {
  ATL_DECAY_DAYS,
  CTL_DECAY_DAYS,
  executedSeconds28d,
  summarizeLoad,
  type DailyTss,
} from '@fahybrid/shared/domain/training-load/banister';
import {
  LOAD_COVERAGE_MIN,
  formatBulkDuration,
  readLoadCoverage,
} from '@fahybrid/shared/domain/training-load/coverage';

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 28 days of work; `holes` maps a day index to [unknown_seconds, unknown_sessions]. */
function window28(
  knownSecondsPerDay: number,
  tssPerDay: number,
  holes: Record<number, [number, number]> = {},
): DailyTss[] {
  return Array.from({ length: 28 }, (_, i) => ({
    date: addDays('2026-01-01', i),
    tss: tssPerDay,
    known_seconds: knownSecondsPerDay,
    unknown_seconds: holes[i]?.[0] ?? 0,
    unknown_sessions: holes[i]?.[1] ?? 0,
  }));
}

describe('readLoadCoverage · estados', () => {
  test('sin trabajo ejecutado no hay cobertura que declarar (no es 0 %)', () => {
    const c = readLoadCoverage(summarizeLoad(window28(0, 0)));
    expect(c.state).toBe('no_work');
    expect(c.pct).toBeNull();
    expect(c.badge_es).toBeNull();
    expect(c.note_es).toBeNull();
    // Zero executed work is a measurement, not a hole: the reading keeps its verdict.
    expect(c.allows_verdict).toBe(true);
  });

  test('todo valorado: nada que declarar, sin ruido en pantalla', () => {
    const c = readLoadCoverage(summarizeLoad(window28(3600, 60)));
    expect(c.state).toBe('complete');
    expect(c.pct).toBe(1);
    expect(c.badge_es).toBeNull();
    expect(c.note_es).toBeNull();
    expect(c.action_es).toBeNull();
    expect(c.allows_verdict).toBe(true);
  });

  test('cualquier hueco se declara, aunque sea pequeño', () => {
    // 28 h valoradas + 6 min sin valorar ⇒ 99,6 %: por encima del umbral, pero
    // el hueco existe y el coach tiene que poder verlo.
    const c = readLoadCoverage(summarizeLoad(window28(3600, 60, { 3: [360, 1] })));
    expect(c.state).toBe('partial');
    expect(c.allows_verdict).toBe(true);
    expect(c.badge_es).toBe('99 % valorado');
    expect(c.note_es).toContain('1 sesión sin valorar');
    expect(c.note_es).toContain('6 min');
    expect(c.note_es).toContain('la carga real es igual o mayor');
    expect(c.action_es).toBe('Pídele el RPE de esa sesión.');
  });

  test('por debajo del umbral el veredicto se retira, el número se queda', () => {
    // 14 h valoradas / 28 h ejecutadas ⇒ 50 %.
    const daily = window28(1800, 30, Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => [i, [1800, 1] as [number, number]]),
    ));
    const c = readLoadCoverage(summarizeLoad(daily));
    expect(c.state).toBe('partial');
    expect(c.pct).toBeCloseTo(0.5, 5);
    expect(c.allows_verdict).toBe(false);
    expect(c.unknown_sessions).toBe(28);
    expect(c.note_es).toContain('28 sesiones sin valorar');
    expect(c.note_es).toContain('no se puede decir si está fresco o cargado');
    expect(c.action_es).toBe('Pídele el RPE de esas sesiones.');
  });

  test('el porcentaje redondea HACIA ABAJO: un 89,9 % no puede lucir como el 90 % que abre el veredicto', () => {
    // 89,9 % exacto: 3596 s conocidos por cada 4000 s ejecutados.
    const daily = window28(3596, 60, Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => [i, [404, 1] as [number, number]]),
    ));
    const c = readLoadCoverage(summarizeLoad(daily));
    expect(c.pct).toBeCloseTo(0.899, 3);
    expect(c.allows_verdict).toBe(false);
    expect(c.badge_es).toBe('89 % valorado');
  });

  test('el umbral es exactamente LOAD_COVERAGE_MIN, inclusivo', () => {
    const known = Math.round(LOAD_COVERAGE_MIN * 10_000);
    const daily = window28(known, 60, Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => [i, [10_000 - known, 1] as [number, number]]),
    ));
    const c = readLoadCoverage(summarizeLoad(daily));
    expect(c.pct).toBeCloseTo(LOAD_COVERAGE_MIN, 5);
    expect(c.allows_verdict).toBe(true);
  });
});

// The reason the verdict has to go, stated as an executable fact rather than a
// comment: a hole does not bias TSB in one direction, so no screen can correct
// for it. CTL and ATL, by contrast, are floors and stay usable as such.
describe('por qué TSB/ACR pierden el veredicto y CTL/ATL no', () => {
  const SESSION_TSS = 100;

  function tsbWith(missingDayIndexFromEnd: number | null): number {
    const daily: DailyTss[] = Array.from({ length: 90 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      tss: 50,
      known_seconds: 3600,
      unknown_seconds: 0,
      unknown_sessions: 0,
    }));
    if (missingDayIndexFromEnd != null) {
      const idx = daily.length - 1 - missingDayIndexFromEnd;
      daily[idx] = { ...daily[idx]!, tss: 50 + SESSION_TSS };
    }
    return summarizeLoad(daily).tsb;
  }

  test('CTL y ATL sólo pueden subir si aparece el trabajo que falta: son un suelo', () => {
    const shown = summarizeLoad(
      Array.from({ length: 90 }, (_, i) => ({
        date: addDays('2026-01-01', i),
        tss: 50,
        known_seconds: 3600,
        unknown_seconds: i >= 85 ? 3600 : 0,
        unknown_sessions: i >= 85 ? 1 : 0,
      })),
    );
    const truth = summarizeLoad(
      Array.from({ length: 90 }, (_, i) => ({
        date: addDays('2026-01-01', i),
        tss: i >= 85 ? 50 + SESSION_TSS : 50,
        known_seconds: 3600,
        unknown_seconds: 0,
        unknown_sessions: 0,
      })),
    );
    expect(truth.ctl).toBeGreaterThan(shown.ctl);
    expect(truth.atl).toBeGreaterThan(shown.atl);
    expect(truth.last_28d_tss).toBeGreaterThan(shown.last_28d_tss);
  });

  test('una sesión reciente que falta hace leer MÁS FRESCO de lo que está', () => {
    // The truth (session present) is more fatigued than what the screen shows.
    expect(tsbWith(1)).toBeLessThan(tsbWith(null));
  });

  test('una sesión vieja que falta hace leer MÁS CARGADO de lo que está', () => {
    // Beyond the ~14-day crossover the ATL contribution has decayed away while
    // CTL's has not, so the same missing session flips the sign of the error.
    expect(tsbWith(27)).toBeGreaterThan(tsbWith(null));
    // Which is exactly why no consumer may "correct" for a hole: the two cases
    // are indistinguishable from the aggregate alone.
    expect(CTL_DECAY_DAYS).toBeGreaterThan(ATL_DECAY_DAYS);
  });
});

describe('executedSeconds28d', () => {
  test('el volumen ejecutado incluye lo no valorado: la duración sí se midió', () => {
    const s = summarizeLoad(window28(3600, 60, { 0: [1800, 1] }));
    expect(executedSeconds28d(s)).toBe(28 * 3600 + 1800);
  });
});

describe('formatBulkDuration', () => {
  test('lee como lo lee un coach, no como una prescripción', () => {
    expect(formatBulkDuration(0)).toBe('menos de 1 min');
    expect(formatBulkDuration(59)).toBe('menos de 1 min');
    expect(formatBulkDuration(660)).toBe('11 min');
    expect(formatBulkDuration(3600)).toBe('1 h');
    expect(formatBulkDuration(4800)).toBe('1 h 20 min');
    expect(formatBulkDuration(36_000)).toBe('10 h');
  });
});

import { describe, expect, it } from 'vitest';
import {
  levelSuggestionGap,
  resolveLadder,
  suggestLevelOnLadder,
  parseClock,
  formatClock,
  type LadderLevel,
} from '@fahybrid/shared/domain/coach/level-criteria';
import { marksFromBenchmarks, suggestLevelForAthlete, type AthleteProfile, type Benchmark } from '../level-algorithm';

// La sugerencia de nivel se calcula sobre la escalera DEL COACH: sus niveles
// activos en su orden, con sus cortes o —sin tocar— los del producto por
// posición. Ya no se busca un nivel llamado 'N'+n.

function ladderOf(names: string[], custom: Partial<Record<number, LadderLevel['criteria'] | null>> = {}): LadderLevel[] {
  return names.map((name, i) => ({
    id: String(100 + i),
    name,
    criteria_set_at: custom[i + 1] !== undefined ? '2026-09-23' : null,
    criteria: custom[i + 1] ?? [],
  }));
}

const profile = (o: Partial<AthleteProfile> = {}): AthleteProfile => ({
  sex: null,
  weight_kg: null,
  training_experience_years: null,
  ...o,
});
const bm = (exercise_slug: string, value: number, unit = 's'): Benchmark => ({ exercise_slug, value, unit });

const FIVE = resolveLadder(ladderOf(['N1', 'N2', 'N3', 'N4', 'N5']));

describe('sugerencia sobre la escalera del coach', () => {
  it('con los defectos, un coach de cinco niveles recibe lo de siempre (HYROX 85′ hombre → 2.º)', () => {
    const s = suggestLevelForAthlete({ ladder: FIVE, benchmarks: [bm('hyrox_open', 5100)], profile: profile({ sex: 'male' }) });
    expect(s).toMatchObject({ status: 'suggested', position: 2, level_name: 'N2', confidence: 'low' });
  });

  it('usa el sexo: HYROX 70′ mujer → 4.º', () => {
    const s = suggestLevelForAthlete({ ladder: FIVE, benchmarks: [bm('hyrox_open', 4200)], profile: profile({ sex: 'female' }) });
    expect(s).toMatchObject({ status: 'suggested', position: 4 });
  });

  it('tres marcas del mismo escalón → confianza alta', () => {
    const s = suggestLevelForAthlete({
      ladder: FIVE,
      benchmarks: [bm('hyrox_open', 4050), bm('run_5k', 1350), bm('row_2k', 422)],
      profile: profile({ sex: 'male' }),
    });
    expect(s).toMatchObject({ status: 'suggested', position: 3, confidence: 'high', signals: ['hyrox_s', 'run_5k_s', 'row_2k_s'] });
  });

  it('los nombres no importan: la escalera de otro coach («Base», «Medio», «Alto») también recibe sugerencia', () => {
    const ladder = resolveLadder(ladderOf(['Base', 'Medio', 'Alto']));
    const s = suggestLevelForAthlete({ ladder, benchmarks: [bm('run_5k', 1000)], profile: profile({ sex: 'male' }) });
    // 5K 16:40 abre el 5.º escalón por defecto; con tres niveles se queda en el más alto.
    expect(s).toMatchObject({ status: 'suggested', level_name: 'Alto', position: 3 });
  });

  it('los cortes del coach mandan sobre el defecto', () => {
    const ladder = resolveLadder(
      ladderOf(['A', 'B'], { 2: [{ metric: 'run_5k_s', sex: null, threshold: 1500 }] }),
    );
    expect(suggestLevelForAthlete({ ladder, benchmarks: [bm('run_5k', 1490)], profile: profile() })).toMatchObject({ level_name: 'B' });
    expect(suggestLevelForAthlete({ ladder, benchmarks: [bm('run_5k', 1510)], profile: profile() })).toMatchObject({ level_name: 'A' });
  });

  it('los años solo cuentan sin marcas de rendimiento', () => {
    const s = suggestLevelForAthlete({ ladder: FIVE, benchmarks: [], profile: profile({ training_experience_years: 4 }) });
    expect(s).toMatchObject({ status: 'suggested', position: 3, signals: ['experience_years'] });
  });

  it('la sentadilla se hace relativa al peso', () => {
    expect(marksFromBenchmarks([bm('back_squat_1rm', 120, 'kg')], profile({ weight_kg: 80 })).squat_bw).toBeCloseTo(1.5);
    expect(marksFromBenchmarks([bm('back_squat_1rm', 120, 'kg')], profile()).squat_bw).toBeUndefined();
  });

  it('un resultado real de HYROX decide solo y con confianza alta', () => {
    const s = suggestLevelForAthlete({
      ladder: FIVE,
      benchmarks: [bm('run_5k', 1700)],
      profile: profile({ sex: 'male' }),
      realHyroxSeconds: 3200,
    });
    expect(s).toMatchObject({ status: 'suggested', position: 5, confidence: 'high', signals: ['hyrox_s'] });
  });
});

describe('cuando no se puede sugerir, se dice por qué', () => {
  it('sin niveles', () => {
    const s = suggestLevelOnLadder([], { run_5k_s: 1200 }, 'male');
    expect(s.status).toBe('no_levels');
    expect(levelSuggestionGap(s, 'Nivel')).toMatch(/no has creado/);
  });

  it('un eje que no se abre por marcas (el coach vació los cortes de todos)', () => {
    const ladder = resolveLadder(ladderOf(['Mañana', 'Tarde'], { 1: [], 2: [] }));
    const s = suggestLevelOnLadder(ladder, { run_5k_s: 1200 }, 'male');
    expect(s.status).toBe('no_criteria');
    expect(levelSuggestionGap(s, 'Turno')).toBe('Sin sugerencia: ningún turno tuyo se abre por marcas.');
  });

  it('un atleta sin marcas que los cortes lean', () => {
    expect(suggestLevelOnLadder(FIVE, {}, null).status).toBe('no_signals');
  });

  it('un solo nivel sin defecto (posición 1) tampoco tiene cortes', () => {
    expect(suggestLevelOnLadder(resolveLadder(ladderOf(['Único'])), { run_5k_s: 1200 }, 'male').status).toBe('no_criteria');
  });
});

describe('relojes del editor', () => {
  it('lee y escribe h:mm:ss y mm:ss', () => {
    expect(parseClock('1:15:00')).toBe(4500);
    expect(parseClock('21:00')).toBe(1260);
    expect(parseClock("7'20")).toBe(440);
    expect(parseClock('7:75')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(formatClock(4500)).toBe('1:15:00');
    expect(formatClock(440)).toBe('7:20');
  });
});

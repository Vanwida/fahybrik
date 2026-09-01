// El parser de FIT verificado contra bytes REALES, no contra un mock del SDK
// — los fixtures salen del propio ENCODER de Garmin
// (tests/fixtures/fit/generate.ts), así que si el parser leyese mal un campo
// el propio SDK ya habría fallado en escribirlo primero.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parseFitFile } from '@/lib/import/fit/parse';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/fit');

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

// ── (a) Carrera continua, 3 laps automáticos por km ─────────────────────────

describe('parseFitFile · carrera continua con laps automáticos', () => {
  const bytes = fixture('continuous-run.fit');
  const parsed = parseFitFile(bytes);

  test('una sola actividad, modalidad run', () => {
    expect(parsed.warnings).toEqual([]);
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0]?.modality).toBe('run');
    expect(parsed.activities[0]?.source).toBe('fit_import');
  });

  test('la ventana y los totales de la session', () => {
    const [activity] = parsed.activities;
    expect(activity?.started_at.toISOString()).toBe('2026-06-01T06:00:00.000Z');
    expect(activity?.ended_at.toISOString()).toBe('2026-06-01T06:15:00.000Z');
    expect(activity?.duration_s).toBe(900);
    expect(activity?.distance_m).toBe(3000);
    expect(activity?.avg_hr).toBe(155);
    expect(activity?.max_hr).toBe(165);
    expect(activity?.calories_kcal).toBe(250);
    expect(activity?.elevation_gain_m).toBe(20);
    expect(activity?.elevation_loss_m).toBe(15);
  });

  test('3 laps reales (no el lap-espejo) con ritmo y cadencia doblada a spm', () => {
    const laps = parsed.activities[0]!.laps;
    expect(laps).toHaveLength(3);
    expect(laps.every((l) => l.role === 'work')).toBe(true);
    // 5:00/km en las tres.
    for (const lap of laps) {
      expect(lap.distance_m).toBe(1000);
      expect(lap.avg_pace_s_per_km).not.toBeNull();
      expect(lap.avg_pace_s_per_km!).toBeCloseTo(300, 0);
    }
    // Cadencia de UNA pierna doblada: round((cad+frac)*2).
    expect(laps[0]?.run_cadence_spm).toBe(171); // round((85+0.4)*2) = round(170.8)
    expect(laps[1]?.run_cadence_spm).toBe(172); // round((86+0.1)*2) = round(172.2)
    expect(laps[2]?.run_cadence_spm).toBe(175); // round((87+0.6)*2) = round(175.2)
  });

  test('laps consecutivos sin solapes ni huecos', () => {
    const laps = parsed.activities[0]!.laps;
    expect(laps[0]!.started_at.toISOString()).toBe('2026-06-01T06:00:00.000Z');
    expect(laps[0]!.ended_at.toISOString()).toBe(laps[1]!.started_at.toISOString());
    expect(laps[1]!.ended_at.toISOString()).toBe(laps[2]!.started_at.toISOString());
    expect(laps[2]!.ended_at.toISOString()).toBe('2026-06-01T06:15:00.000Z');
  });

  test('muestras de HR y ruta GPS, en orden cronológico', () => {
    const activity = parsed.activities[0]!;
    expect(activity.hr_samples).toHaveLength(7);
    expect(activity.hr_samples.map((s) => s.bpm)).toEqual([140, 145, 150, 155, 160, 165, 170]);
    const times = activity.hr_samples.map((s) => s.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));

    expect(activity.route).toHaveLength(7);
    expect(activity.route[0]!.lat).toBeCloseTo(41.4, 4);
    expect(activity.route[0]!.lon).toBeCloseTo(2.15, 4);
    expect(activity.route[6]!.lat).toBeCloseTo(41.4 + 6 * 0.0005, 4);
    expect(activity.route[6]!.lon).toBeCloseTo(2.15 + 6 * 0.0007, 4);
    const routeTimes = activity.route.map((p) => p.at.getTime());
    expect(routeTimes).toEqual([...routeTimes].sort((a, b) => a - b));
  });

  test('source_ref usa el serial y es ESTABLE (mismo fichero dos veces → mismo ref)', () => {
    const ref1 = parseFitFile(bytes).activities[0]!.source_ref;
    const ref2 = parseFitFile(bytes).activities[0]!.source_ref;
    expect(ref1).toBe(ref2);
    expect(ref1).toBe('fit:987654321:1780293600'); // 2026-06-01T06:00:00Z en epoch Unix
  });
});

// ── (b) Series: calentamiento + 4×(activo/rest) + vuelta a la calma ─────────

describe('parseFitFile · series con laps work/rest', () => {
  const parsed = parseFitFile(fixture('series-laps.fit'));

  test('10 laps con el role correcto (activo=work, resto=recovery)', () => {
    expect(parsed.activities).toHaveLength(1);
    const roles = parsed.activities[0]!.laps.map((l) => l.role);
    expect(roles).toEqual([
      'recovery', // warmup
      'work',
      'recovery',
      'work',
      'recovery',
      'work',
      'recovery',
      'work',
      'recovery',
      'recovery', // cooldown
    ]);
    expect(roles.filter((r) => r === 'work')).toHaveLength(4);
  });

  test('sin sensor de cadencia → null honesto (no inventa un valor)', () => {
    for (const lap of parsed.activities[0]!.laps) {
      expect(lap.run_cadence_spm).toBeNull();
    }
  });

  test('pista indoor → route vacío aunque la modalidad sea run', () => {
    expect(parsed.activities[0]!.route).toEqual([]);
  });
});

// ── (c) Paseo — modalidad 'other', lap-espejo descartado, sha1 fallback ─────

describe('parseFitFile · paseo (walking)', () => {
  const parsed = parseFitFile(fixture('walking-mirror-lap.fit'));

  test("walking NUNCA sale como 'run' (lección de la migración 0192)", () => {
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0]?.modality).toBe('other');
  });

  test('el lap único que cubre toda la session es el lap-espejo: se descarta', () => {
    expect(parsed.activities[0]!.laps).toEqual([]);
  });

  test('hr_samples y route se rellenan igual, aunque no haya laps reales', () => {
    const activity = parsed.activities[0]!;
    expect(activity.hr_samples).toHaveLength(5);
    expect(activity.route).toHaveLength(5);
  });

  test('sin serial en el file_id → source_ref cae al sha1 de los bytes', () => {
    const ref = parsed.activities[0]!.source_ref;
    expect(ref).toMatch(/^fit:[0-9a-f]{40}:\d+$/);
  });
});

// ── (d) Multideporte: dos sessions en el mismo fichero ──────────────────────

describe('parseFitFile · multideporte (correr + bici)', () => {
  const parsed = parseFitFile(fixture('multisport-run-bike.fit'));

  test('dos actividades, una por session, en orden y con su propia modalidad', () => {
    expect(parsed.activities).toHaveLength(2);
    expect(parsed.activities[0]?.modality).toBe('run');
    expect(parsed.activities[1]?.modality).toBe('bike');
  });

  test('cada actividad se queda SOLO con sus propios records (sin fuga entre sessions)', () => {
    const [run, bike] = parsed.activities;
    expect(run!.hr_samples.map((s) => s.bpm)).toEqual([140, 150, 160]);
    expect(bike!.hr_samples.map((s) => s.bpm)).toEqual([130, 135, 140]);
    expect(run!.route).toHaveLength(3);
    expect(bike!.route).toHaveLength(3);
    // Las ventanas no se solapan.
    expect(run!.ended_at.getTime()).toBeLessThanOrEqual(bike!.started_at.getTime());
  });

  test('la bici trae sus 2 laps reales; la carrera descarta su lap-espejo', () => {
    expect(parsed.activities[0]!.laps).toEqual([]); // run: 1 lap = la session entera
    expect(parsed.activities[1]!.laps).toHaveLength(2); // bike: 2 laps reales
  });

  test('cada session produce un source_ref distinto (epochs de inicio distintos)', () => {
    expect(parsed.activities[0]!.source_ref).not.toBe(parsed.activities[1]!.source_ref);
  });
});

// ── (e) Ficheros que no producen actividad — JAMÁS throw ────────────────────

describe('parseFitFile · degradación honesta ante bytes corruptos', () => {
  test('bytes que no son FIT en absoluto → activities vacío + aviso, sin throw', () => {
    const garbage = new TextEncoder().encode('esto no es un fichero FIT, es texto plano de relleno');
    expect(() => parseFitFile(garbage)).not.toThrow();
    const parsed = parseFitFile(garbage);
    expect(parsed.activities).toEqual([]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  test('un FIT truncado a media transmisión → activities vacío + aviso, sin throw', () => {
    const truncated = fixture('truncated.fit');
    expect(() => parseFitFile(truncated)).not.toThrow();
    const parsed = parseFitFile(truncated);
    expect(parsed.activities).toEqual([]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  test('un array vacío tampoco tira el parser', () => {
    expect(() => parseFitFile(new Uint8Array())).not.toThrow();
    expect(parseFitFile(new Uint8Array())).toEqual({ activities: [], warnings: expect.any(Array) });
  });
});

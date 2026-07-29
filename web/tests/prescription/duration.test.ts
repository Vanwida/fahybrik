// The domain rule: WHAT is estimable and what is not.
//
// A prescription's duration is either WRITTEN by the coach or it IS the athlete's
// result. This suite pins that line. Every fixture marked «producción» is a
// verbatim `prescription_json` row from the Neon `fahybrik` main branch — the
// sessions that produced the bug are the sessions that guard the fix.
//
// The bug being guarded: the previous estimator read `params_json` with two
// invented constants (4 s per rep, 60 s of assumed rest), which meant it could
// only see the shared warm-up and cool-down. Templates 437, 439 and 442 all
// announced 26 min — the exact length of the mobility framing they have in
// common — and the HYROX simulation (441) announced 32 min for a session
// measured at 73.

import { describe, expect, test } from 'vitest';
import {
  parsePrescription,
  prescriptionDuration,
  sessionDuration,
  durationUnknownEs,
  type SessionDurationItem,
} from '@fahybrid/shared/domain/prescription';

const p = (raw: unknown) => parsePrescription(raw);

/** A session's items, with the shared warm-up + cool-down every real template
 *  in production carries. Verbatim from templates 437/439/441/442. */
const CALENTAMIENTO: SessionDurationItem[] = [
  {
    role: 'calentamiento',
    prescription: p({ scheme: 'steady', target: { kind: 'rpe', value: 3 }, total_s: 300, modality: 'bike' }),
  },
  {
    role: 'calentamiento',
    prescription: p({
      sets: [{ measure: { kind: 'reps', value: 10 } }, { measure: { kind: 'reps', value: 10 } }],
      scheme: 'sets',
      modality: 'mobility',
    }),
  },
];

const VUELTA: SessionDurationItem[] = [
  {
    role: 'vuelta',
    prescription: p({ scheme: 'steady', target: { kind: 'rpe', value: 2 }, total_s: 300, modality: 'bike' }),
  },
  { role: 'vuelta', prescription: p({ scheme: 'steady', total_s: 300, modality: 'mobility' }) },
  { role: 'vuelta', prescription: p({ scheme: 'steady', total_s: 180, modality: 'mobility' }) },
];

describe('what the plan WRITES DOWN', () => {
  test('a declared window IS the duration — it is stated, not estimated', () => {
    expect(prescriptionDuration(p({ scheme: 'steady', total_s: 300, modality: 'bike' }))).toEqual({
      known: true,
      seconds: 300,
    });
    expect(prescriptionDuration(p({ scheme: 'amrap', total_s: 720, modality: 'functional' }))).toEqual({
      known: true,
      seconds: 720,
    });
  });

  test('an EMOM is rounds × the cycle, and the cycle carries its changeover', () => {
    expect(
      prescriptionDuration(p({ scheme: 'emom', rounds: 10, work_s: 45, rest_s: 15, modality: 'functional' })),
    ).toEqual({ known: true, seconds: 600 });
  });

  test('a plain EMOM without a stated change is just its work window', () => {
    expect(
      prescriptionDuration(p({ scheme: 'emom', rounds: 10, work_s: 60, modality: 'functional' })),
    ).toEqual({ known: true, seconds: 600 });
  });

  test('intervals rest BETWEEN efforts — rounds−1 gaps, not rounds', () => {
    // producción, t463: 5×500 m a 5:00/km con 90 s de recuperación.
    const d = prescriptionDuration(
      p({
        sets: [
          {
            rest_s: 90,
            target: { kind: 'pace', unit: 'per_km', value_s: 300 },
            measure: { kind: 'distance', meters: 500 },
          },
        ],
        rest_s: 90,
        rounds: 5,
        scheme: 'intervals',
        target: { kind: 'pace', unit: 'per_km', value_s: 300 },
        modality: 'run',
      }),
    );
    // 5 × 150 s de trabajo + 4 × 90 s de recuperación.
    expect(d).toEqual({ known: true, seconds: 5 * 150 + 4 * 90 });
  });

  test('a distance against a PRESCRIBED pace is arithmetic, not a guess', () => {
    // producción, t461: 500 m de ski a 2:05/500m.
    expect(
      prescriptionDuration(
        p({
          sets: [
            {
              target: { kind: 'pace', unit: 'per_500m', value_s: 125 },
              measure: { kind: 'distance', meters: 500 },
            },
          ],
          scheme: 'steady',
          target: { kind: 'pace', unit: 'per_500m', value_s: 125 },
          modality: 'ski',
        }),
      ),
    ).toEqual({ known: true, seconds: 125 });
  });

  test('a pace RANGE uses its slowest bound — a floor never overstates the speed', () => {
    const d = prescriptionDuration(
      p({
        sets: [
          {
            target: { kind: 'pace', unit: 'per_km', min_s: 240, max_s: 300 },
            measure: { kind: 'distance', meters: 1000 },
          },
        ],
        scheme: 'steady',
        modality: 'run',
      }),
    );
    expect(d).toEqual({ known: true, seconds: 300 });
  });
});

describe('what is the RESULT, and therefore not estimable', () => {
  test('a for_time block: the duration IS the score', () => {
    // producción, t441: cada estación de la simulación HYROX.
    const d = prescriptionDuration(
      p({
        sets: [{ measure: { kind: 'distance', meters: 1000 } }],
        scheme: 'for_time',
        modality: 'run',
      }),
    );
    expect(d).toEqual({ known: false, reason: 'scored_by_time' });
  });

  test('a for_time CAP is a ceiling, never a duration', () => {
    // `total_s` significa ventana en amrap/steady y TOPE en for_time. Leerlo como
    // ventana convertiría «acaba antes de 20 min» en «dura 20 min».
    expect(
      prescriptionDuration(
        p({
          sets: [{ measure: { kind: 'reps', value: 100 } }],
          scheme: 'for_time',
          total_s: 1200,
          modality: 'functional',
        }),
      ),
    ).toEqual({ known: false, reason: 'scored_by_time' });
  });

  test('death_by ends when the athlete fails', () => {
    expect(
      prescriptionDuration(p({ scheme: 'death_by', work_s: 60, start: 5, increment: 1, modality: 'functional' })),
    ).toEqual({ known: false, reason: 'until_failure' });
  });

  test('reps carry no rate — 4 s per rep was invented', () => {
    // producción, t437: Back Squat 10/8/8/6 al 65-80 % RM.
    const d = prescriptionDuration(
      p({
        sets: [10, 8, 8, 6].map((value) => ({
          target: { max: 80, min: 65, kind: 'percent_rm' },
          measure: { kind: 'reps', value },
        })),
        scheme: 'sets',
        modality: 'strength',
      }),
    );
    expect(d).toEqual({ known: false, reason: 'work_not_timed' });
  });

  test('a distance with no pace is the athlete going as fast as they go', () => {
    expect(
      prescriptionDuration(
        p({
          sets: [{ target: { kind: 'rpe', value: 7 }, measure: { kind: 'distance', meters: 8000 } }],
          scheme: 'steady',
          modality: 'run',
        }),
      ),
    ).toEqual({ known: false, reason: 'work_not_timed' });
  });

  test('unwritten rest keeps the clock open — 0 is as invented as 60', () => {
    // producción, t438: «5 rondas de 5 min en Z4», sin descanso escrito. El
    // trabajo son 25 min; cuánto dura la sesión depende de la recuperación.
    expect(
      prescriptionDuration(
        p({ rounds: 5, scheme: 'rounds', target: { kind: 'hr_zone', value: 4 }, work_s: 300, modality: 'run' }),
      ),
    ).toEqual({ known: false, reason: 'work_not_timed' });
  });

  test('multi-set timed work still needs its rest written', () => {
    const sets = [40, 40, 40].map((seconds) => ({ measure: { kind: 'duration', seconds } }));
    expect(prescriptionDuration(p({ sets, scheme: 'sets', modality: 'run' }))).toEqual({
      known: false,
      reason: 'work_not_timed',
    });
    // …y con el descanso escrito, se cierra.
    expect(
      prescriptionDuration(p({ sets, rest_s: 30, scheme: 'sets', modality: 'run' })),
    ).toEqual({ known: true, seconds: 3 * 40 + 2 * 30 });
  });

  test('a single timed set has no gap to guess', () => {
    expect(
      prescriptionDuration(
        p({ sets: [{ measure: { kind: 'duration', seconds: 90 } }], scheme: 'sets', modality: 'core' }),
      ),
    ).toEqual({ known: true, seconds: 90 });
  });

  test('no dose at all is a content gap, and says so', () => {
    // producción, t442: cuatro ítems de trabajo llegan vacíos.
    expect(prescriptionDuration(p({ scheme: 'sets', modality: 'functional' }))).toEqual({
      known: false,
      reason: 'undosed',
    });
    // producción, t439: una serie con carga pero sin ninguna medida.
    expect(
      prescriptionDuration(
        p({ sets: [{ target: { kind: 'kg', value: 6 } }], scheme: 'sets', modality: 'functional' }),
      ),
    ).toEqual({ known: false, reason: 'undosed' });
  });

  test('a structured run reads its STRUCTURE, never the lossy flatten', () => {
    // producción, t451: el flatten dice «3 × 600 s = 30 min»; la estructura real
    // es 10 min de trote, un 5 km a tope y 10 min de vuelta a la calma.
    const d = prescriptionDuration(
      p({
        rounds: 3,
        scheme: 'intervals',
        target: { kind: 'rpe', value: 3 },
        work_s: 600,
        modality: 'run',
        structure: [
          {
            role: 'warmup',
            elements: [{ kind: 'work', target: { type: 'rpe', value: 3 }, measure: { s: 600, type: 'duration' } }],
          },
          {
            role: 'main',
            elements: [
              { kind: 'work', target: { max: 10, min: 9, type: 'rpe' }, measure: { m: 5000, type: 'distance' } },
            ],
          },
          {
            role: 'cooldown',
            elements: [{ kind: 'work', target: { type: 'rpe', value: 2 }, measure: { s: 600, type: 'duration' } }],
          },
        ],
      }),
    );
    expect(d).toEqual({ known: false, reason: 'work_not_timed' });
  });
});

describe('the session — an open PRINCIPAL block means no number at all', () => {
  test('the HYROX simulation states no duration (was 32 min, measured 73)', () => {
    const estaciones: SessionDurationItem[] = [
      1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
    ].map((meters) => ({
      role: 'principal',
      prescription: p({
        sets: [{ measure: { kind: 'distance', meters } }],
        scheme: 'for_time',
        modality: 'run',
      }),
    }));
    const d = sessionDuration([...CALENTAMIENTO, ...estaciones, ...VUELTA]);
    expect(d.known).toBe(false);
    if (d.known) throw new Error('unreachable');
    expect(d.reason).toBe('scored_by_time');
    // El marco SÍ suma 13 min — y ese es exactamente el número que no se pinta.
    expect(d.timed_minutes).toBeGreaterThan(0);
    expect(durationUnknownEs(d.reason)).toBe('Dura lo que tardes');
  });

  test('the leg-strength session states none either (was 26 min, measured 16 and 63)', () => {
    const d = sessionDuration([
      ...CALENTAMIENTO,
      {
        role: 'principal',
        prescription: p({
          sets: [10, 8, 8, 6].map((value) => ({
            target: { max: 80, min: 65, kind: 'percent_rm' },
            measure: { kind: 'reps', value },
          })),
          scheme: 'sets',
          modality: 'strength',
        }),
      },
      ...VUELTA,
    ]);
    expect(d).toMatchObject({ known: false, reason: 'work_not_timed' });
  });

  test('three DIFFERENT sessions no longer share one fabricated number', () => {
    const principal = (prescription: SessionDurationItem['prescription']): SessionDurationItem => ({
      role: 'principal',
      prescription,
    });
    const fuerza = sessionDuration([
      ...CALENTAMIENTO,
      principal(
        p({
          sets: [{ measure: { kind: 'reps', value: 10 } }],
          scheme: 'sets',
          modality: 'strength',
        }),
      ),
      ...VUELTA,
    ]);
    const metcon = sessionDuration([
      ...CALENTAMIENTO,
      principal(p({ scheme: 'sets', modality: 'functional' })),
      ...VUELTA,
    ]);
    const sim = sessionDuration([
      ...CALENTAMIENTO,
      principal(
        p({ sets: [{ measure: { kind: 'distance', meters: 1000 } }], scheme: 'for_time', modality: 'run' }),
      ),
      ...VUELTA,
    ]);
    // Ninguna da número, y cada una dice una cosa distinta y cierta.
    for (const d of [fuerza, metcon, sim]) expect(d.known).toBe(false);
    expect(new Set([fuerza, metcon, sim].map((d) => (d.known ? '' : d.reason))).size).toBe(3);
  });

  test('an unwritten ACCESSORY only makes the number a floor', () => {
    // producción, t440 «Rodaje Z2»: 40 min de Z2 escritos, calentamiento con
    // movilidad sin reloj. El número existe y se lee «al menos».
    const d = sessionDuration([
      ...CALENTAMIENTO,
      ...[600, 600, 600, 600].map(
        (total_s): SessionDurationItem => ({
          role: 'principal',
          prescription: p({ scheme: 'steady', target: { kind: 'hr_zone', value: 2 }, total_s, modality: 'row' }),
        }),
      ),
      ...VUELTA,
    ]);
    expect(d).toMatchObject({ known: true, basis: 'floor' });
    if (!d.known) throw new Error('unreachable');
    // 5 + 40 + 13 min escritos. La movilidad sin reloj no suma, y no miente.
    expect(d.minutes).toBe(58);
  });

  test('a session whose every item is written is exact, not a floor', () => {
    const d = sessionDuration([
      { role: 'calentamiento', prescription: p({ scheme: 'steady', total_s: 300, modality: 'bike' }) },
      { role: 'principal', prescription: p({ scheme: 'amrap', total_s: 720, modality: 'functional' }) },
    ]);
    expect(d).toEqual({ known: true, minutes: 17, basis: 'exact' });
  });

  test('a session with nothing dosed is not a zero-minute session', () => {
    const d = sessionDuration([{ role: 'principal', prescription: null }]);
    expect(d).toMatchObject({ known: false, reason: 'undosed' });
  });

  test('every reason has athlete-facing words — no surface is left with a hole', () => {
    for (const reason of ['scored_by_time', 'until_failure', 'work_not_timed', 'undosed'] as const) {
      expect(durationUnknownEs(reason).length).toBeGreaterThan(3);
    }
  });
});

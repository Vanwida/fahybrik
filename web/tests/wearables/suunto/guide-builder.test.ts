// Tests del constructor de guide.json, con dos sesiones REALES de carrera: una
// de series y un rodaje continuo. Lo que se vigila aquí son sobre todo las
// unidades: son el sitio donde la spec de Suunto no hace lo que uno esperaría.

import { describe, expect, test } from 'vitest';
import { buildWatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';
import type {
  WatchWorkout,
  WatchStep,
} from '@fahybrid/shared/domain/wearables/watch-workout';
import type { RunStructure } from '@fahybrid/shared/domain/prescription';
import {
  buildSuuntoGuide,
  cadenceToHertz,
  guideExternalId,
  paceToMetersPerSecond,
  toWatchCharset,
} from '@/lib/wearables/suunto/guide-builder';
import { GUIDE_LIMITS, type GuideFieldsStep, type GuideStep } from '@/lib/wearables/suunto/guide-schema';

const OPTS = {
  owner: 'TestOwner',
  url: 'https://example.com/sesion/42',
  externalId: guideExternalId(42),
};

// ── Ayudas de lectura ────────────────────────────────────────────────────────

function fieldsSteps(steps: GuideStep[]): GuideFieldsStep[] {
  return steps.filter((s): s is GuideFieldsStep => s.type === 'fields');
}

function fieldOfType<T extends string>(step: GuideFieldsStep, type: T) {
  return step.fields.find((f) => f.type === type);
}

// ── Conversiones de unidad (los ejemplos son los de la spec oficial) ─────────

describe('unidades', () => {
  test('el ritmo va en metros por segundo, no en min/km', () => {
    // La spec ilustra targetPace con 4.166 m/s, que es un 4:00/km.
    expect(paceToMetersPerSecond(240)).toBeCloseTo(4.166, 2);
    expect(paceToMetersPerSecond(300)).toBeCloseTo(3.333, 2); // 5:00/km
    expect(paceToMetersPerSecond(200)).toBe(5); // 3:20/km
  });

  test('la cadencia va en hercios contando REVOLUCIONES, no pasos', () => {
    // El ejemplo oficial rotula min 1.4 / max 1.6 como "84 - 96 RPM", y 1.5 como
    // "90 RPM". 90 rpm son 180 spm, así que Hz = spm / 120.
    expect(cadenceToHertz(180)).toBe(1.5);
    expect(cadenceToHertz(168)).toBe(1.4);
    expect(cadenceToHertz(192)).toBe(1.6);
  });
});

// ── Caso real 1: series 4×400 m ──────────────────────────────────────────────

const SERIES: RunStructure = [
  {
    role: 'warmup',
    elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: null }],
  },
  {
    role: 'main',
    elements: [
      {
        times: 4,
        elements: [
          {
            kind: 'work',
            measure: { type: 'distance', m: 400 },
            // 3:20 (200 s) a 3:30 (210 s) por km.
            target: { type: 'pace', min_s: 200, max_s: 210 },
            cadence_spm: 180,
          },
          {
            kind: 'recovery',
            measure: { type: 'distance', m: 200 },
            target: null,
            recovery_mode: 'trote',
          },
        ],
      },
    ],
  },
  {
    role: 'cooldown',
    elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: null }],
  },
];

describe('series 4x400 m', () => {
  const workout = buildWatchWorkout(SERIES, {}, { name: 'Series 4x400' });
  const guide = buildSuuntoGuide(workout, OPTS);

  test('la repetición sale como un paso repeat con sus iteraciones', () => {
    const repeat = guide.steps.find((s) => s.type === 'repeat');
    expect(repeat).toBeDefined();
    if (repeat?.type !== 'repeat') throw new Error('sin paso repeat');
    expect(repeat.times).toBe(4);
    expect(repeat.steps).toHaveLength(2); // trabajo + recuperación
  });

  test('la banda de ritmo se INVIERTE al pasar a m/s', () => {
    const repeat = guide.steps.find((s) => s.type === 'repeat');
    if (repeat?.type !== 'repeat') throw new Error('sin paso repeat');
    const work = repeat.steps[0]!;
    const target = fieldOfType(work, 'targetPace');
    expect(target).toBeDefined();
    // 210 s/km (el LENTO) es el mínimo en m/s; 200 s/km (el RÁPIDO), el máximo.
    expect(target).toMatchObject({ min: paceToMetersPerSecond(210), max: paceToMetersPerSecond(200) });
    expect((target as { min: number }).min).toBeLessThan((target as { max: number }).max);
  });

  test('la cadencia viaja como objetivo secundario, no metida en el nombre', () => {
    const repeat = guide.steps.find((s) => s.type === 'repeat');
    if (repeat?.type !== 'repeat') throw new Error('sin paso repeat');
    const cadence = fieldOfType(repeat.steps[0]!, 'targetCadence');
    // 180 ± 3 spm → 177 y 183 spm.
    expect(cadence).toMatchObject({ min: cadenceToHertz(177), max: cadenceToHertz(183) });
  });

  test('un paso medido en distancia avanza con stepDistance en METROS', () => {
    const repeat = guide.steps.find((s) => s.type === 'repeat');
    if (repeat?.type !== 'repeat') throw new Error('sin paso repeat');
    expect(repeat.steps[0]!.transitions).toEqual([
      { condition: { type: 'stepDistance', value: 400 } },
    ]);
  });

  test('un paso medido en tiempo avanza con stepDuration en SEGUNDOS', () => {
    const warmup = fieldsSteps(guide.steps)[0]!;
    expect(warmup.transitions).toEqual([{ condition: { type: 'stepDuration', value: 600 } }]);
  });

  test('cada tramo prescrito marca vuelta, para que el FIT traiga un lap por tramo', () => {
    const measured = fieldsSteps(guide.steps).filter((s) => s.transitions);
    expect(measured.length).toBeGreaterThan(0);
    for (const step of measured) expect(step.createManualLap).toBe(true);
  });

  test('la secuencia cierra con un paso final sin transiciones', () => {
    const last = guide.steps[guide.steps.length - 1]!;
    if (last.type !== 'fields') throw new Error('el último paso no es de campos');
    expect(last.transitions).toBeUndefined();
  });
});

// ── Caso real 2: rodaje continuo ─────────────────────────────────────────────

const RODAJE: RunStructure = [
  {
    role: 'main',
    elements: [
      {
        kind: 'work',
        measure: { type: 'distance', m: 8000 },
        target: { type: 'pace', value_s: 280 }, // 4:40/km puntual
      },
    ],
  },
];

describe('rodaje continuo 8 km', () => {
  const workout = buildWatchWorkout(RODAJE, {}, { name: 'Rodaje 8 km' });
  const guide = buildSuuntoGuide(workout, OPTS);

  test('sin repeticiones: un solo tramo más el cierre', () => {
    expect(guide.steps.every((s) => s.type === 'fields')).toBe(true);
    expect(guide.steps).toHaveLength(2); // rodaje + "Hecho"
  });

  test('un ritmo puntual llega como banda cerrada, nunca como valor exacto', () => {
    const target = fieldOfType(fieldsSteps(guide.steps)[0]!, 'targetPace') as {
      min: number;
      max: number;
      value?: number;
    };
    // El modelo neutro expande ±5 s/km antes de llegar aquí.
    expect(target.min).toBe(paceToMetersPerSecond(285));
    expect(target.max).toBe(paceToMetersPerSecond(275));
    expect(target.value).toBeUndefined();
  });

  test('lleva cuenta atrás de distancia en metros', () => {
    const countdown = fieldOfType(fieldsSteps(guide.steps)[0]!, 'stepDistanceCountdown');
    expect(countdown).toMatchObject({ value: 8000 });
  });
});

// ── Objetivo de pulso y tramo abierto ────────────────────────────────────────

function manualWorkout(step: Partial<WatchStep>): WatchWorkout {
  return {
    name: 'Sesion',
    sport: 'running',
    blocks: [
      {
        iterations: 1,
        steps: [
          {
            kind: 'work',
            measure: { type: 'duration', s: 300 },
            target: null,
            name: 'tramo',
            ...step,
          } as WatchStep,
        ],
      },
    ],
  };
}

describe('otros objetivos', () => {
  test('una banda de pulso va en bpm, tal cual', () => {
    const guide = buildSuuntoGuide(
      manualWorkout({ target: { type: 'hr', min_bpm: 150, max_bpm: 160 } }),
      OPTS,
    );
    expect(fieldOfType(fieldsSteps(guide.steps)[0]!, 'targetHeartRate')).toMatchObject({
      min: 150,
      max: 160,
    });
  });

  test('sin objetivo no se inventa ninguno', () => {
    const guide = buildSuuntoGuide(manualWorkout({ target: null }), OPTS);
    const step = fieldsSteps(guide.steps)[0]!;
    expect(fieldOfType(step, 'targetPace')).toBeUndefined();
    expect(fieldOfType(step, 'targetHeartRate')).toBeUndefined();
  });

  test('un tramo abierto lo cierra el atleta con la vuelta manual', () => {
    const guide = buildSuuntoGuide(manualWorkout({ measure: { type: 'open' } }), OPTS);
    const step = fieldsSteps(guide.steps)[0]!;
    expect(step.transitions).toEqual([{ condition: { type: 'manualLap' } }]);
    expect(fieldOfType(step, 'stepDurationCountdown')).toBeUndefined();
  });
});

// ── Deporte, textos y límites ────────────────────────────────────────────────

describe('cabecera del guide', () => {
  const guide = buildSuuntoGuide(buildWatchWorkout(RODAJE, {}, { name: 'Rodaje' }), OPTS);

  test('Running es el 1 — el 3 del ejemplo del PDF es esquí de fondo', () => {
    expect(guide.activities).toContain(1);
    expect(guide.activities).not.toContain(3);
  });

  test('cubre toda la familia de carrera (calle, trail, cinta y pista)', () => {
    expect(guide.activities).toEqual([1, 22, 53, 59, 103]);
  });

  test('el externalId deriva de la asignación', () => {
    expect(guide.externalId).toBe('fhb-a42');
    // Un id de asignación es bigint en la DB: debe sobrevivir sin pasar por Number.
    expect(guideExternalId(BigInt('9007199254740993'))).toBe('fhb-a9007199254740993');
  });

  test('type y usage son los literales que exige la spec', () => {
    expect(guide.type).toBe('sequence');
    expect(guide.usage).toBe('workout');
  });
});

describe('juego de caracteres del reloj', () => {
  test('caen acentos, eñes y el punto medio del separador', () => {
    expect(toWatchCharset('400 m · 3:30/km · recuperación')).toBe(
      '400 m - 3:30/km - recuperacion',
    );
    expect(toWatchCharset('Serie Ñandú')).toBe('Serie Nandu');
  });

  test('ningún texto que va al reloj lleva caracteres fuera del juego mínimo', () => {
    const workout = buildWatchWorkout(SERIES, {}, { name: 'Séries · potencía' });
    const guide = buildSuuntoGuide(workout, OPTS);
    const texts: string[] = [guide.name, guide.shortDescription];
    for (const step of guide.steps) {
      const inner = step.type === 'repeat' ? step.steps : [step];
      for (const s of inner) {
        if (s.title) texts.push(s.title);
        if (s.notification) texts.push(s.notification.title, s.notification.text);
        for (const f of s.fields) if (f.type === 'text') texts.push(f.value);
      }
    }
    for (const text of texts) expect(text).toBe(toWatchCharset(text));
  });
});

describe('límites publicados', () => {
  const workout = buildWatchWorkout(SERIES, {}, {
    name: 'Sesion de series muy larga para comprobar que el nombre se recorta bien de verdad',
  });
  const guide = buildSuuntoGuide(workout, OPTS);

  test('nombre y descripciones caben', () => {
    expect(guide.name.length).toBeLessThanOrEqual(GUIDE_LIMITS.NAME_MAX);
    expect(guide.shortDescription.length).toBeLessThanOrEqual(GUIDE_LIMITS.SHORT_DESCRIPTION_MAX);
    expect(guide.description.length).toBeLessThanOrEqual(GUIDE_LIMITS.DESCRIPTION_MAX);
  });

  test('rótulos, avisos y textos de paso caben', () => {
    for (const step of guide.steps) {
      const inner = step.type === 'repeat' ? step.steps : [step];
      for (const s of inner) {
        if (s.title) expect(s.title.length).toBeLessThanOrEqual(GUIDE_LIMITS.STEP_TITLE_MAX);
        if (s.notification) {
          expect(s.notification.title.length).toBeLessThanOrEqual(GUIDE_LIMITS.NOTIFICATION_TITLE_MAX);
          expect(s.notification.text.length).toBeLessThanOrEqual(GUIDE_LIMITS.NOTIFICATION_TEXT_MAX);
        }
        for (const f of s.fields) {
          if (f.type === 'text') {
            // Por encima de 40 el reloj deja de poder mostrar el objetivo al lado.
            expect(f.value.length).toBeLessThanOrEqual(GUIDE_LIMITS.TEXT_FIELD_SOLO_ABOVE);
          }
        }
      }
    }
  });

  test('una URL que no lo es se rechaza aquí, no con un 400 opaco de la API', () => {
    expect(() => buildSuuntoGuide(workout, { ...OPTS, url: 'no-es-una-url' })).toThrow();
  });
});

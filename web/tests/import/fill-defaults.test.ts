// Relleno de huecos con los valores por defecto del coach.
//
// Los casos salen de la notación REAL que la foto transcribe ("A) 4 × 4 | RIR 2",
// "Press Banca >78-80%", "10 × 400m", "3 RONDAS"), porque lo que se defiende aquí
// es criterio, no fontanería: qué se propone, qué NO se propone jamás, y que lo
// leído en la foto mande siempre sobre el default.

import { describe, test, expect } from 'vitest';
import {
  fillMissingWithDefaults,
  type FilledField,
} from '@/lib/import/fill-defaults';
import type {
  EditorBlock,
  EditorItem,
  EditorSession,
  StructureGroup,
} from '@/lib/dashboard/v2/editor-types';
import type {
  ImportDefaultsValues,
} from '@fahybrid/shared/domain/coach-import-defaults';
import { DEFAULT_IMPORT_DEFAULTS } from '@fahybrid/shared/domain/coach-import-defaults';
import {
  checkPrescriptionCompleteness,
  isExecutable,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

const DEFAULTS: ImportDefaultsValues = DEFAULT_IMPORT_DEFAULTS;

function item(
  uid: string,
  prescription: Prescription,
  exercise_modality: Modality | null,
  name = 'Ejercicio',
): EditorItem {
  return { uid, exercise_id: 1, exercise_name: name, exercise_modality, prescription };
}

function sessionOf(items: EditorItem[], group?: StructureGroup): EditorSession[] {
  const block: EditorBlock = {
    uid: 'blk-1',
    title: 'Bloque',
    format: null,
    ...(group ? { group } : {}),
    items,
  };
  return [{ uid: 'ses-1', slot: 'am', blocks: [block] }];
}

/** El primer item de la primera sesión del resultado. */
function firstItem(sessions: EditorSession[]): EditorItem {
  return sessions[0]!.blocks[0]!.items[0]!;
}

function paths(filled: FilledField[]): string[] {
  return filled.map((f) => f.path);
}

describe('el descanso entre series', () => {
  test('un item sin descanso lo recibe y aparece en filled', () => {
    // "A) 4 × 4 | RIR 2" — la foto trae series, reps e intensidad, pero no el descanso.
    const p: Prescription = {
      scheme: 'sets',
      sets: Array.from({ length: 4 }, () => ({
        measure: { kind: 'reps', value: 4 } as const,
        target: { kind: 'rir', value: 2 } as const,
      })),
    };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    const sets = firstItem(sessions).prescription.sets!;
    // La última no lleva descanso: no hay "entre" después de ella.
    expect(sets.map((s) => s.rest_s)).toEqual([90, 90, 90, undefined]);
    expect(paths(filled)).toEqual(['sets[0].rest_s', 'sets[1].rest_s', 'sets[2].rest_s']);
    expect(filled.every((f) => f.field === 'rest')).toBe(true);
    expect(filled.every((f) => f.reason === 'not_visible_in_source')).toBe(true);
    expect(filled.every((f) => f.item_uid === 'it-1')).toBe(true);
    // Lo que traía la foto sigue intacto.
    expect(sets[0]!.target).toEqual({ kind: 'rir', value: 2 });
    expect(sets[0]!.measure).toEqual({ kind: 'reps', value: 4 });
  });

  test('un item CON descanso no se toca y no aparece en filled', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [
        { measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 }, rest_s: 150 },
        { measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } },
      ],
    };
    const original = item('it-1', p, 'strength');
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([original]), DEFAULTS);

    expect(firstItem(sessions).prescription.sets![0]!.rest_s).toBe(150);
    // La segunda es la última: no hay "entre" después de ella.
    expect(firstItem(sessions).prescription.sets![1]!.rest_s).toBeUndefined();
    expect(filled).toEqual([]);
    // Sin nada que tapar, el item vuelve tal cual (misma identidad).
    expect(firstItem(sessions)).toBe(original);
  });

  test('el descanso del bloque cuenta: no se duplica por serie', () => {
    const p: Prescription = {
      scheme: 'sets',
      rest_s: 120,
      sets: [
        { measure: { kind: 'reps', value: 8 }, target: { kind: 'rir', value: 2 } },
        { measure: { kind: 'reps', value: 8 }, target: { kind: 'rir', value: 2 } },
      ],
    };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    expect(firstItem(sessions).prescription.sets!.every((s) => s.rest_s === undefined)).toBe(true);
    expect(filled).toEqual([]);
  });

  test('una sola serie no recibe descanso: no hay "entre"', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 10 }, target: { kind: 'bodyweight' } }],
    };
    const { filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    expect(filled).toEqual([]);
  });

  test('cada familia recibe SU descanso: fuerza 90s, cardio 60s, core 30s', () => {
    const twoSets = (m: Modality): Prescription => ({
      scheme: m === 'strength' ? 'sets' : 'intervals',
      sets: [
        m === 'strength'
          ? { measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }
          : { measure: { kind: 'distance', meters: 400 } },
        m === 'strength'
          ? { measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }
          : { measure: { kind: 'distance', meters: 400 } },
      ],
    });
    const items = [
      item('fuerza', twoSets('strength'), 'strength'),
      item('carrera', twoSets('run'), 'run'),
      item('core', twoSets('core'), 'core'),
    ];

    const { sessions } = fillMissingWithDefaults(sessionOf(items), DEFAULTS);
    const rest = (i: number): number | undefined =>
      sessions[0]!.blocks[0]!.items[i]!.prescription.sets![0]!.rest_s;

    expect(rest(0)).toBe(90);
    expect(rest(1)).toBe(60);
    expect(rest(2)).toBe(30);
  });

  test('un WOD no recibe descanso: su dosis es el cap, no un "entre series"', () => {
    const p: Prescription = {
      scheme: 'rounds',
      rounds: 3,
      sets: [
        { measure: { kind: 'reps', value: 10 } },
        { measure: { kind: 'reps', value: 10 } },
      ],
    };
    const { filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'functional')]), DEFAULTS);

    expect(filled).toEqual([]);
  });
});

describe('las repeticiones ausentes', () => {
  test('una serie de fuerza sin medida recibe un RANGO, y así se ve que es relleno', () => {
    // "Press Banca >78-80%" — la foto trae la carga pero no las reps.
    const p: Prescription = {
      scheme: 'sets',
      sets: [
        { target: { kind: 'percent_rm', min: 78, max: 80 } },
        { target: { kind: 'percent_rm', min: 78, max: 80 } },
      ],
    };
    const { sessions, filled } = fillMissingWithDefaults(
      sessionOf([item('it-1', p, 'strength', 'Press Banca')]),
      DEFAULTS,
    );

    const sets = firstItem(sessions).prescription.sets!;
    expect(sets[0]!.measure).toEqual({ kind: 'reps', value: 8, max: 12 });
    expect(filled.filter((f) => f.field === 'reps').map((f) => f.path)).toEqual([
      'sets[0].measure',
      'sets[1].measure',
    ]);
    // El %RM leído en la foto NO se toca ni se sustituye por un RIR.
    expect(sets[0]!.target).toEqual({ kind: 'percent_rm', min: 78, max: 80 });
    expect(filled.some((f) => f.field === 'intensity')).toBe(false);
  });

  test('deja EJECUTABLE lo que antes no lo era', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ target: { kind: 'rir', value: 2 } }, { target: { kind: 'rir', value: 2 } }],
    };
    const antes = checkPrescriptionCompleteness(p, { modality: 'strength' });
    expect(isExecutable(antes)).toBe(false);

    const { sessions } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    const despues = checkPrescriptionCompleteness(firstItem(sessions).prescription, {
      modality: 'strength',
    });
    expect(isExecutable(despues)).toBe(true);
  });

  test('una plancha sin segundos NO se convierte en repeticiones', () => {
    // La unidad es ambigua fuera de la fuerza (una plancha se mide en tiempo, un
    // burpee en reps): rellenar reps aquí inventaría la unidad equivocada.
    const p: Prescription = { scheme: 'sets', sets: [{}, {}, {}] };
    const { sessions, filled } = fillMissingWithDefaults(
      sessionOf([item('it-1', p, 'core', 'Plancha')]),
      DEFAULTS,
    );

    expect(firstItem(sessions).prescription.sets!.every((s) => s.measure === undefined)).toBe(true);
    expect(filled.some((f) => f.field === 'reps')).toBe(false);
  });

  test('una serie de carrera sin distancia NO recibe repeticiones', () => {
    const p: Prescription = { scheme: 'intervals', sets: [{}, {}] };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'run')]), DEFAULTS);

    expect(firstItem(sessions).prescription.sets!.every((s) => s.measure === undefined)).toBe(true);
    expect(filled.some((f) => f.field === 'reps')).toBe(false);
    // Y tampoco descanso: una serie sin trabajo no tiene de qué descansar.
    expect(filled).toEqual([]);
  });

  test('una medida leída no se pisa nunca, ni aunque parezca rara para su modalidad', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'distance', meters: 20 }, target: { kind: 'rir', value: 2 } }],
    };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    expect(firstItem(sessions).prescription.sets![0]!.measure).toEqual({
      kind: 'distance',
      meters: 20,
    });
    expect(filled).toEqual([]);
  });
});

describe('la intensidad', () => {
  test('una serie de fuerza sin objetivo recibe el RIR del coach', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 4 } }, { measure: { kind: 'reps', value: 4 } }],
    };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    const sets = firstItem(sessions).prescription.sets!;
    expect(sets[0]!.target).toEqual({ kind: 'rir', value: 2 });
    expect(filled.filter((f) => f.field === 'intensity').map((f) => f.path)).toEqual([
      'sets[0].target',
      'sets[1].target',
    ]);
  });

  test('JAMÁS se propone ritmo, zona, pulso ni watts a una serie de cardio', () => {
    // "10 × 400m" sin ritmo: se propone el descanso, nunca el objetivo.
    const p: Prescription = {
      scheme: 'intervals',
      sets: Array.from({ length: 10 }, () => ({
        measure: { kind: 'distance', meters: 400 } as const,
      })),
    };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'run')]), DEFAULTS);

    const sets = firstItem(sessions).prescription.sets!;
    expect(sets.every((s) => s.target === undefined)).toBe(true);
    expect(filled.some((f) => f.field === 'intensity')).toBe(false);
    expect(filled.filter((f) => f.field === 'rest')).toHaveLength(9);
  });

  test('JAMÁS se proponen kilos ni %RM: eso depende del 1RM de cada atleta', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 5 } }, { measure: { kind: 'reps', value: 5 } }],
    };
    const { sessions } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    const kinds = firstItem(sessions).prescription.sets!.map((s) => s.target?.kind);
    expect(kinds).toEqual(['rir', 'rir']);
    expect(kinds).not.toContain('kg');
    expect(kinds).not.toContain('percent_rm');
  });

  test('un calentamiento no recibe intensidad, pero sí descanso', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 10 } }, { measure: { kind: 'reps', value: 10 } }],
    };
    const { sessions, filled } = fillMissingWithDefaults(
      sessionOf([item('it-1', p, 'strength')], 'calentamiento'),
      DEFAULTS,
    );

    expect(firstItem(sessions).prescription.sets!.every((s) => s.target === undefined)).toBe(true);
    expect(filled.map((f) => f.field)).toEqual(['rest']);
  });

  test('un objetivo a nivel de bloque se hereda: no se propone RIR por serie', () => {
    const p: Prescription = {
      scheme: 'sets',
      target: { kind: 'percent_rm', value: 75 },
      sets: [{ measure: { kind: 'reps', value: 5 } }, { measure: { kind: 'reps', value: 5 } }],
    };
    const { filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    expect(filled.some((f) => f.field === 'intensity')).toBe(false);
  });

  test('un bodyweight leído no se sustituye por un RIR', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [
        { measure: { kind: 'reps', value: 10 }, target: { kind: 'bodyweight' } },
        { measure: { kind: 'reps', value: 10 }, target: { kind: 'bodyweight' } },
      ],
    };
    const { sessions } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    expect(firstItem(sessions).prescription.sets![0]!.target).toEqual({ kind: 'bodyweight' });
  });
});

describe('lo que se deja en paz', () => {
  test('una línea review sale INTACTA', () => {
    const p: Prescription = { scheme: 'sets', sets: [{}, {}], note: 'texto crudo sin tipar' };
    const original = item('it-review', p, 'strength');

    const { sessions, filled } = fillMissingWithDefaults(sessionOf([original]), DEFAULTS, {
      review_item_uids: ['it-review'],
    });

    expect(firstItem(sessions)).toBe(original);
    expect(firstItem(sessions).prescription.sets).toEqual([{}, {}]);
    expect(filled).toEqual([]);
  });

  test('el cap de un formato capado no se inventa', () => {
    const p: Prescription = { scheme: 'amrap', sets: [{ measure: { kind: 'reps', value: 10 } }] };
    const { sessions, filled } = fillMissingWithDefaults(
      sessionOf([item('it-1', p, 'functional')]),
      DEFAULTS,
    );

    const out = firstItem(sessions).prescription;
    expect(out.total_s).toBeUndefined();
    expect(out.rounds).toBeUndefined();
    expect(filled).toEqual([]);
  });

  test('sin series explícitas (dosis a nivel de bloque) no se toca nada', () => {
    const p: Prescription = { scheme: 'steady', total_s: 2700 };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'bike')]), DEFAULTS);

    expect(firstItem(sessions).prescription).toEqual(p);
    expect(filled).toEqual([]);
  });

  test('sin modalidad conocida no se rellena nada: ante la duda, no se toca', () => {
    const p: Prescription = { scheme: 'sets', sets: [{}, {}] };
    const { filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, null)]), DEFAULTS);

    expect(filled).toEqual([]);
  });
});

describe('el contrato del módulo', () => {
  test('no muta las sesiones de entrada', () => {
    const p: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 5 } }, { measure: { kind: 'reps', value: 5 } }],
    };
    const entrada = sessionOf([item('it-1', p, 'strength')]);
    const copia = JSON.parse(JSON.stringify(entrada)) as EditorSession[];

    const { sessions } = fillMissingWithDefaults(entrada, DEFAULTS);

    expect(entrada).toEqual(copia);
    expect(sessions).not.toBe(entrada);
    expect(firstItem(sessions).prescription.sets![0]!.rest_s).toBe(90);
  });

  test('manda el coach: se usan SUS valores, no los del sistema', () => {
    const suyos: ImportDefaultsValues = {
      rest_strength_s: 180,
      rest_conditioning_s: 45,
      rest_core_mobility_s: 20,
      rir_strength: 1,
      rep_range_min: 3,
      rep_range_max: 5,
    };
    const p: Prescription = { scheme: 'sets', sets: [{}, {}] };
    const { sessions } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), suyos);

    const sets = firstItem(sessions).prescription.sets!;
    expect(sets[0]!.measure).toEqual({ kind: 'reps', value: 3, max: 5 });
    expect(sets[0]!.target).toEqual({ kind: 'rir', value: 1 });
    expect(sets[0]!.rest_s).toBe(180);
  });

  test('un default corrupto no produce una prescripción inválida: se deja el item como estaba', () => {
    const corruptos = { ...DEFAULTS, rep_range_min: -5, rep_range_max: -1 };
    const p: Prescription = { scheme: 'sets', sets: [{}, {}] };
    const original = item('it-1', p, 'strength');

    const { sessions, filled } = fillMissingWithDefaults(sessionOf([original]), corruptos);

    expect(firstItem(sessions)).toBe(original);
    expect(filled).toEqual([]);
  });

  test('la procedencia sale SEPARADA: la prescripción no lleva ninguna marca', () => {
    const p: Prescription = { scheme: 'sets', sets: [{}, {}] };
    const { sessions, filled } = fillMissingWithDefaults(sessionOf([item('it-1', p, 'strength')]), DEFAULTS);

    const json = JSON.stringify(firstItem(sessions).prescription);
    expect(json).not.toContain('not_visible_in_source');
    expect(json).not.toContain('filled');
    expect(json).not.toContain('proposed');
    expect(filled.length).toBeGreaterThan(0);
  });
});

// import-missing — tests PUROS de qué ejercicios le faltan a una importación.
//
// Los casos salen de la medición real de la semana 12 (tests/import/photo-e2e):
// 51 líneas sin resolver, 30 nombres distintos, y entre ellos tres trampas que un
// diseño ingenuo mete en el catálogo del coach para siempre.

import { describe, expect, test } from 'vitest';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ReviewWeek } from '@/lib/dashboard/v2/import-review';
import {
  applyResolvedTokens,
  collectMissingExercises,
  realMissingCount,
} from '@/lib/dashboard/v2/import-missing';
import type { Modality } from '@fahybrid/shared/domain/prescription';

let seq = 0;
const uid = (p: string) => `t-${p}-${++seq}`;

function session(
  blockTitle: string,
  items: Array<{ name: string; exerciseId?: number | null; modality?: Modality }>,
): EditorSession {
  return {
    uid: uid('ses'),
    slot: 'am',
    blocks: [
      {
        uid: uid('blk'),
        title: blockTitle,
        format: 'sets',
        items: items.map((it) => ({
          uid: uid('it'),
          exercise_id: it.exerciseId ?? null,
          exercise_name: it.name,
          prescription: {
            scheme: 'sets' as const,
            ...(it.modality ? { modality: it.modality } : {}),
            sets: [{ measure: { kind: 'reps' as const, value: 10 } }],
          },
        })),
      },
    ],
  };
}

function week(sessions: EditorSession[]): ReviewWeek {
  return {
    week: 12,
    sheet: 'foto',
    fell_back: false,
    target_week_id: '101',
    included: true,
    days: [
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        sessions,
        flags: [],
        proposed: [],
        truncations: [],
        included: true,
      },
    ],
  };
}

describe('la unidad es el TOKEN, no la línea', () => {
  test('el mismo nombre en varias líneas se decide UNA vez', () => {
    const missing = collectMissingExercises([
      week([
        session('Fuerza parte alta', [
          { name: 'Dominada (lastrada)' },
          { name: 'Dominada (lastrada)' },
        ]),
      ]),
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.lineCount).toBe(2);
  });

  test('lo que YA resuelve no entra en la lista', () => {
    const missing = collectMissingExercises([
      week([session('Fuerza', [{ name: 'Back Squat', exerciseId: 10 }, { name: 'Cat Cow' }])]),
    ]);
    expect(missing.map((m) => m.token)).toEqual(['Cat Cow']);
  });

  test('un día excluido no pide sus ejercicios: no se va a escribir', () => {
    const w = week([session('Fuerza', [{ name: 'Cat Cow' }])]);
    w.days[0]!.included = false;
    expect(collectMissingExercises([w])).toEqual([]);
  });
});

describe('las tres trampas de la semana 12', () => {
  test('1. un nombre CORTADO por la fuente no se puede crear tal cual', () => {
    const [m] = collectMissingExercises([
      week([session('Compensatorio glúteo', [{ name: 'Extension de cadera en cuadrúp...' }])]),
    ]);
    expect(m!.truncated).toBe(true);
  });

  test('2. el título de la tarjeta colado como ejercicio entra premarcado como basura', () => {
    const missing = collectMissingExercises([
      week([session('FUERZA PARTE ALTA', [{ name: 'FUERZA PARTE ALTA' }, { name: 'Push Jerk' }])]),
    ]);
    const titulo = missing.find((m) => m.token === 'FUERZA PARTE ALTA');
    const real = missing.find((m) => m.token === 'Push Jerk');
    expect(titulo!.notAnExercise).toBe('titulo');
    expect(real!.notAnExercise).toBeNull();
    // Y el contador solo cuenta lo que de verdad hay que resolver.
    expect(realMissingCount(missing)).toBe(1);
  });

  test('3. «A)» no tiene ni una palabra: tampoco es un ejercicio', () => {
    const [m] = collectMissingExercises([week([session('Fuerza', [{ name: 'A)' }])])]);
    expect(m!.notAnExercise).toBe('sin_palabras');
  });
});

describe('la modalidad SOLO se propone con evidencia', () => {
  test('la que tipó la gramática en la línea manda sobre todo', () => {
    const [m] = collectMissingExercises([
      week([session('Incremental ergómetros', [{ name: 'Remo', modality: 'row' }])]),
    ]);
    expect(m!.suggestedModality).toBe('row');
    expect(m!.evidence).toBe('linea');
    expect(m!.suggestedCategory).toBe('cardio');
  });

  test('sin ella, el título de la tarjeta: «Movilidad general» → movilidad', () => {
    const [m] = collectMissingExercises([
      week([session('Movilidad general', [{ name: 'Cat Cow' }])]),
    ]);
    expect(m!.suggestedModality).toBe('mobility');
    expect(m!.evidence).toBe('bloque');
    expect(m!.suggestedCategory).toBe('mobility');
  });

  test('sin evidencia NO se inventa: «Refuerzo hombro» no dice la modalidad', () => {
    // `modalityFrom` nunca devuelve fuerza, funcional ni core. Rellenar esto con
    // «fuerza por defecto» es exactamente lo que rompe el entreno en vivo.
    const [m] = collectMissingExercises([
      week([session('Refuerzo hombro', [{ name: 'Cable External Rotation' }])]),
    ]);
    expect(m!.suggestedModality).toBeNull();
    expect(m!.evidence).toBe('ninguna');
    expect(m!.suggestedCategory).toBeNull();
  });

  test('si aparece en dos tarjetas y una tiene pista, vale la pista', () => {
    const [m] = collectMissingExercises([
      week([
        session('Refuerzo hombro', [{ name: 'Cobra Pose' }]),
        session('Movilidad general', [{ name: 'Cobra Pose' }]),
      ]),
    ]);
    expect(m!.blockTitles).toEqual(['Refuerzo hombro', 'Movilidad general']);
    expect(m!.suggestedModality).toBe('mobility');
  });
});

describe('estampar lo decidido cierra el círculo', () => {
  test('todas las líneas del mismo token quedan resueltas de una vez', () => {
    const weeks = [
      week([
        session('Movilidad general', [{ name: 'Cat Cow' }, { name: 'Bird Dog' }]),
        session('Movilidad general', [{ name: 'Cat Cow' }]),
      ]),
    ];
    const next = applyResolvedTokens(weeks, [
      { key: 'cat cow', exercise_id: 501, exercise_name: 'Cat Cow' },
    ]);
    const items = next[0]!.days[0]!.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
    expect(items.filter((i) => i.exercise_id === 501)).toHaveLength(2);
    // El que no se decidió sigue sin resolver: no se toca lo que no se pidió.
    expect(items.find((i) => i.exercise_name === 'Bird Dog')!.exercise_id).toBeNull();
  });

  test('la línea pasa a llamarse como el ejercicio, no como el token de la fuente', () => {
    const weeks = [week([session('Fuerza', [{ name: 'Dominadas' }])])];
    const next = applyResolvedTokens(weeks, [
      { key: 'dominadas', exercise_id: 7, exercise_name: 'Dominada' },
    ]);
    const item = next[0]!.days[0]!.sessions[0]!.blocks[0]!.items[0]!;
    expect(item.exercise_name).toBe('Dominada');
    expect(item.exercise_id).toBe(7);
  });

  test('lo que ya estaba resuelto no se pisa', () => {
    const weeks = [week([session('Fuerza', [{ name: 'Back Squat', exerciseId: 10 }])])];
    const next = applyResolvedTokens(weeks, [
      { key: 'back squat', exercise_id: 999, exercise_name: 'Otro' },
    ]);
    expect(next[0]!.days[0]!.sessions[0]!.blocks[0]!.items[0]!.exercise_id).toBe(10);
  });

  test('sin nada decidido, las semanas salen igual', () => {
    const weeks = [week([session('Fuerza', [{ name: 'Cat Cow' }])])];
    expect(applyResolvedTokens(weeks, [])).toEqual(weeks);
  });
});

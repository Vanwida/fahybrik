// El portón de completitud del conector juzga la prescripción QUE SE PERSISTE.
//
// CASO REAL (10-ago-2026): el coach dictó «fartlek 16×500 en Z4 con 1' de trote en
// Z2» y el cliente lo convirtió en estructura tipada perfecta, con su objetivo
// DENTRO de cada tramo y sin dosis plana (no tiene por qué escribirla: la deriva el
// escritor). El portón corría antes de derivar el plano, así que miraba una
// prescripción sin `sets` ni `target` y devolvía el aviso «Sin objetivo: falta
// ritmo, zona, pulso o RPE» encima de un entreno que declara la zona en cada
// tramo. Aquí se fija el orden: normalizar (canónico + plano) → juzgar → leer de
// vuelta.

import { describe, expect, test } from 'vitest';
import {
  contentReadback,
  gateContent,
  normalizeContentBlocks,
  type ContentBlock,
  type ContentExercise,
} from '@/lib/mcp/write-content';

const RUN_EXERCISE: ContentExercise = { exercise_id: 1, name: 'Correr', modality: 'run' };
const STRENGTH_EXERCISE: ContentExercise = { exercise_id: 2, name: 'Sentadilla', modality: 'strength' };
const EXERCISES = new Map<number, ContentExercise>([
  [1, RUN_EXERCISE],
  [2, STRENGTH_EXERCISE],
]);

/** La estructura del fartlek real, con la zona en el trabajo Y en la recuperación. */
const FARTLEK_STRUCTURE = [
  {
    role: 'main' as const,
    elements: [
      {
        times: 16,
        elements: [
          { kind: 'work' as const, measure: { type: 'distance' as const, m: 500 }, target: { type: 'hr_zone' as const, zone: 4 } },
          {
            kind: 'recovery' as const,
            measure: { type: 'duration' as const, s: 60 },
            target: { type: 'hr_zone' as const, zone: 2 },
            recovery_mode: 'trote' as const,
          },
        ],
      },
    ],
  },
];

function runBlock(prescription: Record<string, unknown>): ContentBlock[] {
  return [
    {
      title: 'Series',
      items: [{ exercise_id: 1, prescription: prescription as never }],
    },
  ] as ContentBlock[];
}

describe('el portón mira la prescripción enriquecida, no la del cable', () => {
  const BLOCKS = runBlock({ scheme: 'intervals', modality: 'run', structure: FARTLEK_STRUCTURE });

  test('estructura sola con objetivos dentro: ni bloqueo ni aviso falso de objetivo', () => {
    const gate = gateContent(normalizeContentBlocks(BLOCKS), EXERCISES);
    expect(gate.blocking).toEqual([]);
    expect(gate.avisos).toEqual([]);
  });

  test('la lectura de vuelta narra la estructura, con la recuperación activa', () => {
    const [block] = contentReadback(normalizeContentBlocks(BLOCKS), EXERCISES);
    expect(block!.lines).toEqual(["Correr 16×(500m @ Z4 / 1' trote Z2)"]);
  });

  test('normalizar deriva el plano del contrato aditivo y no lo duplica al repetir', () => {
    const once = normalizeContentBlocks(BLOCKS);
    const twice = normalizeContentBlocks(once as unknown as ContentBlock[]);
    const p = once[0]!.items[0]!.prescription;
    expect(p.rounds).toBe(16);
    expect(p.rest_s).toBe(60);
    expect(p.sets).toEqual([{ measure: { kind: 'distance', meters: 500 }, rest_s: 60 }]);
    expect(p.structure).toBeDefined();
    expect(twice[0]!.items[0]!.prescription).toEqual(p);
  });

  test('el plano que declaró el autor manda: no se sobreescribe con el flatten', () => {
    const blocks = runBlock({
      scheme: 'intervals',
      modality: 'run',
      rounds: 8,
      rest_s: 90,
      sets: [{ measure: { kind: 'distance', meters: 400 }, rest_s: 90 }],
      structure: FARTLEK_STRUCTURE,
    });
    const p = normalizeContentBlocks(blocks)[0]!.items[0]!.prescription;
    expect(p.rounds).toBe(8);
    expect(p.rest_s).toBe(90);
  });
});

describe('el aviso sigue saliendo cuando es verdad', () => {
  test('sin objetivo ni en la estructura ni en el plano: avisa', () => {
    const blocks = runBlock({
      scheme: 'intervals',
      modality: 'run',
      structure: [
        {
          role: 'main',
          elements: [
            {
              times: 6,
              elements: [
                { kind: 'work', measure: { type: 'distance', m: 400 }, target: null },
                { kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' },
              ],
            },
          ],
        },
      ],
    });
    const gate = gateContent(normalizeContentBlocks(blocks), EXERCISES);
    expect(gate.blocking).toEqual([]);
    expect(gate.avisos).toEqual(['«Series» · Correr: Sin objetivo: falta ritmo, zona, pulso o RPE.']);
  });

  test('un rodaje plano sin objetivo avisa igual que antes (nada que ver con la estructura)', () => {
    const gate = gateContent(
      normalizeContentBlocks(runBlock({ scheme: 'steady', modality: 'run', total_s: 2700 })),
      EXERCISES,
    );
    expect(gate.avisos).toEqual(['«Series» · Correr: Sin objetivo: falta ritmo, zona, pulso o RPE.']);
  });

  test('lo que el atleta no podría ejecutar sigue bloqueando', () => {
    const blocks = [
      { title: 'Fuerza', items: [{ exercise_id: 2, prescription: { scheme: 'sets' } as never }] },
    ] as ContentBlock[];
    const gate = gateContent(normalizeContentBlocks(blocks), EXERCISES);
    expect(gate.blocking).toEqual([
      '«Fuerza» · Sentadilla: Sin dosis: no dice cuánto trabajo hacer (ni medida, ni tiempo).',
    ]);
  });
});

// Calentamiento y vuelta a la calma son tipos de bloque de verdad: están en el
// catálogo (`warmup` / `cooldown`), iOS los pinta como lista, y el editor del
// panel tiene que reconocerlos. Si no, un warm-up de bandas se lee como Fuerza
// (el color sale del primer ejercicio) y no hay chip de tipo (card 156).

import { describe, expect, test } from 'vitest';
import {
  ARCHETYPES,
  archetypeForFormat,
  createBlockFromArchetype,
  patternForBlock,
  seedArchetype,
} from '@/lib/dashboard/v2/archetypes';
import { blockModalitySlug, blockTypeLabel } from '@/components/v2/editor/block-helpers';
import { deriveDayModality } from '@/lib/dashboard/v2/planes-model';
import { buildWeekOutline } from '@/components/v2/planes/semana-model';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';

describe('calentamiento y vuelta existen en el selector', () => {
  test('están en el picker, con el color de calentamiento', () => {
    const wu = ARCHETYPES.find((a) => a.id === 'warmup');
    const cd = ARCHETYPES.find((a) => a.id === 'cooldown');

    expect(wu?.format).toBe('warmup');
    expect(wu?.shortName).toBe('Calentamiento');
    expect(wu?.modalitySlug).toBe('calentamiento');
    expect(wu?.pattern).toBe('list');

    expect(cd?.format).toBe('cooldown');
    expect(cd?.shortName).toBe('Vuelta');
    expect(cd?.modalitySlug).toBe('calentamiento');
  });

  test('un bloque recargado con format warmup encuentra su tipo', () => {
    expect(archetypeForFormat('warmup')?.id).toBe('warmup');
    expect(patternForBlock(undefined, 'warmup')).toBe('list');
    expect(patternForBlock(undefined, 'cooldown')).toBe('list');
  });

  test('la semilla es una prescripción válida, lista, no una tabla de fuerza', () => {
    const p = seedArchetype('warmup');
    expect(p.scheme).toBe('warmup');
    expect(p.modality).toBe('mobility');
    expect(safeParsePrescription(p).success).toBe(true);

    const block = createBlockFromArchetype('warmup');
    expect(block.format).toBe('warmup');
    expect(block.title).toBe('Calentamiento');
    expect(block.items).toHaveLength(1);
  });
});

describe('el editor no pinta un warmup como fuerza', () => {
  const warmupOfBands: EditorBlock = {
    uid: 'b1',
    title: 'Warm up',
    format: 'warmup',
    items: [
      {
        uid: 'i1',
        exercise_id: 1,
        exercise_name: 'Band Scapular Retraction',
        prescription: {
          scheme: 'sets',
          modality: 'strength',
          sets: [{ measure: { kind: 'reps', value: 8 } }],
        },
      },
    ],
  };

  test('el chip dice Calentamiento aunque los ejercicios sean de fuerza', () => {
    expect(blockTypeLabel(warmupOfBands)).toBe('Calentamiento');
  });

  test('el lomo es calentamiento, no fuerza', () => {
    expect(blockModalitySlug(warmupOfBands)).toBe('calentamiento');
  });
});

describe('la semana también colorea el warmup como calentamiento', () => {
  test('el format manda sobre la modalidad del ejercicio', () => {
    const day: WeekDay = {
      day_of_week: 2,
      sessions: [
        {
          kind: 'workout',
          focus: 'Fuerza tren superior + core',
          blocks: [
            {
              uid: 'b1',
              format: 'warmup',
              title: 'Warm up',
              items: [
                {
                  uid: 'i1',
                  exercise_id: 1,
                  exercise_name: 'Band Scapular Retraction',
                  prescription_json: {
                    scheme: 'sets',
                    modality: 'strength',
                    sets: [{ measure: { kind: 'reps', value: 8 } }],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const info = deriveDayModality(day);
    expect(info.sessions[0]!.focus).toBe('Fuerza tren superior + core');
    expect(info.sessions[0]!.blocks[0]!.modality).toBe('calentamiento');
    expect(buildWeekOutline([info])[0]!.resumen).toBe('Fuerza tren superior + core');
  });
});

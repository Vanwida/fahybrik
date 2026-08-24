// El título del ENTRENO y el del primer bloque son dos campos. Copiar el
// segundo al primero (create_microcycle sin title de día) es lo que dejó
// «Fuerza tren superior + core · Warm up» como nombre de un calentamiento.

import { describe, expect, test } from 'vitest';
import { editorSessionFromContent } from '@/lib/mcp/microcycle-write';
import type { ContentExercise, NormalizedContentBlock } from '@/lib/mcp/write-content';

const BAND: ContentExercise = {
  exercise_id: 1,
  name: 'Band Scapular Retraction',
  modality: 'strength',
};

const WARMUP: NormalizedContentBlock = {
  title: 'Warm up',
  format: 'warmup',
  items: [
    {
      exercise_id: 1,
      prescription: {
        scheme: 'warmup',
        modality: 'strength',
        sets: [{ measure: { kind: 'reps', value: 8 } }],
      },
    },
  ],
};

describe('el título del día es el del entreno, no el del primer bloque', () => {
  test('sesión y bloque quedan en su sitio', () => {
    const session = editorSessionFromContent({
      title: 'Fuerza tren superior + core',
      blocks: [WARMUP],
      exercises: new Map([[1, BAND]]),
    });

    expect(session.focus).toBe('Fuerza tren superior + core');
    expect(session.blocks).toHaveLength(1);
    expect(session.blocks[0]!.title).toBe('Warm up');
    expect(session.blocks[0]!.format).toBe('warmup');
  });

  test('un title vacío no se inventa a partir del bloque', () => {
    const session = editorSessionFromContent({
      title: '   ',
      blocks: [WARMUP],
      exercises: new Map([[1, BAND]]),
    });

    expect(session.focus).toBeUndefined();
    expect(session.blocks[0]!.title).toBe('Warm up');
  });
});

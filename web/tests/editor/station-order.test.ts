import { describe, expect, test } from 'vitest';
import { blockAthleteLine } from '@/components/v2/editor/AthletePreviewLine';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

function item(name: string, scheme: Prescription['scheme']): EditorItem {
  return {
    uid: `i-${name}`,
    exercise_id: 1,
    exercise_name: name,
    prescription: {
      scheme,
      modality: 'functional',
      sets: [{ measure: { kind: 'reps', value: 10 } }],
    },
  };
}

function block(format: string | null, items: EditorItem[]): EditorBlock {
  return { uid: 'b1', title: 'Bloque', format, items };
}

describe('blockAthleteLine · estaciones', () => {
  test('un circuito con una estación sigue diciendo circuito', () => {
    const line = blockAthleteLine(block('circuit', [item('Wall Balls', 'rounds')]));
    expect(line.startsWith('circuito')).toBe(true);
    expect(line).toContain('Wall Balls');
  });

  test('un bloque de estaciones secuencial dice seguido', () => {
    const line = blockAthleteLine(
      block('for_time', [item('SkiErg', 'for_time'), item('Rowing', 'for_time')]),
    );
    expect(line.startsWith('seguido')).toBe(true);
  });

  test('un format desconocido dice no lo sé y no se pinta como tabla de series', () => {
    const line = blockAthleteLine(block('future_wod', [item('Burpees', 'sets')]));
    expect(line.startsWith('no lo sé')).toBe(true);
    expect(line.includes('—')).toBe(false);
  });
});

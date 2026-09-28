/**
 * EL serializador de plantillas (web/lib/templates/template-content.ts) — las
 * reglas que aplican TODOS los caminos que escriben un entreno (DECISIONS
 * 2026-09-28). Puro: sin base de datos. El recorrido contra una rama real está en
 * tests/templates/one-template-writer.db.test.ts.
 */
import { describe, expect, test } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import {
  blocksFromRows,
  InvalidAuthoringLineError,
  resolveBlockFormat,
  serializeTemplateContent,
  undosedContentLines,
  type TemplateContentBlock,
} from '@/lib/templates/template-content';

const p = (x: Prescription): Prescription => x;
const line = (exercise_id: number, prescription: Prescription | null, extra = {}) => ({
  exercise_id,
  prescription,
  ...extra,
});

describe('resolveBlockFormat — el formato ELEGIDO del bloque', () => {
  const amrap = p({ scheme: 'amrap', total_s: 720, sets: [{ measure: { kind: 'reps', value: 10 } }] });

  test('un WOD nacido for_time que el coach pasó a AMRAP se guarda amrap', () => {
    expect(resolveBlockFormat('for_time', [{ prescription: amrap }, { prescription: amrap }])).toBe('amrap');
  });

  test('las líneas mezcladas no deciden: se queda el declarado', () => {
    const run = p({ scheme: 'steady', total_s: 300 });
    expect(resolveBlockFormat('for_time', [{ prescription: amrap }, { prescription: run }])).toBe('for_time');
  });

  test('una línea con campos que su formato no admite no manda (EMOM heredado con rondas + ventana)', () => {
    const legacy = p({ scheme: 'rounds', rounds: 5, work_s: 120, sets: [{ measure: { kind: 'reps', value: 3 } }] });
    expect(resolveBlockFormat('emom', [{ prescription: legacy }])).toBe('emom');
  });

  test('los tipos de bloque que no son del selector se respetan (circuito, test, hyrox, calentamiento)', () => {
    const rounds = p({ scheme: 'rounds', sets: [{ measure: { kind: 'reps', value: 12 } }] });
    expect(resolveBlockFormat('circuit', [{ prescription: rounds }])).toBe('circuit');
    expect(resolveBlockFormat('test', [{ prescription: p({ scheme: 'steady', total_s: 180 }) }])).toBe('test');
    expect(resolveBlockFormat('warmup', [{ prescription: p({ scheme: 'warmup', sets: [] }) }])).toBe('warmup');
  });

  test('sin declarar: el de sus líneas, con el vocabulario del editor', () => {
    const steady = p({ scheme: 'steady', total_s: 1800 });
    const sets = p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 } }] });
    expect(resolveBlockFormat(null, [{ prescription: steady }])).toBe('tempo');
    expect(resolveBlockFormat(null, [{ prescription: sets }])).toBe('strength_block');
    expect(resolveBlockFormat(null, [{ prescription: sets }, { prescription: sets }])).toBe('sets');
    expect(resolveBlockFormat(null, [{ prescription: amrap }])).toBe('amrap');
    expect(resolveBlockFormat(null, [{ prescription: null }])).toBeNull();
  });

  test('un valor que el enum no conoce no se guarda', () => {
    expect(resolveBlockFormat('fartlek', [{ prescription: null }])).toBeNull();
  });
});

describe('serializeTemplateContent', () => {
  const blocks: TemplateContentBlock[] = [
    { title: 'Vacío', format: 'sets', items: [] },
    {
      title: 'Calentamiento',
      format: 'warmup',
      items: [line(10, p({ scheme: 'warmup', sets: [{ measure: { kind: 'reps', value: 10 } }] }))],
    },
    {
      title: ' Circuito ',
      format: 'circuit',
      circuit: { rounds: 4, pacing: { kind: 'por_tarea' }, rest_between_rounds_seconds: 90 },
      items: [
        line(20, p({ scheme: 'rounds', rounds: 4, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 25 } }] })),
        line(21, p({ scheme: 'rounds', sets: [{ measure: { kind: 'calories', value: 15 } }] })),
      ],
    },
    { title: 'Heredado', format: null, items: [line(30, null, { params_json: { sets: 3, reps: 10 } })] },
  ];

  const out = serializeTemplateContent(blocks);

  test('posiciones desde 0 y contiguas; un bloque vacío no deja hueco', () => {
    expect(out.segments.map((s) => [s.position, s.block_position])).toEqual([
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
  });

  test('el circuito guarda rondas/pacing UNA vez y las estaciones no las repiten', () => {
    expect(out.blocks).toEqual([
      { block_position: 1, circuit: { rounds: 4, pacing: { kind: 'por_tarea' }, rest_between_rounds_seconds: 90 } },
    ]);
    const station = out.segments[1]!.prescription_json!;
    expect(station.rounds).toBeUndefined();
    expect(station.rest_s).toBeUndefined();
    expect(out.segments[1]!.block_title).toBe('Circuito');
  });

  test('params_json SIEMPRE derivado; una línea heredada conserva el suyo', () => {
    expect(out.segments[0]!.params_json).toMatchObject({ sets: 1, reps: 10 });
    expect(out.segments[2]!.params_json).toMatchObject({ calories: 15 });
    expect(out.segments[3]!.params_json).toEqual({ sets: 3, reps: 10 });
    expect(out.segments[3]!.prescription_json).toBeNull();
  });

  test('la modalidad del ejercicio manda sobre la de la prescripción', () => {
    const [seg] = serializeTemplateContent([
      {
        title: null,
        format: 'sets',
        items: [line(1, p({ scheme: 'sets', modality: 'functional', sets: [{ measure: { kind: 'reps', value: 5 } }] }), { exercise_modality: 'strength' })],
      },
    ]).segments;
    expect(seg!.prescription_json!.modality).toBe('strength');
  });

  test('una línea sin ejercicio no se guarda en silencio', () => {
    expect(() => serializeTemplateContent([{ title: 'A', format: 'sets', items: [line(0, null)] }])).toThrow(
      InvalidAuthoringLineError,
    );
  });

  test('ida y vuelta: filas → bloques → filas da las mismas filas', () => {
    const again = serializeTemplateContent(blocksFromRows(out.segments, out.blocks));
    expect(again.blocks).toEqual(out.blocks);
    expect(again.segments.map(({ exercise_name: _n, ...rest }) => rest)).toEqual(
      out.segments.map(({ exercise_name: _n, ...rest }) => rest),
    );
  });
});

describe('undosedContentLines — el listón ejecutable, nada más', () => {
  test('una línea sin dosis bloquea; la falta de objetivo no', () => {
    const content = serializeTemplateContent([
      {
        title: 'Fuerza',
        format: 'sets',
        items: [
          line(1, p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 } }] }), { exercise_name: 'Sentadilla' }),
          line(2, p({ scheme: 'sets' }), { exercise_name: 'Press' }),
        ],
      },
    ]);
    const reasons = undosedContentLines(content, new Map([[1, 'strength'], [2, 'strength']]));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('Press');
  });

  test('una línea heredada sin prescripción no se juzga', () => {
    const content = serializeTemplateContent([{ title: null, format: null, items: [line(3, null, { params_json: {} })] }]);
    expect(undosedContentLines(content)).toEqual([]);
  });
});

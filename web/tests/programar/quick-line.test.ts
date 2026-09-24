import { describe, expect, test } from 'vitest';
import { weekDaySchema } from '@fahybrid/shared/schema/program-templates';
import {
  appendPart,
  lookupToken,
  parseQuickLine,
  partFromQuickLines,
} from '@/lib/dashboard/programming/quick-line';
import { restDay } from '@/lib/dashboard/programming/grid-model';
import { summarizeCell } from '@/lib/dashboard/programming/cell-summary';

describe('línea rápida', () => {
  test('el ejemplo del placeholder produce un bloque GUARDABLE con el ejercicio enlazado', () => {
    const { lines, typed } = parseQuickLine('press banca 4x4 @78-80% r90');
    expect(typed).toBe(true);
    expect(lookupToken(lines[0]!)).toBe('press banca');
    const part = partFromQuickLines(lines, [{ id: '42', name: 'Press de banca' }]);
    expect(part).not.toBeNull();
    expect(part!.items[0]!.exercise_id).toBe(42);
    expect(part!.items[0]!.params_json).toMatchObject({ sets: 4 });
    const day = appendPart(restDay(1), part!);
    // escribir en un descanso lo convierte en día de entreno
    expect(day.kind).toBeUndefined();
    expect(weekDaySchema.safeParse(day).success).toBe(true);
    expect(summarizeCell(day).entrenos[0]!.lines[0]!.text).toBe("Press de banca 4×4 @ 78-80% RM · r90''");
  });

  test('una serie sin nombre se busca por su modalidad', () => {
    const { lines } = parseQuickLine("8x400m r1' z4");
    expect(lookupToken(lines[0]!)).toBe('carrera');
    const part = partFromQuickLines(lines, [{ id: '7', name: 'Carrera' }]);
    expect(part!.items[0]!.prescription_json!.modality).toBe('run');
  });

  test('lo que no se entiende entero o no tiene ejercicio NO entra', () => {
    const bad = parseQuickLine('esto no es una dosis 5x');
    expect(bad.typed).toBe(false);
    const ok = parseQuickLine('wall balls 3x20');
    expect(partFromQuickLines(ok.lines, [null])).toBeNull();
    expect(partFromQuickLines([], [])).toBeNull();
  });

  test('añadir un segundo bloque va al mismo entreno con la letra siguiente', () => {
    const a = partFromQuickLines(parseQuickLine('sentadilla 5x5 @75%').lines, [{ id: '1', name: 'Sentadilla' }])!;
    const b = partFromQuickLines(parseQuickLine('wall balls 3x20').lines, [{ id: '2', name: 'Wall ball' }])!;
    const day = appendPart(appendPart({ day_of_week: 2, sessions: [] }, a), b);
    expect(summarizeCell(day).entrenos[0]!.lines.map((l) => l.letter)).toEqual(['A', 'B']);
  });
});

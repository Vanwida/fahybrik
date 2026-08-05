/**
 * `placeImportedWeeks` — WHERE a photo-read week/day lands in the coach's
 * real microcycle. Pure, no DB: `AvailableWeek[]` is handed in directly, as
 * `buildPhotoProposal` would after resolving `target_week_id` against the
 * real microcycle (see photo-target-week.test.ts for that half).
 *
 * The five rules from the spec, one describe block each:
 *   1. sin target_weekday — cada día en su día real; semanas consecutivas.
 *   2. con target_weekday + un solo día — va exactamente ahí.
 *   3. con target_weekday + varios días — hueco relativo conservado.
 *   4. el desbordamiento del microciclo nunca se recorta en silencio.
 *   5. "encontrado" = con contenido; los huecos vacíos del lector nunca
 *      ocupan un día ni una semana de destino.
 */
import { describe, expect, test } from 'vitest';
import { placeImportedWeeks, type AvailableWeek } from '@/lib/import/photo-placement';
import type { ImportedCard, ImportedDay, ImportedWeek } from '@/lib/import/imported-week';

const DOW = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function workoutCard(title: string): ImportedCard {
  return { title, kind: 'workout', lines: [`${title} — 5x5`] };
}
function restCard(): ImportedCard {
  return { title: 'DESCANSO', kind: 'rest', lines: [] };
}

/** A full 7-slot week, matching EXACTLY what the reader always emits: every
 *  day present, only the given `content` days carry cards, the rest empty
 *  placeholders (`cards: []`) — never "found". */
function readerWeek(content: Partial<Record<number, ImportedCard[]>>): ImportedWeek {
  const days: ImportedDay[] = [];
  for (let dow = 1; dow <= 7; dow += 1) {
    days.push({
      day_of_week: dow,
      dow: DOW[dow]!,
      stimulus: null,
      session_text: null,
      cards: content[dow] ?? [],
    });
  }
  return { week: 1, sheet: 'foto', fell_back: false, days };
}

function available(count: number, startIndex = 0): AvailableWeek[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `week-${startIndex + i}`,
    week_index: startIndex + i,
  }));
}

/** Flatten every placed day across every output week, for terse assertions. */
function flatten(weeks: ImportedWeek[]): Array<{ week: number; day_of_week: number; dow: string }> {
  return weeks.flatMap((w) => w.days.map((d) => ({ week: w.week, day_of_week: d.day_of_week, dow: d.dow })));
}

describe('1. sin target_weekday — cada día en su día real, semanas consecutivas', () => {
  test('un día real conservado tal cual — sin ancla, la semana completa de 7 pasa intacta', () => {
    const weeks = [readerWeek({ 2: [workoutCard('A')] })];
    const out = placeImportedWeeks(weeks, available(3), undefined);
    expect(out).toHaveLength(1);
    expect(out[0]!.days).toHaveLength(7); // sin ancla no se filtra: pasa la semana entera
    const withContent = out[0]!.days.filter((d) => d.cards!.length > 0);
    expect(withContent).toEqual([{ day_of_week: 2, dow: 'Martes', stimulus: null, session_text: null, cards: [workoutCard('A')] }]);
  });

  test('varias semanas leídas → la primera a la semana elegida, las siguientes consecutivas', () => {
    const weeks = [
      readerWeek({ 1: [workoutCard('S1')] }),
      readerWeek({ 3: [workoutCard('S2')] }),
    ];
    // availableWeeks ya viene recortado desde target_week_id (week_index 4)
    const out = placeImportedWeeks(weeks, available(5, 4), undefined);
    expect(out.map((w) => w.week)).toEqual([5, 6]); // week_index+1
    expect(out[0]!.days.find((d) => d.cards!.length > 0)!.day_of_week).toBe(1);
    expect(out[1]!.days.find((d) => d.cards!.length > 0)!.day_of_week).toBe(3);
  });

  test('7 días completos (semana entera) llegan intactos, incluidos los vacíos', () => {
    const weeks = [readerWeek({ 1: [workoutCard('L')], 5: [workoutCard('V')] })];
    const out = placeImportedWeeks(weeks, available(2), undefined);
    expect(out[0]!.days).toHaveLength(7);
    expect(out[0]!.days.map((d) => d.cards!.length)).toEqual([1, 0, 0, 0, 1, 0, 0]);
  });
});

describe('2. con target_weekday + UN solo día — va exactamente ahí, la foto no manda', () => {
  test('un día leído como Lunes, anclado en Jueves → Jueves', () => {
    const weeks = [readerWeek({ 1: [workoutCard('A')] })];
    const out = placeImportedWeeks(weeks, available(2), 4);
    expect(flatten(out)).toEqual([{ week: 1, day_of_week: 4, dow: 'Jueves' }]);
  });

  test('el mismo día ancla en sí mismo (target_weekday igual al leído) — no-op', () => {
    const weeks = [readerWeek({ 3: [workoutCard('A')] })];
    const out = placeImportedWeeks(weeks, available(1), 3);
    expect(flatten(out)).toEqual([{ week: 1, day_of_week: 3, dow: 'Miércoles' }]);
  });
});

describe('3. con target_weekday + VARIOS días — el hueco relativo se conserva', () => {
  test('lunes + miércoles (hueco 2), ancla en martes → martes + jueves', () => {
    const weeks = [readerWeek({ 1: [workoutCard('L')], 3: [workoutCard('M')] })];
    const out = placeImportedWeeks(weeks, available(2), 2);
    expect(flatten(out)).toEqual([
      { week: 1, day_of_week: 2, dow: 'Martes' },
      { week: 1, day_of_week: 4, dow: 'Jueves' },
    ]);
  });

  test('lunes a viernes (hueco 1 cada uno), ancla en martes → martes..sábado, misma semana', () => {
    const weeks = [
      readerWeek({
        1: [workoutCard('L')],
        2: [workoutCard('M')],
        3: [workoutCard('X')],
        4: [workoutCard('J')],
        5: [workoutCard('V')],
      }),
    ];
    const out = placeImportedWeeks(weeks, available(2), 2);
    expect(flatten(out).map((d) => d.day_of_week)).toEqual([2, 3, 4, 5, 6]);
    expect(out).toHaveLength(1); // sin desbordar: sigue siendo UNA semana
  });

  test('viernes+sábado+domingo, ancla en sábado → sábado, domingo, y LUNES DE LA SIGUIENTE SEMANA', () => {
    const weeks = [
      readerWeek({ 5: [workoutCard('V')], 6: [workoutCard('S')], 7: [workoutCard('D')] }),
    ];
    const out = placeImportedWeeks(weeks, available(2), 6);
    expect(out).toHaveLength(2); // se desborda a la semana siguiente, no se recorta
    expect(out[0]!.days.map((d) => d.day_of_week)).toEqual([6, 7]);
    expect(out[1]!.days.map((d) => d.day_of_week)).toEqual([1]);
    expect(out.map((w) => w.week)).toEqual([1, 2]);
  });

  test('dos semanas leídas con solo un día cada una, ancla en jueves — cruza igual entre semanas reales', () => {
    const weeks = [readerWeek({ 7: [workoutCard('D1')] }), readerWeek({ 1: [workoutCard('L2')] })];
    // domingo(semana1) → lunes(semana2) real: hueco de 1 día en origen.
    const out = placeImportedWeeks(weeks, available(2), 4);
    expect(flatten(out)).toEqual([
      { week: 1, day_of_week: 4, dow: 'Jueves' },
      { week: 1, day_of_week: 5, dow: 'Viernes' },
    ]);
  });
});

describe('4. el desbordamiento del microciclo nunca se recorta en silencio', () => {
  test('sin target_weekday: más semanas leídas que semanas disponibles → error con los dos números', () => {
    const weeks = [readerWeek({ 1: [workoutCard('A')] }), readerWeek({ 1: [workoutCard('B')] })];
    expect(() => placeImportedWeeks(weeks, available(1), undefined)).toThrowError(
      expect.objectContaining({ code: 'week_overflow', status: 422 }),
    );
    try {
      placeImportedWeeks(weeks, available(1), undefined);
    } catch (err) {
      expect((err as Error).message).toContain('caben 1');
      expect((err as Error).message).toContain('trae 2');
    }
  });

  test('con target_weekday: el hueco preservado empuja más allá de las semanas disponibles', () => {
    // Viernes+Sábado+Domingo anclado en Sábado → Sábado, Domingo, y el Lunes
    // de la semana SIGUIENTE (ver el test de la sección 3): hacen falta 2
    // semanas, solo hay 1.
    const weeks = [
      readerWeek({ 5: [workoutCard('V')], 6: [workoutCard('S')], 7: [workoutCard('D')] }),
    ];
    expect(() => placeImportedWeeks(weeks, available(1), 6)).toThrowError(
      expect.objectContaining({ code: 'week_overflow', status: 422 }),
    );
  });

  test('justo en el límite (cabe exacto) no lanza', () => {
    const weeks = [
      readerWeek({ 5: [workoutCard('V')], 6: [workoutCard('S')], 7: [workoutCard('D')] }),
    ];
    expect(() => placeImportedWeeks(weeks, available(2), 6)).not.toThrow();
    expect(() => placeImportedWeeks(weeks, available(1), 6)).toThrow();
  });
});

describe('5. "encontrado" = con contenido — los huecos vacíos del lector nunca ocupan sitio', () => {
  test('un día de descanso EXPLÍCITO (kind rest) SÍ cuenta como encontrado', () => {
    const weeks = [readerWeek({ 1: [workoutCard('L')], 4: [restCard()] })];
    const out = placeImportedWeeks(weeks, available(1), 1);
    expect(flatten(out)).toEqual([
      { week: 1, day_of_week: 1, dow: 'Lunes' },
      { week: 1, day_of_week: 4, dow: 'Jueves' },
    ]);
  });

  test('los 5 días vacíos de una semana de "solo lunes" no aparecen en el resultado anclado', () => {
    const weeks = [readerWeek({ 1: [workoutCard('L')] })];
    const out = placeImportedWeeks(weeks, available(1), 3);
    expect(out).toHaveLength(1);
    expect(out[0]!.days).toHaveLength(1);
  });
});

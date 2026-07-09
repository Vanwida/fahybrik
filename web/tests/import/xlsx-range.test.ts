import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseWeekRange, parseDayDestination } from '@/lib/import/range-parse';
import { readPlanWorkbook, parsePastedText } from '@/lib/import/xlsx-reader';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Pablo's real 12-week plan workbook lives at repo-root /docs.
const PLAN_XLSX = resolve(__dirname, '../../../docs/Plantilla_HYROX_12sem (1) 2.xlsx');

describe('parseWeekRange', () => {
  const expectWeeks = (text: string, weeks: number[]) => {
    const r = parseWeekRange(text);
    expect(r, `for "${text}"`).toEqual({ weeks });
  };

  test('range "de la semana 1 a la 4"', () => expectWeeks('de la semana 1 a la 4', [1, 2, 3, 4]));
  test('single "solo la semana 1"', () => expectWeeks('solo la semana 1', [1]));
  test('dash range "semanas 1-4"', () => expectWeeks('semanas 1-4', [1, 2, 3, 4]));
  test('bare range "de la 4 a la 9"', () => expectWeeks('de la 4 a la 9', [4, 5, 6, 7, 8, 9]));
  test('range with trailing prose', () =>
    expectWeeks('1 a 4, que es este microciclo', [1, 2, 3, 4]));

  // Extra shapes the coach may naturally type.
  test('bare single number', () => expectWeeks('4', [4]));
  test('explicit list "semanas 1, 3 y 5"', () => expectWeeks('semanas 1, 3 y 5', [1, 3, 5]));
  test('"hasta" connector', () => expectWeeks('de la 2 hasta la 5', [2, 3, 4, 5]));
  test('reversed range is normalised ascending', () =>
    expectWeeks('de la 9 a la 4', [4, 5, 6, 7, 8, 9]));

  test('rejects text with no week', () => {
    const r = parseWeekRange('hola qué tal');
    expect(r).toHaveProperty('error');
  });
  test('rejects out-of-season week', () => {
    const r = parseWeekRange('la semana 99');
    expect(r).toHaveProperty('error');
  });
  test('rejects out-of-season range end', () => {
    const r = parseWeekRange('de la 10 a la 14');
    expect(r).toHaveProperty('error');
  });
  test('rejects empty input', () => {
    expect(parseWeekRange('')).toHaveProperty('error');
  });
});

describe('parseDayDestination (PASTE flow — one day = week + weekday)', () => {
  test('"semana 1 jueves" → week 1, weekday 4 (the bug: jueves was dropped before)', () =>
    expect(parseDayDestination('semana 1 jueves')).toEqual({ week: 1, weekday: 4 }));
  test('"semana 1 día 4" → week 1, weekday 4 (the shape that used to 400)', () =>
    expect(parseDayDestination('semana 1 día 4')).toEqual({ week: 1, weekday: 4 }));
  test('"s1 jueves" shorthand → week 1, weekday 4', () =>
    expect(parseDayDestination('s1 jueves')).toEqual({ week: 1, weekday: 4 }));
  test('day name first "jueves semana 1" → week 1, weekday 4', () =>
    expect(parseDayDestination('jueves semana 1')).toEqual({ week: 1, weekday: 4 }));
  test('accents tolerated "semana 2 miércoles" → weekday 3', () =>
    expect(parseDayDestination('semana 2 miércoles')).toEqual({ week: 2, weekday: 3 }));
  test('"domingo" with no week → weekday 7, week null', () =>
    expect(parseDayDestination('domingo')).toEqual({ week: null, weekday: 7 }));
  test('no weekday → error the endpoint can 400', () => {
    expect(parseDayDestination('semana 1')).toHaveProperty('error');
  });
  test('out-of-season week → error', () => {
    expect(parseDayDestination('semana 13 lunes')).toHaveProperty('error');
  });
  test('empty input → error', () => {
    expect(parseDayDestination('')).toHaveProperty('error');
  });
});

describe('parsePastedText', () => {
  test('lifts a leading day name and keeps the session body', () => {
    const r = parsePastedText('Martes\nFUERZA — Tren inferior\n5 rounds Back Squat');
    expect(r.day_of_week).toBe(2);
    expect(r.dow).toBe('Martes');
    expect(r.session_text).toContain('Back Squat');
    expect(r.session_text).not.toContain('Martes');
    expect(r.stimulus).toBeNull();
  });

  test('no leading day → unknown day, full text is the session', () => {
    const r = parsePastedText('5 rounds Back Squat c/2\'30"');
    expect(r.day_of_week).toBeNull();
    expect(r.dow).toBeNull();
    expect(r.session_text).toContain('Back Squat');
  });

  test('empty paste → all null', () => {
    expect(parsePastedText('   ')).toEqual({
      day_of_week: null,
      dow: null,
      stimulus: null,
      session_text: null,
    });
  });
});

// File-reading suite: runs against the REAL workbook. Skips gracefully if the
// xlsx is absent (it lives at docs/ in the canonical checkout).
const hasFile = existsSync(PLAN_XLSX);
const fileTest = hasFile ? test : test.skip;

describe('readPlanWorkbook (real workbook)', () => {
  fileTest('estandar Semana 1 → 7 days, Lunes has TEST, Martes has Back Squat', async () => {
    const [wk] = await readPlanWorkbook(PLAN_XLSX, 'estandar', [1]);
    expect(wk).toBeDefined();
    expect(wk!.week).toBe(1);
    expect(wk!.sheet).toBe('Semana 1');
    expect(wk!.fell_back).toBe(false);
    expect(wk!.days).toHaveLength(7);

    const lunes = wk!.days.find((d) => d.day_of_week === 1)!;
    const martes = wk!.days.find((d) => d.day_of_week === 2)!;
    expect(lunes.dow).toBe('Lunes');
    expect(lunes.session_text).toContain('TEST');
    expect(martes.dow).toBe('Martes');
    expect(martes.session_text).toContain('Back Squat');

    // Capa 1 stimulus is populated too.
    expect(lunes.stimulus).toBeTruthy();
    // Domingo is a rest day.
    const domingo = wk!.days.find((d) => d.day_of_week === 7)!;
    expect(domingo.session_text?.toUpperCase()).toContain('DESCANSO');
  });

  fileTest('variant fuerza week 1 reads the "Fue S1" sheet', async () => {
    const [wk] = await readPlanWorkbook(PLAN_XLSX, 'fuerza', [1]);
    expect(wk!.sheet).toBe('Fue S1');
    expect(wk!.fell_back).toBe(false);
    expect(wk!.days).toHaveLength(7);
  });

  fileTest('variant fuerza week 6 falls back to "Semana 6" and flags it', async () => {
    const [wk] = await readPlanWorkbook(PLAN_XLSX, 'fuerza', [6]);
    expect(wk!.sheet).toBe('Semana 6');
    expect(wk!.fell_back).toBe(true);
    expect(wk!.days).toHaveLength(7);
  });

  fileTest('multi-week + variant resistencia read together', async () => {
    const weeks = await readPlanWorkbook(PLAN_XLSX, 'resistencia', [1, 2]);
    expect(weeks.map((w) => w.sheet)).toEqual(['Res S1', 'Res S2']);
    for (const w of weeks) expect(w.days).toHaveLength(7);
  });
});

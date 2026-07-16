import { describe, expect, test } from 'vitest';
import {
  composeDeadline,
  formatCatalogForPrompt,
  type CatalogExercise,
} from '@/lib/dashboard/coach/ai/compose-week';
import { prescriptionGrammarLines } from '@fahybrid/shared/domain/prescription';

const CATALOG: CatalogExercise[] = [
  { id: 3479, name: 'Run', modality: 'run', category: 'cardio' },
  { id: 3480, name: 'Rowing', modality: 'row', category: 'cardio' },
  { id: 42, name: 'Back Squat', modality: 'strength', category: 'strength' },
  { id: 43, name: 'Burpee', modality: 'functional', category: 'plyometric' },
];

describe('formatCatalogForPrompt', () => {
  test('sends every id the model may pick, grouped by modality', () => {
    const out = formatCatalogForPrompt(CATALOG);
    for (const e of CATALOG) expect(out).toContain(`${e.id} = ${e.name}`);
    expect(out).toContain('run:');
    expect(out).toContain('strength:');
  });

  test('does NOT narrow a small catalog — hiding the exercise a session needs is the worse failure', () => {
    // The real catalog has ONE running exercise; filtering it away over a
    // mis-guessed modality hint would leave the model unable to prescribe a run.
    const out = formatCatalogForPrompt(CATALOG, ['strength']);
    expect(out).toContain('3479 = Run');
  });
});

describe('prescription grammar prompt', () => {
  test('is derived from the schema, so a new scheme reaches every prompt for free', () => {
    const text = prescriptionGrammarLines().join('\n');
    for (const scheme of ['amrap', 'emom', 'intervals', 'hyrox_sim', 'sets']) {
      expect(text).toContain(scheme);
    }
    for (const modality of ['run', 'row', 'ski', 'strength', 'functional']) {
      expect(text).toContain(modality);
    }
  });

  test('names the strict-schema traps explicitly', () => {
    const text = prescriptionGrammarLines().join('\n');
    // `.strict()` drops the line over a plural, so the prompt has to say it.
    expect(text).toMatch(/"note" \(SINGULAR\)/);
    expect(text).toMatch(/per_500m/);
  });
});

describe('composeDeadline', () => {
  test('leaves headroom under the route maxDuration of 180s', () => {
    const now = 1_000_000;
    const budget = composeDeadline(now) - now;
    expect(budget).toBeGreaterThan(60_000);
    // Measured: one retrying session took the whole week to 171s. The budget must
    // stop a retry well before the 180s wall, or the coach gets nothing at all.
    expect(budget).toBeLessThan(180_000);
  });
});

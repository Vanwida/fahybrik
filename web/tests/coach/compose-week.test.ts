import { describe, expect, test } from 'vitest';
import {
  composeConcurrency,
  composeDeadline,
  formatCatalogForPrompt,
  mapWithConcurrency,
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
  test('stops retries with room to finish under the route maxDuration of 300s', () => {
    const now = 1_000_000;
    const budget = composeDeadline(now) - now;
    expect(budget).toBeGreaterThan(60_000);
    // A retry costs ~70-90s. The budget must leave room for one to FINISH inside
    // the route's 300s, or the coach gets a timeout instead of a flagged week.
    const RETRY_WORST_CASE_MS = 90_000;
    const ROUTE_MAX_DURATION_MS = 300_000;
    expect(budget + RETRY_WORST_CASE_MS).toBeLessThan(ROUTE_MAX_DURATION_MS);
  });
});

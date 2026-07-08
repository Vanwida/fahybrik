// Regression: a fresh coach (0 levels) clicking "Crear mi primer nivel" opens a
// create draft. The empty-state placeholder must yield so the create panel can
// render — otherwise the button is dead (Pablo's fresh-coach bug). Pure logic,
// no DB / no DOM.
import { describe, expect, test } from 'vitest';
import { showLevelsEmptyState } from '@/components/v2/periodizacion/niveles-empty-state';

describe('showLevelsEmptyState (Niveles empty-state gate, #periodizacion fresh-coach fix)', () => {
  test('fresh coach, idle (0 levels, no draft) → show the empty state', () => {
    expect(showLevelsEmptyState(0, false)).toBe(true);
  });

  test('THE BUG: 0 levels but a draft is open → HIDE the empty state so the create panel renders', () => {
    expect(showLevelsEmptyState(0, true)).toBe(false);
  });

  test('has levels → never the empty state (with or without a draft)', () => {
    expect(showLevelsEmptyState(3, false)).toBe(false);
    expect(showLevelsEmptyState(3, true)).toBe(false);
  });
});

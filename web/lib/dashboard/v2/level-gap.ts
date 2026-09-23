// Por qué la ficha no sugiere nivel, en una línea, con lo que hay que hacer
// para que lo sugiera. El porqué lo decide el motor (`suggestLevelOnLadder`:
// no_levels / no_criteria / no_signals); aquí solo se dice y se enlaza.

import {
  levelSuggestionGap,
  type LevelSuggestion,
} from '@fahybrid/shared/domain/coach/level-criteria';

export interface LevelSuggestionGapLine {
  reason: 'no_levels' | 'no_criteria' | 'no_signals';
  text: string;
  action: { label: string; href: string };
}

/** Donde el coach crea sus niveles y define qué marca abre cada uno. */
export const LEVELS_SETTINGS_HREF = '/ajustes/metodo#niveles';
/** Donde se le aplica un test a un atleta (sus marcas salen de ahí). */
export const TESTS_HREF = '/programar/tests';

export function levelSuggestionGapLine(s: LevelSuggestion, axisLabel: string): LevelSuggestionGapLine | null {
  const text = levelSuggestionGap(s, axisLabel);
  if (text == null || s.status === 'suggested') return null;
  switch (s.status) {
    case 'no_levels':
      return { reason: s.status, text, action: { label: 'Crearlos en Ajustes › Método', href: LEVELS_SETTINGS_HREF } };
    case 'no_criteria':
      return { reason: s.status, text, action: { label: 'Define qué marca abre cada uno', href: LEVELS_SETTINGS_HREF } };
    case 'no_signals':
      return { reason: s.status, text, action: { label: 'Ponle un test', href: TESTS_HREF } };
  }
}

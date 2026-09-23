import { expect, test } from 'vitest';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';

test('sin tildes, en singular, por prefijo de palabra, ES y EN', () => {
  const idx = searchIndex('Sentadilla frontal 5×5 · Back Squat · Wall ball');
  expect(matchesQuery(idx, 'sentadillas')).toBe(true);
  expect(matchesQuery(idx, 'SQUAT')).toBe(true);
  expect(matchesQuery(idx, 'wall balls')).toBe(true);
  expect(matchesQuery(idx, 'front')).toBe(true);
  expect(matchesQuery(idx, 'remo')).toBe(false);
  expect(matchesQuery(searchIndex('Press de banca'), 'prés')).toBe(true);
  expect(matchesQuery(idx, '')).toBe(true);
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Un esquema: el SQL no nombra `set_executions.is_approach` (card 178).
// Production no tiene esa columna. Si vuelve a un SELECT, Carrera y
// assignment-detail caen otra vez con 42703.

const READERS = [
  'web/lib/dashboard/coach/session-actuals.ts',
  'web/lib/athlete/analytics/strength-work.ts',
  'web/lib/athlete/analytics/running-progress.ts',
  'web/lib/athlete/dobles-joint-summary.ts',
  'web/lib/sync/ingest-execution-segments.ts',
];

describe('set_executions · un esquema (card 178)', () => {
  it('ningún lector SQL nombra is_approach como columna', () => {
    const root = resolve(__dirname, '../../..');
    for (const rel of READERS) {
      const src = readFileSync(resolve(root, rel), 'utf8');
      expect(src, rel).not.toMatch(/\b(st|se)\.is_approach\b/);
    }
  });
});

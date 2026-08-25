import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveExecutionProvenance } from '@fahybrid/shared/domain/execution-merge';

const writer = readFileSync(
  resolve(process.cwd(), 'lib/sync/record-workout-execution.ts'),
  'utf8',
);

describe('execution provenance · quién firma al llegar dos veces', () => {
  it('el segundo payload, solo, firmaría treadmill (el tramo más largo de ESE envío)', () => {
    const first = deriveExecutionProvenance({
      segments: [{ source: 'pm5', duration_seconds: 600 }],
    });
    const second = deriveExecutionProvenance({
      segments: [{ source: 'treadmill', duration_seconds: 900 }],
    });
    expect(first.totals_source).toBe('concept2');
    expect(second.totals_source).toBe('treadmill');
  });

  it('totals_source coalescea existing-first: el primer no-nulo se queda', () => {
    expect(writer).toMatch(
      /totals_source = coalesce\(\s*workout_executions\.totals_source,\s*excluded\.totals_source/,
    );
    expect(writer).not.toMatch(
      /totals_source = coalesce\(\s*excluded\.totals_source,\s*workout_executions\.totals_source/,
    );
  });

  it('recorded_via coalescea existing-first, igual que HealthKit/Garmin/Polar', () => {
    expect(writer).toMatch(
      /recorded_via = coalesce\(\s*workout_executions\.recorded_via,\s*excluded\.recorded_via/,
    );
    expect(writer).not.toMatch(
      /recorded_via = coalesce\(\s*excluded\.recorded_via,\s*workout_executions\.recorded_via/,
    );
  });
});

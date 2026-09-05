import { describe, expect, it } from 'vitest';
import {
  corosSourceWorkoutRef,
  corosSportToModality,
  ingestCorosWorkout,
  shouldOfferLinkPrompt,
} from '@/lib/sync/ingest-coros';

describe('ingest-coros helpers (always-import, no auto-match)', () => {
  it('source_workout_ref is coros:<id>', () => {
    expect(corosSourceWorkoutRef('abc')).toBe('coros:abc');
  });

  it('asks only when a NEW row landed AND a planned assignment exists that day', () => {
    expect(shouldOfferLinkPrompt({ inserted: true, scheduledAssignmentId: '9' })).toBe(true);
    expect(shouldOfferLinkPrompt({ inserted: true, scheduledAssignmentId: null })).toBe(false);
    expect(shouldOfferLinkPrompt({ inserted: false, scheduledAssignmentId: '9' })).toBe(false);
  });

  it('maps common COROS sports without inventing a new modality bucket', () => {
    expect(corosSportToModality('Run')).toBe('run');
    expect(corosSportToModality('Indoor Row')).toBe('row');
    expect(corosSportToModality('unknown-xyz')).toBe('other');
  });

  it('legacy webhook ingest stays a no-op (MCP pull is the path)', async () => {
    await expect(ingestCorosWorkout(BigInt(1), { foo: 1 })).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { isWorkingSet } from '@fahybrid/shared/domain/strength';
import {
  approachFromPrescription,
  resolveIsApproach,
} from '@/lib/sync/ingest-execution-segments';

describe('isWorkingSet', () => {
  it('ausente y false son trabajo', () => {
    expect(isWorkingSet({})).toBe(true);
    expect(isWorkingSet({ is_approach: false })).toBe(true);
    expect(isWorkingSet({ status: 'done' })).toBe(true);
    expect(isWorkingSet({ status: 'scaled', is_approach: false })).toBe(true);
  });

  it('aproximación no es trabajo aunque esté hecha', () => {
    expect(isWorkingSet({ status: 'done', is_approach: true })).toBe(false);
    expect(isWorkingSet({ status: 'scaled', is_approach: true })).toBe(false);
  });

  it('un salto no es trabajo', () => {
    expect(isWorkingSet({ status: 'skipped' })).toBe(false);
    expect(isWorkingSet({ status: 'skipped', is_approach: true })).toBe(false);
  });
});

describe('resolveIsApproach', () => {
  const rx = {
    sets: [{ is_approach: true }, { is_approach: false }, {}],
  };

  it('el cable manda sobre la prescripción', () => {
    expect(resolveIsApproach(false, rx, 1)).toBe(false);
    expect(resolveIsApproach(true, rx, 2)).toBe(true);
  });

  it('si el cable omite, se lee la prescripción', () => {
    expect(resolveIsApproach(undefined, rx, 1)).toBe(true);
    expect(resolveIsApproach(undefined, rx, 2)).toBe(false);
    expect(resolveIsApproach(undefined, rx, 3)).toBe(false);
  });

  it('sin prescripción ni cable = trabajo', () => {
    expect(resolveIsApproach(undefined, null, 1)).toBe(false);
    expect(approachFromPrescription(null, 1)).toBeUndefined();
  });
});

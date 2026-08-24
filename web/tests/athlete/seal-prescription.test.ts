import { describe, expect, test } from 'vitest';
import { sealPrescriptionJson } from '@/lib/athlete/seal-prescription';
import type { AthleteAnchors } from '@fahybrid/shared/domain/prescription/resolve-relative';

const relative = {
  scheme: 'sets',
  modality: 'functional',
  target: { kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } },
};

const anchors: AthleteAnchors = {
  racePace: {},
  thresholdPace: {},
  competitionLoad: (slug) =>
    slug === 'hyrox-sled-push' ? { kind: 'sled', kg: 152 } : null,
};

describe('sealPrescriptionJson', () => {
  test('sin anclas, la plantilla relativa se queda igual', () => {
    expect(sealPrescriptionJson(relative, null)).toEqual(relative);
  });

  test('con anclas, el snapshot guarda el número, no el kind relative', () => {
    const sealed = sealPrescriptionJson(relative, anchors) as { target?: { kind?: string; value?: number } };
    expect(sealed.target).toEqual({ kind: 'kg', value: 152 });
    expect(JSON.stringify(sealed)).not.toContain('relative');
  });

  test('una prescripción absoluta no se toca', () => {
    const abs = { scheme: 'sets', modality: 'strength', target: { kind: 'kg', value: 80 } };
    expect(sealPrescriptionJson(abs, anchors)).toEqual(abs);
  });
});

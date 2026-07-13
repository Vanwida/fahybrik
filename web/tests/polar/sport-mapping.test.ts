// Pure unit tests for the Polar sport → Modality mapper.

import { describe, expect, test } from 'vitest';
import { polarSportToModality } from '@/lib/polar/sport-mapping';

describe('polarSportToModality', () => {
  test('maps the HYROX-relevant disciplines', () => {
    expect(polarSportToModality('RUNNING', 'OTHER')).toBe('run');
    expect(polarSportToModality('ROAD_RUNNING', undefined)).toBe('run');
    expect(polarSportToModality('TREADMILL_RUNNING', undefined)).toBe('run');
    expect(polarSportToModality(undefined, 'CYCLING')).toBe('bike');
    expect(polarSportToModality('MOUNTAIN_BIKING', undefined)).toBe('bike');
    expect(polarSportToModality('INDOOR_ROWING', null)).toBe('row');
    expect(polarSportToModality('STRENGTH_TRAINING', null)).toBe('strength');
    expect(polarSportToModality('FUNCTIONAL_TRAINING', null)).toBe('functional');
    expect(polarSportToModality('SKI_ERG', null)).toBe('ski');
  });

  test('detailed_sport_info wins over the coarse sport', () => {
    expect(polarSportToModality('RUNNING', 'STRENGTH_TRAINING')).toBe('run');
  });

  test('does NOT treat snow/water skiing as the ski-erg', () => {
    expect(polarSportToModality('CROSS_COUNTRY_SKIING', null)).toBeNull();
    expect(polarSportToModality('WATERSPORTS_WATERSKI', null)).toBeNull();
  });

  test('returns null for unknown / empty labels', () => {
    expect(polarSportToModality('SWIMMING', null)).toBeNull();
    expect(polarSportToModality(null, null)).toBeNull();
    expect(polarSportToModality(undefined, undefined)).toBeNull();
    expect(polarSportToModality('', '')).toBeNull();
  });
});

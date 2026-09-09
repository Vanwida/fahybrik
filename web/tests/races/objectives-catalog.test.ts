import { describe, expect, test } from 'vitest';
import {
  eventFamily,
  supportsHyroxGoalGap,
  HUNTER_RACE_VARIANTS,
  RUNNING_DISTANCE_PRESETS,
} from '@fahybrid/shared/domain/objectives/catalog';

describe('objectives catalog (FH-77)', () => {
  test('eventFamily maps type + series to picker families', () => {
    expect(eventFamily('hyrox', 'hyrox')).toBe('hybrid');
    expect(eventFamily('other', 'hunter_race')).toBe('hybrid');
    expect(eventFamily('running', null)).toBe('running');
    expect(eventFamily('crossfit', 'cf_open')).toBe('crossfit');
    expect(eventFamily('ocr', 'spartan')).toBe('ocr');
    expect(eventFamily('other', null)).toBe('other');
  });

  test('supportsHyroxGoalGap is hyrox-only', () => {
    expect(supportsHyroxGoalGap('hyrox')).toBe(true);
    expect(supportsHyroxGoalGap('deka')).toBe(false);
    expect(supportsHyroxGoalGap('other')).toBe(false);
    expect(supportsHyroxGoalGap(null)).toBe(false);
  });

  test('Hunter Race variants match ticket distances', () => {
    const legend = HUNTER_RACE_VARIANTS.find((v) => v.id === 'legend');
    const alpha = HUNTER_RACE_VARIANTS.find((v) => v.id === 'alpha');
    const sprinter = HUNTER_RACE_VARIANTS.find((v) => v.id === 'sprinter');
    expect(legend?.distance_km).toBe(13);
    expect(alpha?.distance_km).toBe(7);
    expect(sprinter?.distance_km).toBe(3.5);
    expect(legend?.stations).toBe(7);
  });

  test('running distance presets include 5k–marathon', () => {
    const meters = RUNNING_DISTANCE_PRESETS.filter((p) => p.meters != null).map((p) => p.meters);
    expect(meters).toContain(5000);
    expect(meters).toContain(10000);
    expect(meters).toContain(21100);
    expect(meters).toContain(42200);
  });
});

import { describe, expect, it } from 'vitest';
import {
  velocityBand,
  velocityBandRelative,
  DEFAULT_VELOCITY_BAND_CUTS,
} from '@fahybrid/shared/domain/strength/velocity-bands';

describe('velocityBand', () => {
  it('maps absolute m/s to green/yellow/orange/red', () => {
    expect(velocityBand(0.7, 0.9)).toBe('green');
    expect(velocityBand(0.45, 0.9)).toBe('yellow');
    expect(velocityBand(0.3, 0.9)).toBe('orange');
    expect(velocityBand(0.15, 0.9)).toBe('red');
  });

  it('hides when confidence is low', () => {
    expect(velocityBand(0.7, 0.2)).toBe('none');
    expect(velocityBand(null, 0.9)).toBe('none');
  });

  it('respects coach cuts', () => {
    const cuts = { greenMin: 0.8, yellowMin: 0.6, orangeMin: 0.4 };
    expect(velocityBand(0.7, 0.9, cuts)).toBe('yellow');
  });
});

describe('velocityBandRelative', () => {
  it('compares to baseline at same load', () => {
    expect(velocityBandRelative(0.5, 0.5, 0.9)).toBe('green');
    expect(velocityBandRelative(0.4, 0.5, 0.9)).toBe('orange');
    expect(velocityBandRelative(0.3, 0.5, 0.9)).toBe('red');
  });

  it('defaults exist and are ordered', () => {
    const { greenMin, yellowMin, orangeMin } = DEFAULT_VELOCITY_BAND_CUTS;
    expect(greenMin).toBeGreaterThan(yellowMin);
    expect(yellowMin).toBeGreaterThan(orangeMin);
  });
});

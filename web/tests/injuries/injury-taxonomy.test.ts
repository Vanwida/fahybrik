import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isOpen,
  normalizeZone,
  mapFunnelInjury,
  adaptationExcludesFromAdherence,
  INJURY_ZONES,
} from '@fahybrid/shared/domain/coach/injury-taxonomy';

describe('injury state machine (canTransition)', () => {
  it('activa → en_recuperacion / resuelta are valid', () => {
    expect(canTransition('activa', 'en_recuperacion')).toBe(true);
    expect(canTransition('activa', 'resuelta')).toBe(true);
  });
  it('en_recuperacion can flare back to activa or discharge to resuelta', () => {
    expect(canTransition('en_recuperacion', 'activa')).toBe(true);
    expect(canTransition('en_recuperacion', 'resuelta')).toBe(true);
  });
  it('resuelta is terminal for the episode (a relapse is a new injury)', () => {
    expect(canTransition('resuelta', 'activa')).toBe(false);
    expect(canTransition('resuelta', 'en_recuperacion')).toBe(false);
  });
  it('self-transition is never valid', () => {
    expect(canTransition('activa', 'activa')).toBe(false);
    expect(canTransition('resuelta', 'resuelta')).toBe(false);
  });
});

describe('isOpen', () => {
  it('activa + en_recuperacion are open; resuelta is not', () => {
    expect(isOpen('activa')).toBe(true);
    expect(isOpen('en_recuperacion')).toBe(true);
    expect(isOpen('resuelta')).toBe(false);
  });
});

describe('normalizeZone — unifies funnel codes, iOS labels, English', () => {
  it('maps every vocabulary of the same zone to one canonical code', () => {
    expect(normalizeZone('rodilla')).toBe('rodilla');
    expect(normalizeZone('Rodilla')).toBe('rodilla');
    expect(normalizeZone('knee')).toBe('rodilla');
    expect(normalizeZone('tobillo_pie')).toBe('tobillo_pie');
    expect(normalizeZone('Tobillo')).toBe('tobillo_pie');
    expect(normalizeZone('Espalda')).toBe('lumbar');
    expect(normalizeZone('lumbar')).toBe('lumbar');
    expect(normalizeZone('Muñeca')).toBe('muneca');
    expect(normalizeZone('hamstring')).toBe('isquios');
  });
  it('unknown / empty → otra, and every result is a valid enum member', () => {
    expect(normalizeZone('algo raro')).toBe('otra');
    expect(normalizeZone('')).toBe('otra');
    expect(normalizeZone(null)).toBe('otra');
    for (const raw of ['rodilla', 'Hombro', 'neck', 'xyz', null]) {
      expect(INJURY_ZONES).toContain(normalizeZone(raw));
    }
  });
});

describe('mapFunnelInjury — splits lesion_actual into severity + status', () => {
  it('leve → leve/activa; limita → moderada/activa; recuperandose → leve/en_recuperacion', () => {
    expect(mapFunnelInjury('leve')).toEqual({ severity: 'leve', status: 'activa' });
    expect(mapFunnelInjury('limita')).toEqual({ severity: 'moderada', status: 'activa' });
    expect(mapFunnelInjury('recuperandose')).toEqual({ severity: 'leve', status: 'en_recuperacion' });
  });
});

describe('adaptationExcludesFromAdherence — ONLY rest is excluded', () => {
  it('rest excludes; substituted/softened do NOT (they count via execution)', () => {
    expect(adaptationExcludesFromAdherence('rest')).toBe(true);
    expect(adaptationExcludesFromAdherence('substituted')).toBe(false);
    expect(adaptationExcludesFromAdherence('softened')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { prefillElements, RUN_ARCHETYPES } from '@/components/v2/editor/archetype-forms/run-structure/archetype-prefills';
import { flattenSegments, isRepeat, type Element, type Segment } from '@fahybrid/shared/domain/prescription';

// En carrera el "parado" rara vez se hace: lo habitual es un cambio de ritmo,
// no una parada (Alex, 12-ago). Los arquetipos con recuperación entre reps
// (series, pirámide) tienen que sembrar ESE caso por defecto — el que el
// coach de verdad usa la mayoría de las veces — no la excepción. `parado` /
// `caminar` siguen siendo legítimos y disponibles para reps cortas y casi
// máximas (cuestas), así que esos dos NO deben cambiar.

function flatten(elements: Element[]): Segment[] {
  return flattenSegments([{ role: 'main', elements }]);
}

function recoverySegments(id: Parameters<typeof prefillElements>[0]): Segment[] {
  return flatten(prefillElements(id)).filter((s) => s.kind === 'recovery');
}

describe('prefillElements — el caso habitual de recuperación es el default', () => {
  it('series: recupera trotando con objetivo, no parado sin objetivo', () => {
    const recoveries = recoverySegments('series');
    expect(recoveries.length).toBeGreaterThan(0);
    for (const r of recoveries) {
      expect(r.recovery_mode).toBe('trote');
      expect(r.target).not.toBeNull();
    }
  });

  it('pirámide: las cuatro recuperaciones trotan con objetivo', () => {
    const recoveries = recoverySegments('piramide');
    expect(recoveries).toHaveLength(4);
    for (const r of recoveries) {
      expect(r.recovery_mode).toBe('trote');
      expect(r.target).not.toBeNull();
    }
  });
});

describe('prefillElements — parado/caminar sin objetivo siguen disponibles donde son honestos', () => {
  it('cuestas: reps cortas y casi máximas recuperan caminando, sin objetivo — no se toca', () => {
    const recoveries = recoverySegments('cuestas');
    expect(recoveries.length).toBeGreaterThan(0);
    for (const r of recoveries) {
      expect(r.recovery_mode).toBe('caminar');
      expect(r.target).toBeNull();
    }
  });

  it('fartlek ya traía trote con objetivo — sigue igual, es la referencia que no falló', () => {
    const recoveries = recoverySegments('fartlek');
    expect(recoveries.length).toBeGreaterThan(0);
    for (const r of recoveries) {
      expect(r.recovery_mode).toBe('trote');
      expect(r.target).not.toBeNull();
    }
  });
});

describe('prefillElements — cobertura del enum entero', () => {
  it('cada arquetipo del catálogo produce elementos válidos sin lanzar', () => {
    for (const a of RUN_ARCHETYPES) {
      const els = prefillElements(a.id);
      expect(els.length).toBeGreaterThan(0);
    }
  });

  it('progresivo no lleva recuperación — es esfuerzo continuo a propósito, y sigue sin llevarla', () => {
    expect(recoverySegments('progresivo')).toHaveLength(0);
  });

  it('todo Repeat del catálogo respeta los límites de la gramática (2..20 veces)', () => {
    for (const a of RUN_ARCHETYPES) {
      for (const el of prefillElements(a.id)) {
        if (isRepeat(el)) {
          expect(el.times).toBeGreaterThanOrEqual(2);
          expect(el.times).toBeLessThanOrEqual(20);
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { computeHrRecovery60, type RunningTraceSeries } from '@fahybrid/shared/domain/running/hr-recovery';

const series = (offsets_s: number[], values: number[]): RunningTraceSeries => ({ offsets_s, values });

// Espeja HRRecoveryCapture (ios/FAHYBRIK/Workout/HRRecovery.swift): mismos
// umbrales (cola de 10 s, marca a 60 s, tolerancia ±5 s, cobertura a 58 s),
// mismo criterio de honestidad (sin cobertura o caída negativa → null).

describe('computeHrRecovery60 — camino feliz', () => {
  it('calcula la caída cuando hay cola del esfuerzo y cobertura real a los 60 s', () => {
    const effort_end_s = 1000;
    const hr = series(
      [992, 995, 998, 1000, 1058, 1060, 1062],
      [170, 170, 170, 170, 145, 145, 145],
    );
    expect(computeHrRecovery60({ hr, effort_end_s })).toBe(25);
  });

  it('redondea cada media a entero ANTES de restar, igual que el motor de iOS', () => {
    const effort_end_s = 100;
    // Cola: media (170+171)/2 = 170.5 → redondea a 171 (half-up).
    const hr = series([95, 100, 158, 160], [170, 171, 150, 150]);
    expect(computeHrRecovery60({ hr, effort_end_s })).toBe(21); // 171 - 150
  });
});

describe('computeHrRecovery60 — cobertura', () => {
  it('sin ninguna muestra a partir de los 58 s post-esfuerzo, null (un corte a los 57 s NO vale)', () => {
    const effort_end_s = 1000;
    const hr = series([995, 1000, 1053, 1056], [170, 170, 150, 150]); // banda ±5s de 1060, ninguna >= 1058
    expect(computeHrRecovery60({ hr, effort_end_s })).toBeNull();
  });

  it('sin ninguna muestra en la cola del esfuerzo (−10s a 0s), null', () => {
    const effort_end_s = 1000;
    const hr = series([1058, 1060, 1062], [145, 145, 145]); // solo hay banda de recuperación, no hay hrEnd
    expect(computeHrRecovery60({ hr, effort_end_s })).toBeNull();
  });

  it('traza vacía, null', () => {
    expect(computeHrRecovery60({ hr: series([], []), effort_end_s: 1000 })).toBeNull();
  });
});

describe('computeHrRecovery60 — caída negativa es un artefacto, no un dato', () => {
  it('si el pulso subió en vez de bajar, null — nunca una caída negativa', () => {
    const effort_end_s = 1000;
    const hr = series([995, 1000, 1058, 1060], [140, 140, 150, 150]);
    expect(computeHrRecovery60({ hr, effort_end_s })).toBeNull();
  });

  it('una caída de exactamente 0 SÍ es un valor honesto (no mejoró, pero se sabe)', () => {
    const effort_end_s = 1000;
    const hr = series([995, 1000, 1058, 1060], [150, 150, 150, 150]);
    expect(computeHrRecovery60({ hr, effort_end_s })).toBe(0);
  });
});

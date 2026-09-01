// Pure unit tests for shared/domain/training-load/load-verdict.ts (#71) — la
// puerta del veredicto es el punto entero: los números tienen que sobrevivir
// SIEMPRE, y "apretando" sólo cuando las dos condiciones lo permiten.

import { describe, expect, test } from 'vitest';
import { buildRunningLoadReading, checkColdStart } from '@fahybrid/shared/domain/training-load/load-verdict';
import type { LoadSummary } from '@fahybrid/shared/domain/training-load/banister';

function summary(over: Partial<LoadSummary> = {}): LoadSummary {
  return {
    ctl: 62,
    atl: 71,
    tsb: -9,
    acr: 1.1,
    last_7d_tss: 497,
    last_28d_tss: 1736,
    known_seconds_28d: 100_000,
    unknown_seconds_28d: 0,
    unknown_sessions_28d: 0,
    ...over,
  };
}

describe('checkColdStart', () => {
  test('sin ninguna sesión: días null, no warmed_up, days_missing null', () => {
    expect(checkColdStart(null, 42)).toEqual({
      is_warmed_up: false,
      days_of_history: null,
      days_missing: null,
      ctl_window_days: 42,
    });
  });

  test('por debajo de la ventana: dice cuántos días faltan', () => {
    expect(checkColdStart(30, 42)).toEqual({
      is_warmed_up: false,
      days_of_history: 30,
      days_missing: 12,
      ctl_window_days: 42,
    });
  });

  test('igual o por encima de la ventana: warmed_up, 0 días faltan', () => {
    expect(checkColdStart(42, 42)).toMatchObject({ is_warmed_up: true, days_missing: 0 });
    expect(checkColdStart(118, 42)).toMatchObject({ is_warmed_up: true, days_missing: 0 });
  });
});

describe('buildRunningLoadReading — los números sobreviven siempre', () => {
  test('reproduce el ejemplo del mockup: fondo 62, reciente 71, frescura −9, apretando', () => {
    const res = buildRunningLoadReading({
      summary: summary({ ctl: 62, atl: 71, tsb: -9 }),
      days_of_history: 118,
      ctl_window_days: 42,
      freshness_alert_tsb: -8,
    });
    expect(res).toMatchObject({ ctl: 62, atl: 71, tsb: -9, allows_verdict: true, is_alert: true });
  });

  test('tsb por encima del umbral: números iguales, sin aviso', () => {
    const res = buildRunningLoadReading({
      summary: summary({ tsb: -3 }),
      days_of_history: 118,
      ctl_window_days: 42,
      freshness_alert_tsb: -8,
    });
    expect(res.allows_verdict).toBe(true);
    expect(res.is_alert).toBe(false);
  });

  test('el corte es inclusivo: tsb exactamente en el umbral SÍ dispara el aviso', () => {
    const res = buildRunningLoadReading({
      summary: summary({ tsb: -8 }),
      days_of_history: 118,
      ctl_window_days: 42,
      freshness_alert_tsb: -8,
    });
    expect(res.is_alert).toBe(true);
  });

  test('arranque en frío: allows_verdict false Y is_alert false, PERO ctl/atl/tsb siguen ahí', () => {
    const res = buildRunningLoadReading({
      summary: summary({ tsb: -20 }), // muy por debajo del umbral
      days_of_history: 10,
      ctl_window_days: 42,
      freshness_alert_tsb: -8,
    });
    expect(res.allows_verdict).toBe(false);
    expect(res.is_alert).toBe(false); // nunca un aviso sin margen para pronunciarlo
    expect(res.ctl).toBe(62);
    expect(res.atl).toBe(71);
    expect(res.tsb).toBe(-20); // el número crudo no se esconde ni se trunca
    expect(res.cold_start).toMatchObject({ is_warmed_up: false, days_of_history: 10, days_missing: 32 });
  });

  test('hueco de cobertura: allows_verdict false aunque el atleta lleve calendario de sobra', () => {
    const res = buildRunningLoadReading({
      summary: summary({ tsb: -20, known_seconds_28d: 1000, unknown_seconds_28d: 5000 }), // cobertura muy baja
      days_of_history: 118,
      ctl_window_days: 42,
      freshness_alert_tsb: -8,
    });
    expect(res.coverage.allows_verdict).toBe(false);
    expect(res.allows_verdict).toBe(false);
    expect(res.is_alert).toBe(false);
    expect(res.tsb).toBe(-20); // el número sigue ahí
  });

  test('sin ninguna sesión ejecutada: arranque en frío por days_of_history null, nunca un error', () => {
    const res = buildRunningLoadReading({
      summary: summary({ ctl: 0, atl: 0, tsb: 0, known_seconds_28d: 0, unknown_seconds_28d: 0 }),
      days_of_history: null,
      ctl_window_days: 42,
      freshness_alert_tsb: -8,
    });
    expect(res.allows_verdict).toBe(false);
    expect(res.cold_start.days_of_history).toBeNull();
    expect(res.cold_start.days_missing).toBeNull();
  });
});

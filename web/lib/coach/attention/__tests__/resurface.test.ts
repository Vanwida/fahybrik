import { describe, expect, it } from 'vitest';
import {
  isSuppressed,
  type SuppressionItem,
  type SuppressionOverride,
} from '../resurface';

const NOW = new Date('2026-06-18T09:00:00.000Z');

function item(partial: Partial<SuppressionItem> = {}): SuppressionItem {
  return {
    signal_kind: 'hrv_crash',
    severity: 'warning',
    value_numeric: -12,
    ...partial,
  };
}

function override(partial: Partial<SuppressionOverride> = {}): SuppressionOverride {
  return {
    snoozed_until: null,
    dismissed_at: null,
    resurface_on_new_signal: true,
    baseline_value_at_override: null,
    ...partial,
  };
}

describe('isSuppressed', () => {
  it('no override → not suppressed', () => {
    expect(isSuppressed(item(), null, NOW)).toBe(false);
  });

  it('active snooze (future) suppresses', () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(isSuppressed(item(), override({ snoozed_until: future }), NOW)).toBe(true);
  });

  it('expired snooze (past) does not suppress', () => {
    const past = new Date(NOW.getTime() - 60 * 60 * 1000);
    expect(isSuppressed(item(), override({ snoozed_until: past }), NOW)).toBe(false);
  });

  it('dismiss with no worsening suppresses', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: -12,
    });
    // same severity (warning) and value unchanged → no resurface
    expect(isSuppressed(item({ severity: 'warning', value_numeric: -12 }), ov, NOW)).toBe(true);
  });

  it('dismiss with severity worsening (warning → critical) resurfaces', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: -12,
    });
    expect(isSuppressed(item({ severity: 'critical', value_numeric: -20 }), ov, NOW)).toBe(false);
  });

  it('dismiss with value worsening past baseline (>=25% magnitude growth) resurfaces', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: -12,
    });
    // -12 → -16 is a 33% magnitude growth, same warning tier → resurfaces
    expect(isSuppressed(item({ severity: 'warning', value_numeric: -16 }), ov, NOW)).toBe(false);
  });

  it('dismiss with small value change (<25%) stays suppressed', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: -12,
    });
    // -12 → -13 is ~8% growth → still suppressed
    expect(isSuppressed(item({ severity: 'warning', value_numeric: -13 }), ov, NOW)).toBe(true);
  });

  it('dismiss with resurface_on_new_signal=false always suppresses, even when critical', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      resurface_on_new_signal: false,
      baseline_value_at_override: -12,
    });
    expect(isSuppressed(item({ severity: 'critical', value_numeric: -40 }), ov, NOW)).toBe(true);
  });

  it('override row with neither snooze nor dismiss does not suppress', () => {
    expect(isSuppressed(item(), override(), NOW)).toBe(false);
  });

  it('snooze wins while active even if also dismissed', () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000);
    const ov = override({
      snoozed_until: future,
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      resurface_on_new_signal: true,
    });
    expect(isSuppressed(item({ severity: 'critical' }), ov, NOW)).toBe(true);
  });

  // ── mig 0212: tier y dedupe capturados al silenciar ────────────────────────

  it('un crítico dado por hecho NO reaparece solo por seguir siendo crítico', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: 31,
      severity_at_override: 'critical',
      dedupe_key: 'readiness_low:1:2026-06-17',
    });
    const live = item({
      signal_kind: 'readiness_low',
      severity: 'critical',
      value_numeric: 30,
      dedupe_key: 'readiness_low:1:2026-06-17',
    });
    expect(isSuppressed(live, ov, NOW)).toBe(true);
  });

  it('readiness: bajar ≥ 25 % desde el valor silenciado lo devuelve (más bajo = peor)', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: 40,
      severity_at_override: 'warning',
      dedupe_key: 'readiness_low:1:2026-06-15',
    });
    const base = { signal_kind: 'readiness_low', severity: 'warning' as const, dedupe_key: 'readiness_low:1:2026-06-15' };
    expect(isSuppressed(item({ ...base, value_numeric: 29 }), ov, NOW)).toBe(false);
    // Subir no es empeorar.
    expect(isSuppressed(item({ ...base, value_numeric: 55 }), ov, NOW)).toBe(true);
  });

  it('una instancia NUEVA (otro dedupe_key) sale aunque la anterior esté hecha', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      severity_at_override: 'warning',
      dedupe_key: 'week_adjustment_pending:1:10',
    });
    const fresh = item({
      signal_kind: 'week_adjustment_pending',
      severity: 'warning',
      value_numeric: null,
      dedupe_key: 'week_adjustment_pending:1:11',
    });
    expect(isSuppressed(fresh, ov, NOW)).toBe(false);
  });

  it('pospuesto 3 d: si pasa de vigilar a crítico, rompe el aplazamiento', () => {
    const future = new Date(NOW.getTime() + 2 * 86_400_000);
    const ov = override({ snoozed_until: future, severity_at_override: 'warning' });
    expect(isSuppressed(item({ severity: 'critical' }), ov, NOW)).toBe(false);
    expect(isSuppressed(item({ severity: 'warning' }), ov, NOW)).toBe(true);
  });

  it('las propuestas no «empeoran» por valor: solo por tier o por ser otra', () => {
    const ov = override({
      dismissed_at: new Date(NOW.getTime() - 3600_000),
      baseline_value_at_override: 1,
      severity_at_override: 'warning',
      dedupe_key: 'programming_status:1:no_month',
    });
    const live = item({
      signal_kind: 'programming_status',
      severity: 'warning',
      value_numeric: 9,
      dedupe_key: 'programming_status:1:no_month',
    });
    expect(isSuppressed(live, ov, NOW)).toBe(true);
  });
});

